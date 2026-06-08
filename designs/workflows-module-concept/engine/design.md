# Workflows Engine

The server-side workflow engine — the WorkflowAPI Lowdefy connection, the three request handlers (`StartWorkflow`, `SubmitWorkflowAction`, `CancelWorkflow`), the references-spread write contract, the tracker subscription mechanism, and the signal-driven FSM transition model.

> **Transition model: see [state-machine](../state-machine/design.md).** This sub-design's Decision 4 was originally the status-enum priority rule with a `force: true` escape hatch. The [state-machine](../state-machine/design.md) sub-design supersedes it: every status mutation is now the result of a named **signal** resolved against a per-kind FSM table (`(currentStatus, signal) → newStatus`); there is no priority rule and no `force: true`. Decision 4 below is rewritten to the signal/FSM model; the canonical signal inventory and the per-kind FSM tables live in [state-machine](../state-machine/design.md).

This sub-design owns the runtime that makes workflows work. The YAML surface that drives the engine comes from [action-authoring](../action-authoring/design.md); the module APIs that call into the engine come from [module-surface](../module-surface/design.md); the page templates that read engine output come from [ui](../ui/design.md).

## Problem

The module commits the data model (workflows + actions collections, status-array history with newest at index 0, references spread to root) and the engine semantics (signal-driven FSM transitions, eager summary writeback, auto-complete check, tracker lifecycle mirroring). What's not yet decided:

- The plugin package's server-side scaffolding — `@lowdefy/modules-mongodb-plugins` is client-side only today.
- Whether the references write contract enforces reserved-keys via validation throws or merge-order silence.
- How the engine resolves signals against the per-kind FSM tables at runtime (Decision 4; tables in [state-machine](../state-machine/design.md)).
- The subscription mechanism for child-workflow → tracker-action updates (synchronous in-process vs change-stream vs other).
- Universal action fields handling — `assignees`, `due_date`, `description` merged into per-action writes atomically with status transitions.
- The `keys: [...]` payload shape on `SubmitWorkflowAction`.

This sub-design covers all of the above.

## Decision 1 — Plugin shape

**Add a server-side `WorkflowAPI` connection to `@lowdefy/modules-mongodb-plugins`.**

The package is client-side only today (`types.js` declares `connections: []`, `requests: []`). Adding the server-side connection is bootstrapping a new capability for the package — a discrete chunk of v1 work.

### Connection structure

```
src/connections/WorkflowAPI/
  WorkflowAPI.js                    # 4-line shell that registers handlers
  SubmitWorkflowAction/
    SubmitWorkflowAction.js        (~25 lines — handler entry point)
    handleSubmit.js                 # lifecycle orchestration (validate → pre-hook → writes → side effects → post-hook)
    invokePreHook.js                # context.callApi to action.hooks[signal].pre
    invokePostHook.js               # context.callApi to action.hooks[signal].post
    computeAutoUnblocks.js          # walks blocked_by, identifies actions to unblock
    dispatchLogEvent.js             # context.callApi to events.new-event with merged event payload
    dispatchNotifications.js        # context.callApi to notifications.send-notification
    fireGroupOnComplete.js          # context.callApi per completed_groups entry (action-groups D6)
    createAction.js                 (~30 lines)
    updateAction.js                 (~40 lines)
    utils/{shouldUpdate,shouldCreate,getCurrentAction}.js
  StartWorkflow/
    StartWorkflow.js                (~25 lines)
    createActions.js                (~70 lines)
  CancelWorkflow/
    CancelWorkflow.js
  shared/
    createMongoDBConnection.js
    getActionFields.js
    getActions.js
    populateIds.js
```

`shared/` helpers:

- `createMongoDBConnection.js` — wraps `@lowdefy/community-plugin-mongodb`'s `MongoDBCollection.requests`. Called with the Lowdefy request context (`{ blockId, connection, connectionId, pageId, requestId }`), returns a function that takes a MongoDB collection name and gives back the full set of community-plugin request handlers (`MongoDBFind`, `MongoDBFindOne`, `MongoDBInsertOne`, `MongoDBUpdateOne`, etc.) bound to that collection. Handlers in the engine read and write via `mongoDBConnection('workflows').MongoDBFindOne({...})`-style calls; client lifecycle, pooling, BSON serialization, and `changeLog` writes are owned by the community plugin.
- `getActions.js` — bulk fetch of action docs by `workflow_id` via `MongoDBFind` (used by auto-complete check and summary writeback).
- `getActionFields.js` — given a payload `action_id`, returns the on-disk action's current core fields via `MongoDBFindOne` with a projection (`_id`, `workflow_id`, `type`, `key`, `kind`, `status`, `entity_id`, `entity_collection`) so the handler can resolve the FSM transition for the fired signal (the lookup keys on `kind` + current `status`) and pick up `entity_collection` / `entity_id` for write context.
- `populateIds.js` — generates server-side `_id` for newly-created action docs (`_uuid: true` equivalent). Action `_id`s are server-generated, not caller-supplied.

### Entity-agnostic field shape

Action docs and workflow docs use scalar `entity_id` + `entity_collection` — not a per-entity-key array shape. This is a load-bearing invariant: it rules out an action belonging to multiple entities at once, which is what makes `get-entity-workflows` a single indexed lookup (`{ entity_collection, entity_id }`) instead of a join. The cross-entity case — "this lead has an installation ticket whose workflow we want reflected here" — is handled by the `tracker:` block on a normal single-entity tracker action ([action-authoring](../action-authoring/design.md) Decision 5), not by attaching the action to multiple entities.

**`entity_collection` is the connection id of the entity's MongoDB collection** (e.g. `leads-collection`, `tickets-collection`) and is the sole entity-identity scalar — no separate named-kind field rides alongside it. Storing the collection on the action and workflow docs makes them self-describing: a reader can find the referenced entity directly. This matches the files module's pattern ([modules/files/api/save-file.yaml](../../../modules/files/api/save-file.yaml) stores `collection` + `doc_id` on every file doc) so cross-module reporting / list pages / custom views can pivot uniformly. Tracker actions additionally carry `child_workflow_id` (the child workflow's `_id`), `child_entity_id`, and `child_entity_collection`; child workflows carry `parent_entity_collection` next to `parent_entity_id`. Reserved-keys list extends accordingly.

### Capabilities

- **`StartWorkflow` writes both a workflow doc and N action docs.** The workflow doc carries `key`, `display_order`, initial `status: [{ stage: 'active', created }]`, empty `form_data`, empty `summary`. When the caller passes `parent_action_id`, the workflow doc also records `parent_action_id` and `parent_entity_id` (read from the parent tracker action) — and the same handler invocation writes the parent tracker action's `child_workflow_id` (the new workflow's `_id`), `child_entity_id`, `child_entity_collection`, and transitions it to `in-progress`. See "Parent ↔ child link shape" under Decision 3.
- **`summary` writeback in `SubmitWorkflowAction`** — eager strategy: recompute the parent workflow's `summary: { done, not_required, total }` after each transition.
- **Auto-complete check** — when all actions on a workflow reach a terminal stage (`done` or `not-required`), push `{ stage: 'completed' }` to the workflow's `status` history.
- **`references` field handling** — see "References write contract" below.
- **Tracker subscription handler** — see "Tracker subscription mechanism" below; runs synchronously after each workflow status write.
- **Signal-driven FSM transitions** — see Decision 4 below.
- **`SubmitWorkflowAction` payload uses `keys: [...]` only** — no singular `key` field on action entries. The plugin flat-maps over `keys` before per-action processing: omitted → one op with `key: null`; `[]` → zero ops; `[k]` → one op with `key: k`; `[k1, k2, ...]` → N ops one per key. The on-disk action doc keeps singular `key`; only the plugin's input shape unifies. The `(workflow_id, type, key)` unique index is unchanged. **Footgun:** `keys: []` is silent — when authors compute `keys` from a possibly-empty payload field (e.g. `_array.map: { on: _payload: form.devices }`) and the user submits an empty form, the unblock silently no-ops with no error. Either the call site is fine with that (legitimate "no fan-out targets" case) or the author needs to gate the unblock with `skip` / `_if` on `keys.length` to surface the empty case as a form-validation error rather than a silent miss. The README's `unblocks` reference documents both shapes side-by-side.
- **Universal action fields handling.** The plugin reads `actions[].fields` from the `SubmitWorkflowAction` payload (see action-authoring sub-design) and merges it into the per-action `$set`. `fields.assignees` / `fields.due_date` / `fields.description` are written to the action doc's root alongside core fields. A null value clears the field; an omitted key leaves the existing value unchanged. Field writes are atomic with the status transition — the engine emits one update event covering both.
- **`CancelWorkflow` primitive** — pushes `cancelled` to workflow status; flips remaining open actions to `not-required`.
- **Access enforcement** — the engine runs the per-app, per-verb role gates from action-authoring's Decision 3 ("Action access semantics") at two server-side points: (1) **query-time in `get-entity-workflows`**, evaluating each verb's gate (`true` or a role-array) the action declares for the host app against the caller's `_user.apps.{app_name}.roles` and projecting a four-key `visible_verbs: { view, edit, review, error }` bag onto each action. An action whose four bools are all `false` is dropped from the response — invisible to that user (preserving the old "no role intersection → invisible" outcome). (2) **submit-time inside the `SubmitWorkflowAction` handler**, mapping the interaction to its required verb (`submit_edit`/`not_required` → `edit`; `resolve_error` → `error`; `approve`/`request_changes` → `review`) and re-checking `access.{current_app}.{required_verb}` against `_user.apps.{current_app}.roles` before performing any writes; rejects with a structured error if the gate no longer passes (e.g. role revoked between page render and submit). This handler check is the authoritative gate; Lowdefy's central `api.roles` glob over the submit endpoint id is the coarse outer fence (Part 34 D10–D11). See action-authoring Decision 3 for the canonical access-semantics definition.
- **Action groups as a persisted engine concept** — workflows declare a top-level `action_groups:` array (see [action-authoring](../action-authoring/design.md) and [action-groups](../action-groups/design.md) Decision 1). The workflow doc carries a `groups: [{ id, status, summary }]` array with derived three-value status (`blocked` / `in-progress` / `done`); written back eagerly inside `SubmitWorkflowAction` as part of the handler's ordered steps (see "Ordering relative to other engine work"). `blocked_by` entries accept both action types and group IDs; the engine resolves group references against `groups[].status`. The `SubmitWorkflowAction` return value carries `completed_groups: [...]` listing groups that transitioned to `done` in the call; the engine fans out one `context.callApi` per declared `on_complete` engine-internally as step 11 of the submit-pipeline lifecycle (see action-groups Decision 6, submit-pipeline Decision 1). Group state lives alongside `summary` on the workflow doc; the same drift / reconciliation risk class applies.

### Package shape changes (`@lowdefy/modules-mongodb-plugins/package.json`)

- Add `@lowdefy/community-plugin-mongodb` to `peerDependencies` (the engine imports `MongoDBCollection` from it; consumers already install the community plugin as part of their Lowdefy app, so peerDep is the right placement — no double-installs).
- `@lowdefy/helpers` is already a peerDep (server-side available).
- Add `src/connections/WorkflowAPI/` directory with the handler files.
- Update `src/types.js` to register the connection. The existing pattern in upstream Lowdefy plugins (e.g. `@lowdefy/community-plugin-mongodb`) is `connections: Object.keys(connections)` plus `requests: Object.keys(connections).map(c => Object.keys(connections[c].requests)).flat()`, where the connection module exports a `{ schema, requests: { RequestType: handlerFn } }` object per connection. Add `src/connections.js` re-exporting `WorkflowAPI`, then point `types.js` at it. Currently `connections: []` and `requests: []` are both empty.

**Bump the package version** to the next minor and update the workflows module's `plugins:` entry to require it.

### Dual-runtime build — a v1 milestone, not a config tweak

The plugin package is client-only today: every existing file under `src/blocks/`, `src/actions/`, `src/metas.js` runs in the browser; peer deps are React / Antd / `@lowdefy/blocks-*`; `.swcrc` has `jsx: true` and `transform.react.runtime: classic`. Adding `WorkflowAPI` puts the package on both runtimes for the first time. Treat the dual-runtime split as its own implementation milestone:

- **Hard split in `src/`.** Client code stays in `src/blocks/`, `src/actions/`, `src/metas.js`. Server code lives in `src/connections/WorkflowAPI/` and `src/connections.js` (the re-export wired into `types.js`). Server files import only Node / Mongo / `@lowdefy/helpers`; client files don't import from `src/connections/`. The directory boundary is the contract.
- **SWC config audit.** `.swcrc`'s `jsx: true` and React-runtime transform should be no-ops for files that don't contain JSX, but verify by building and inspecting `dist/connections/WorkflowAPI/*.js` — no `React.createElement` references, no `jsx-runtime` imports, no `import 'react'` should appear in any server-side output. If they do, the SWC config needs per-directory overrides.
- **Dependency placement.** `mongodb` goes into `dependencies` (server needs it at runtime). `@lowdefy/helpers` is already a peerDep. React stays a peerDep — apps only need it for the client blocks. Document in the README which deps are which.
- **Verification step before shipping.** Build the package, list `dist/connections/WorkflowAPI/` contents, grep for `react`/`React`/`jsx`. Smoke-test that the workflows module's `plugins:` entry can install the package and Lowdefy's plugin loader discovers `WorkflowAPI` from `types.js`.

Treat this as a deliverable, not "verify the SWC config emits clean entry points" — the package has never produced a server bundle, so the spike is real work.

### Client and transaction model

The `WorkflowAPI` handler delegates every MongoDB read and write to `@lowdefy/community-plugin-mongodb`'s `MongoDBCollection` request handlers — the same plumbing every other module in this repo uses for its YAML-side reads and writes. The engine wraps that surface in a thin per-collection dispatcher (`createMongoDBConnection`) built once at handler entry and reused across every sub-step inside the call.

Concrete handler shape, matching Lowdefy's connection-handler signature (`async ({ request, connection, ... }) => result`):

```js
// src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js
async function SubmitWorkflowAction(lowdefyContext) {
  const { connection, request } = lowdefyContext;
  const context = {
    mongoDBConnection: createMongoDBConnection(lowdefyContext),
    workflowsConfig: connection.workflowsConfig,
    actionsEnum: connection.actionsEnum,
    changeStamp: connection.changeStamp,
    params: request,
  };
  return handleSubmit(context); // all sub-steps share `context`
}
```

`context.mongoDBConnection` is a function — call it with a MongoDB collection name (`'workflows'` or `'actions'`) and you get back the full set of community-plugin request handlers (`MongoDBFind`, `MongoDBFindOne`, `MongoDBInsertOne`, `MongoDBInsertMany`, `MongoDBUpdateOne`, etc.) bound to that collection. Each call inside the dispatcher looks like:

```js
const action = await context.mongoDBConnection("actions").MongoDBFindOne({
  query: { _id: actionId },
  options: {
    projection: {
      /* ... */
    },
  },
});

await context.mongoDBConnection("actions").MongoDBInsertOne({ doc });
```

The `pushWorkflowStatus` pseudo-code in [Decision 3](#decision-3--tracker-subscription-mechanism) uses this same dispatcher.

Connection lifecycle, pooling, BSON serialization, and `changeLog` writes are owned by the community plugin. Every community-plugin handler opens a fresh `MongoClient` per request and closes it in a `finally` block — the same posture every other module accepts. The engine adds no client management of its own. The `changeLog` block on the consuming app's `WorkflowAPI` connection config flows through to every dispatched request, so workflow + action mutations land in the app's `log-changes` collection automatically — no per-handler code.

**Cost note.** Each helper-issued request opens and closes its own `MongoClient`. Driver-side pooling makes this cheap in steady state but it is a real per-request cost — a single `SubmitWorkflowAction` invocation issues N reads + N writes + side-effect `context.callApi` calls, each of which is a separate connect/close cycle. Acceptable for v1 (same posture every other module in this repo accepts); revisit only if a real consumer surfaces latency.

**No Mongo transactions in v1.** The implementation is sequential writes through the dispatcher — ordering is preserved (step N completes before step N+1 begins), but atomicity is not (if step N fails, steps 1..N-1 are durable). This is the same risk class as the existing `summary` writeback drift; the "Failure-mode story" mitigations apply and periodic reconciliation is the catch-all. What the design guarantees is **sequential writes + idempotent retry** (per the Idempotency sub-section), not all-or-nothing rollback. Transactions are not available through the community-plugin dispatcher; if a future consumer needs ACID across a submit, the engine would need a parallel raw-driver path — out of scope for v1.

> **Supersedes [engine review-1's "Client and transaction model" resolution](designs/workflows-module-concept/engine/review/review-1.md).** Review-1 settled on a single-`MongoClient`-per-invocation raw-driver shape that threaded `ctx = { client, workflowsCollection, actionsCollection }` through every sub-step. This section walks that back to the community-plugin dispatcher — see [review-2.md](designs/workflows-module-concept/engine/review/review-2.md) for the rationale (prior-generation engine code is dispatcher-shaped and reusable; community plugin owns `changeLog` integration; alignment with every other module in the repo; transactional opt-in was already marked as deferred so its loss costs nothing in v1).

**The two `MongoDBCollection` exports (`workflows-collection`, `actions-collection`) are separate connections with their own client lifecycles** — they don't share state with `WorkflowAPI`. The split is intentional: `WorkflowAPI` owns the engine-managed write paths (with FSM transition resolution, tracker subscription, summary writeback all running inside one client invocation), while the `MongoDBCollection` exports give apps direct read access for custom views, ad-hoc aggregations, list pages, or dedicated reporting that doesn't need to go through the engine. Apps that want app-specific indexes on `*_ids` reference fields layer them via the collection connections without touching engine internals. See [module-surface](../module-surface/design.md) Decision 1 for the full exported-connections list.

## Decision 2 — References write contract

The `references` map is spread onto the doc root at write time. Queries against the stored doc are flat (`{ company_ids: 'C1' }`), matching the shape consumers already use against the events module's `log-events` collection — but the contract here is enforced inside the plugin handler, not by the YAML routine layer the events module uses.

**Shape of `references` in the call payload.** One map per call, applied to all docs that call writes:

- `StartWorkflow` — `references` in the call payload is spread onto the workflow doc and onto every starting action doc.
- `SubmitWorkflowAction` — `references` at the call level is spread onto every action being written; per-action overrides on individual `actions[].references` are supported but rare.
- `CancelWorkflow` — `references` is rarely used; if supplied, spread onto the workflow doc on the `cancelled` status push.

**Storage shape.** No `references` key on the stored doc — the map is unwrapped and spread to root. Queries are flat (`{ company_ids: 'C1' }`); indexes live at root. Apps add Mongo indexes on whichever `*_ids` keys they query; the module ships indexes only for core fields.

**Update semantics.** `SubmitWorkflowAction` uses **replace per-key**: a call passing `references: { company_ids: [C2] }` replaces the doc's `company_ids` field but leaves other root-level reference fields (`deal_ids`, `region_ids`, etc.) untouched. Same as Mongo's `$set` semantics.

**Reserved-keys enforcement — merge order, not validation.** The plugin builds the doc by spreading `references` first, then layering core fields on top via `_object.assign`-equivalent semantics:

```js
// pseudo-code in createAction.js
const doc = {
  ...actionUpdate.references, // spread first
  // core fields layered last so they override any collision
  _id: actionId,
  workflow_id: currentAction.workflow_id,
  type: actionUpdate.type,
  entity_id: currentAction.entity_id,
  entity_collection: currentAction.entity_collection,
  // universal action fields — also reserved
  ...(actionUpdate.fields ?? {}),
  // change stamps generated server-side from the handler's context — not via
  // the events module's `change_stamp` component, since the plugin handler
  // doesn't evaluate Lowdefy operators. Apps that override `change_stamp` at
  // the events module entry get the override on event log writes, not on
  // workflow / action doc writes (these follow a fixed shape).
  created: {
    timestamp: new Date(),
    user: { id: ctx.user.id, name: ctx.user.profile?.name },
  },
  updated: {
    timestamp: new Date(),
    user: { id: ctx.user.id, name: ctx.user.profile?.name },
  },
  // ... other core fields ...
};
```

If `references.{key}` collides with a core field name, the core field wins silently. The stored doc is always correct. The README documents the **reserved-keys list** (`_id`, `workflow_id`, `type`, `entity_id`, `entity_collection`, `key`, `status`, `summary`, `created`, `updated`, `assignees`, `due_date`, `description`, `tracker`, `child_workflow_id`, `child_entity_id`, `child_entity_collection`, `parent_action_id`, `parent_entity_id`, `parent_entity_collection`, plus any other engine-managed keys) so authors know which keys to avoid; collisions from genuine app bugs surface as "the reference value I set didn't appear when I queried." The three universal fields (`assignees`, `due_date`, `description`) are reserved because they are user-editable engine-managed fields — apps that try to put `assignees` on `references` would have it silently overridden.

**Validation throws are deliberately not implemented in v1.** Merge-order silencing keeps the handler simple, the stored doc is always correct, and the reserved-keys list is small enough (~20 names) that the realistic failure mode is a developer surfacing "the reference value I set didn't appear when I queried" — debuggable without runtime errors. Build-time validation in `makeWorkflowsConfig` (catching collisions in static workflow YAML) and write-time validation in the plugin handlers (catching collisions in dynamic payloads) are purely-additive nice-to-haves if real apps surface confusion from silent overrides; they can land in any v1.x without breaking changes.

**App-defined index strategy.** The module ships indexes on core fields only. Apps populating `company_ids`, `deal_ids`, `region_ids`, etc. add their own Mongo index definitions wherever they manage indexes; out of scope for the module. The README documents this so authors know to add an index when they query by a reference key.

## Decision 3 — Tracker subscription mechanism

### Terminology

A **tracker action** is an action with `kind: tracker` and a `tracker:` block. It lives on a **parent workflow** and mirrors the lifecycle of a **child workflow**. The data flow is **child → parent**: when the child workflow's status changes, the engine looks up the parent tracker action (via the child's `parent_action_id` back-reference) and writes its status from the child-stage map. Trackers don't push state to the child; the child workflow runs independently and the parent's tracker action follows.

### Parent ↔ child link shape

The relationship between a tracker action and its child workflow is **bidirectional, established by `start-workflow` at child-workflow-creation time**:

- **Tracker action** (parent side) carries `child_workflow_id` (the child workflow doc's `_id`), `child_entity_id`, and `child_entity_collection`. All three are empty until the child workflow is started.
- **Child workflow doc** carries `parent_action_id`, `parent_entity_id`, and `parent_entity_collection` — back-references to the tracker action that's mirroring it. All empty for top-level (non-child) workflows.

Both sides are written in **one `start-workflow` call**, not two. The trigger action's submit hook calls `start-workflow` with `parent_action_id` set; the engine writes:

1. The new child workflow doc with `parent_action_id`, `parent_entity_id`, and `parent_entity_collection` populated (the latter two read off the parent tracker action's `entity_id` / `entity_collection`).
2. The N starting action docs for the child.
3. The parent tracker action's `child_workflow_id` (the new child workflow's `_id`), `child_entity_id`, and `child_entity_collection` fields, transitioned to `in-progress`.

All three writes happen inside one `WorkflowAPI` handler invocation on the shared client (see "Client and transaction model"). Authors no longer chain `start-workflow` + a follow-up submit — the engine owns the link setup.

**Why all three fields (`child_workflow_id`, `child_entity_id`, `child_entity_collection`).** Each does different work:

- `child_workflow_id` is the strong identifier for the linked child workflow doc. The engine's tracker subscription uses the bidirectional back-reference (child workflow's `parent_action_id` → tracker action's `_id`) for its own lookups, so the engine doesn't strictly require `child_workflow_id` to be stored on the parent. But apps need it for queries like "find tracker actions referencing this workflow id" and for direct UI navigation to the child workflow surface (e.g. an admin tool that wants to drill into the workflow doc itself, not the entity around it).
- `child_entity_id` + `child_entity_collection` are the entity-side reference. UI navigation from a tracker action's `status_map` link typically routes to the child entity's view page (entities have human-facing names; workflow docs don't), so the entity reference is what apps render against.
- Together they let apps choose the navigation target — entity page or workflow doc — without joining through the child workflow doc.

All three are populated in the single `start-workflow` call when `parent_action_id` is set. Empty for tracker actions that haven't yet been linked (e.g. an action newly in `action-required` whose corresponding child entity / workflow hasn't been created yet).

**Why this isn't `key`.** Earlier drafts overloaded the action doc's `key` field — for fan-out actions, `key` is a domain id (e.g. a device serial number); for tracker actions, it was the child workflow's `_id`. The overloading was load-bearing only on the engine side and confusing for authors. With this design, `key` keeps its fan-out role (domain ids for per-row actions) and trackers get the dedicated `child_workflow_id` / `child_entity_id` / `child_entity_collection` fields. The `(workflow_id, type, key)` unique index still applies to trackers (with `key: null`).

### Mechanism — synchronous in-process within `SubmitWorkflowAction`

When `SubmitWorkflowAction` writes a workflow's `status[0].stage`, the same handler — before returning — looks up the parent tracker action via the workflow's `parent_action_id` back-reference and applies the hard-coded child-stage map (defined in [action-authoring](../action-authoring/design.md)). No event bus, no async machinery, no separate consumer process. It's part of the handler's normal flow.

Pseudo-code:

```js
// Child workflow stage → the tracker signal the engine emits against the parent
// tracker action. The tracker kind's FSM table (state-machine sub-design) maps
// each signal to the parent status, conditional on the tracker's current state.
const CHILD_STAGE_SIGNAL = {
  active: "internal_mirror_child_active", // → in-progress
  completed: "internal_mirror_child_completed", // → done
  cancelled: "internal_mirror_child_cancelled", // → not-required
};

// `eventId` is generated by the SubmitWorkflowAction handler on entry
// and threaded through every write in this invocation so they all share
// one event id for audit. The plugin handler signature is (per Lowdefy's
// connection-handler contract):
//   ({ blockId, connection, connectionId, pageId, request, requestId, payload }) => result
// `request.eventId` and `request.actions[]` are the per-call inputs;
// `context` below is the handler-local shape (`{ mongoDBConnection, ... }`)
// returned by createMongoDBConnection — see "Client and transaction model".

async function pushWorkflowStatus(context, workflowId, newStage, eventId) {
  const { mongoDBConnection } = context;
  // 0. Idempotency guard — workflow status pushes are no-op when the new stage
  //    equals the current top-of-stack. Without this, retries (and any double-
  //    call from concurrent writers) would $push a second `{ stage: completed }`
  //    onto the workflow's status history, breaking the "status[0] = current
  //    stage" invariant and double-firing tracker subscription downstream. See
  //    "Workflow-status idempotency" below.
  const current = await mongoDBConnection("workflows").MongoDBFindOne({
    query: { _id: workflowId },
    options: {
      projection: { status: 1, workflow_type: 1, parent_action_id: 1 },
    },
  });
  if (current?.status?.[0]?.stage === newStage) return;

  // 1. Write the workflow's status (existing behaviour)
  const workflow = await writeWorkflowStatus(
    context,
    workflowId,
    newStage,
    eventId,
  );

  // 2. If this workflow has a parent tracker action, look it up by primary key.
  //    The link is bidirectional: child workflow's `parent_action_id` points at
  //    the tracker action's `_id`. No reverse-lookup index needed — `_id` is
  //    the primary key, served by the default `{ _id: 1 }` index.
  if (!current.parent_action_id) return; // top-level workflow, nothing to mirror
  const tracker = await mongoDBConnection("actions").MongoDBFindOne({
    query: { _id: current.parent_action_id },
  });
  if (!tracker) return; // tracker may have been removed; tolerate

  // 3. Map the child stage to its tracker signal and emit it against the parent.
  const signal = CHILD_STAGE_SIGNAL[newStage];
  if (!signal) return; // unmapped child stage → no signal, no parent update
  await emitSignal(context, {
    currentActionId: null,
    actions: [{ type: tracker.type, key: tracker.key, signal }],
    eventId, // reuse the same eventId — the tracker action update is part of this transition
  });
  // No `force`. The tracker FSM (state-machine sub-design) accepts
  // internal_mirror_child_* from `done` / `not-required`, so a child that
  // re-activates or completes after the tracker had landed terminal recovers
  // the parent — the backward-move case engine D4 previously needed `force: true`
  // for. `emitSignal` resolves transitions[tracker.kind][tracker.status][signal];
  // an unlisted entry no-ops silently.
}
```

Single tracker per child by construction: a child workflow has at most one `parent_action_id`. The loop over multiple matching parents in earlier drafts is gone — a child can only mirror to one parent. Apps that need the same physical event to drive multiple parents either spawn one child workflow per parent or model the dependency via shared state read independently by each parent.

### Why synchronous in-process

Three alternatives were considered:

- **In-process event emitter.** Adds an indirection (publish/subscribe) for no decoupling benefit — the plugin owns both writer and tracker-update handler, so direct calls match the data flow. Rejected.
- **MongoDB change-stream consumer.** A separate process tails the `workflows` collection's oplog and runs tracker logic on every status write. Multi-server safe by construction, captures direct DB writes (migrations, admin tools), but adds a long-running process to the deployment, requires resume-token discipline, and runs trackers in a separate transaction from the trigger write. **Deferred** — no current trigger forces this. Re-open if multi-process writers, direct DB writes, or migration tooling become real.
- **App-side imperative chaining (no engine subscription).** Each submit handler that triggers a workflow transition explicitly updates the tracker. Fragile because every lifecycle handler must remember to call the tracker update. Rejected.

Synchronous in-process wins because:

- **Sequential writes + idempotent retry.** Tracker writes share the same dispatcher built once at handler entry ([Decision 1 "Client and transaction model"](#client-and-transaction-model)) — ordering is preserved across the recursion (step N completes before step N+1 starts), and the idempotency guards ([Decision 3 "Idempotency"](#idempotency)) make a retried submission converge to the same end state. Each individual write opens its own `MongoClient` via the community plugin; pooling makes this cheap in steady state. The atomicity story is the same risk class as the existing `summary` writeback — no new failure surface relative to what the engine already accepts. Transactions are not available through the dispatcher; a future ACID path would require a parallel raw-driver helper.
- **No new infrastructure.** No background process, no oplog tailing, no resume tokens.
- **Multi-server safe by construction.** Each server's plugin instance handles whatever writes go through it; trackers update in the same process.
- **Matches the data-flow shape.** Tracker updates _are_ part of "what happens when a workflow's status changes." Modelling them as follow-up steps in the same handler is the most direct expression.

### Parent lookup is primary-key, not reverse-index

The bidirectional link replaces the reverse-lookup partial index used in earlier drafts. When a child workflow's status changes, the engine reads `parent_action_id` off the child workflow doc and fetches the parent tracker action by primary key (`_id`). The default `{ _id: 1 }` index serves the lookup; no additional reverse-lookup index on the `actions` collection is needed.

**One child, one parent — by construction.** Each child workflow has at most one `parent_action_id`. Apps that need the same physical event (e.g. an installation visit) to unblock multiple parent workflows either spawn one child workflow per parent (one installation tracking workflow per parent that depends on it) or model the dependency via shared entity state that each parent reads independently — both shapes are cleaner than engine-side multi-parent mirroring.

### Auto-complete recursion

When a tracker action transitions to `done` via this mechanism, the parent workflow's auto-complete check runs as part of the same `SubmitWorkflowAction` invocation. If all parent's actions are now terminal, the parent workflow auto-completes, which fires this same tracker-update logic for any tracker actions tracking _it_. Recursion depth is bounded in practice because typical workflow nestings are 1–2 levels deep.

**The engine doesn't statically prove acyclicity.** Without a relationship registry, there's no metadata for the engine to walk in advance to confirm the parent/child workflow graph is acyclic. Pathological app code — e.g. parent A's tracker action tracks workflow B, whose tracker action tracks workflow A — could in principle recurse. Cycles are rare in real apps because they require app code to deliberately link parents to grandchildren; the design accepts the risk for v1. If it surfaces operationally, the engine adds a runtime depth-limit guard that fails with a clear error citing the recursion chain at, say, 10 levels.

### Idempotency

Tracker updates are just additional signal emissions through the same `SubmitWorkflowAction` handler — same FSM resolution, same `eventId`, same audit chain. The `eventId` is reused so all writes triggered by one user submission share one event id.

Two distinct idempotency stories matter:

- **Action signal emissions** are guarded by the FSM tables ([Decision 4](#decision-4--signal-driven-fsm-transitions)). Re-firing a signal against an action that has already moved past the signal's reach no-ops: the transition lands the action in a state that no longer lists that signal, so the second emission resolves to an undefined cell and writes nothing. E.g. re-firing `approve` against a `done` action (`done` has no `approve` transition) is a silent no-op; re-firing `unblock` against an already-unblocked `action-required` action is a silent no-op (this re-fire safety is the structural guarantee the priority rule used to provide — see state-machine sub-design "Signal source-state principle"). The protection is automatic from the table.
- **Workflow status pushes** are not signal-driven and not covered by the FSM. The workflow lifecycle enum (`active`, `completed`, `cancelled`) doesn't have a natural priority ordering — its legal transitions are `active → completed` and `active → cancelled`, not a strict-less-than relationship. Instead, `pushWorkflowStatus` reads the workflow's current `status[0].stage` first and no-ops when it equals the new stage (see the guard at step 0 of the pseudo-code above). Without this, a retried auto-complete would `$push` a second `{ stage: 'completed' }` onto the workflow's status history, breaking the "current stage = `status[0]`" invariant, polluting the audit history, and double-firing tracker subscription on the no-op transition. The same-stage no-op is the narrow, retry-safe behaviour the engine needs. Legal-transition enforcement on workflow status (rejecting `completed → active`, etc.) is a separate concern, deferred to v1.x.

### Failure-mode story

If the tracker update throws after the workflow status write succeeded, the workflow doc is in `completed` (or whatever new stage) but the tracker is still in its previous stage. The handler's sub-steps share the dispatcher returned by `createMongoDBConnection` ([Decision 1 "Client and transaction model"](#client-and-transaction-model)) but each community-plugin request opens its own `MongoClient` — and they are **not** wrapped in a transaction in v1. A mid-sequence failure leaves earlier writes durable, later steps unrun. Same risk model as the `summary` writeback. Mitigations:

- **Idempotent retry on next read of the parent workflow.** The `get-entity-workflows` API can detect "workflow's status[0] is terminal but tracker referencing it isn't" and queue a tracker reconciliation. Optional; cheap.
- **Periodic reconciliation job.** Walk workflows in terminal stages; verify their trackers are also terminal; correct any drift. Can run on a schedule. Listed in parent Risks.
- **Caller retry is safe by construction.** The idempotency guards ([Idempotency](#idempotency)) make a retried submission converge to the same end state, so the recommended recovery is "resubmit." Callers who got a partial-write error and retry will land on the correct end state without engine intervention.

Documented as the same risk-class as the summary writeback. Acceptable. Transactions are not available through the community-plugin dispatcher; a future ACID path would require a parallel raw-driver helper — see [Decision 1 "Client and transaction model"](#client-and-transaction-model) for the trade.

### Ordering relative to other engine work

The full 11-step submit lifecycle (validate → pre-hook → writes → side effects → post-hook → return) is owned by [submit-pipeline Decision 1](../submit-pipeline/design.md#decision-1--submitworkflowaction-replaces-updateworkflowactions). Engine ownership inside that lifecycle covers steps 1, 3–8, 9–12 (validation, auto-unblock computation, action transitions, summary + groups recompute, form_data writes, workflow-doc updates, side-effect dispatch, tracker subscription). The internal write-ordering within one `SubmitWorkflowAction` call:

1. **Validate.** Payload shape, action exists, action belongs to caller's accessible workflows, the per-verb access gate passes — `access.{current_app}.{interaction-required-verb}` intersects `_user.apps.{current_app}.roles` (or is `true`) — and the signal name is known (unknown signal names throw — see Decision 4). (Submit-pipeline lifecycle step 1.)
2. **Compute auto-unblocks.** Walk the workflow's `blocked_by` graph; for each action whose dependencies are now terminal, stage an `unblock` signal. Merge pre-hook `actions[]` signals (precedence) with auto-unblocks. (Lifecycle steps 3–4.)
3. **Resolve and write action transitions.** For each staged signal, resolve `transitions[kind][currentStatus][signal]`; write the resulting status (unlisted cell = no-op, no write). (Lifecycle step 5.)
4. **Recompute affected groups' statuses**; write `groups[]` back to the workflow doc ([action-groups](../action-groups/design.md) Decision 4). (Lifecycle step 6.)
5. **Re-evaluate `blocked_by`** for every blocked action in the workflow against the new group/action state; push `action-required` on those whose dependencies are now terminal ([action-groups](../action-groups/design.md) Decision 2 unblock).
6. **Auto-complete check** on the workflow if all actions are terminal — push `completed` to workflow status. Re-run after step 5 since step 5 may have transitioned more actions.
7. **Write `form_data`** per-field `$set` (Decision 5 layout); write workflow-doc updates (summary, groups, form_data) in one Mongo update where possible. (Lifecycle steps 7–8.)
8. **Generate log event + dispatch notifications + fire group `on_complete`** via `context.callApi` (submit-pipeline Decision 6; the engine fans out one call per completed group's `on_complete` Api id). (Lifecycle steps 9–11.)
9. **Tracker subscription**: if step 6 pushed a workflow status, run the synchronous in-process subscription via internal `emitSignal` recursion (firing the `internal_mirror_child_*` signal against the parent tracker action). (Lifecycle step 12.)
10. **Recompute the workflow's `summary`** (eager writeback).
11. **Return** `{ action_ids, completed_groups, event_id, tracker_fired?, pre_hook_response?, post_hook_response? }` — `completed_groups` lists groups that transitioned to `done` in step 4 (see [action-groups](../action-groups/design.md) Decision 5); `tracker_fired` is populated when step 9 propagated to a parent.

Pre-hook (lifecycle step 2) and post-hook (lifecycle step 13) are bracketed around this engine-internal sequence by submit-pipeline; they aren't part of the engine's own ordering concerns beyond hosting the calls via `context.callApi`.

Step 9 happens after step 6 and before step 10 because tracker writes themselves trigger their own auto-complete chain — a tracker action going `done` can complete its parent workflow. Doing summary writeback after lets it reflect the final state. Implementation verifies this ordering.

**Summary recompute is idempotent — redundant in nested cases, by design.** When tracker subscription recurses, the inner `emitSignal` invocations each run their own auto-complete check + summary recompute against their own workflow. The outer call's step 10 then runs against the original workflow, which the recursion has already touched. The duplicate recompute is correct (reads N actions, writes one summary doc) and idempotent — the second write produces the same `{ done, not_required, total }` as the first. The cost is bounded by recursion depth (≤ 10 in practice; see "Auto-complete recursion") and the alternative (tracking visited workflow IDs to dedupe) adds complexity for negligible gain at this scale.

### Worked example: 2-level nested auto-complete

Concrete scenario exercising the ordering with two levels of nesting. The example confirms `summary` writeback, tracker subscription, and the workflow-status idempotency guard ([Decision 3 "Idempotency"](#idempotency)) all compose correctly.

**Setup.** Two workflows on two entities, linked via the parent/child fields:

- **Workflow A** on a `lead` entity (`entity_collection: leads-collection`). Two actions: `qualify` (form, currently `in-review`) and `track-installation` (tracker, currently `in-progress`, `child_workflow_id = Workflow B._id`, `child_entity_id = ticket._id`, `child_entity_collection = tickets-collection`, `tracker.workflow_type = device-installation`). `parent_action_id` / `parent_entity_id` / `parent_entity_collection` are null — A is top-level.
- **Workflow B** on a `ticket` entity (`entity_collection: tickets-collection`), `workflow_type: device-installation`. One action: `install-device` (form, currently `in-review`). Workflow B's `status = [{ stage: 'active' }]`, `parent_action_id = track-installation._id`, `parent_entity_id = lead._id`, `parent_entity_collection = leads-collection` — populated when `start-workflow` was called with `parent_action_id` set.

A reviewer clicks Approve on `install-device` via the per-action endpoint `workflow-device-installation-install-device-submit` with `signal: approve`. The endpoint passes the payload straight through to `SubmitWorkflowAction`, which generates a fresh `eventId` on entry; the form FSM resolves `in-review → approve → done` (state-machine sub-design).

**Execution trace.**

```
emitSignal(currentActionId=install-device._id, actions=[{type: install-device, signal: approve}], eventId=E1)
│
├─ step 3 (resolve+write): form FSM in-review → approve → done; install-device.status = done
├─ step 6 (auto-complete check): all actions on Workflow B terminal? YES (only one action, done)
│   └─ pushWorkflowStatus(Workflow B, 'completed', E1)
│       ├─ same-stage guard: B.status[0] = 'active' !== 'completed' → proceed
│       ├─ writeWorkflowStatus(B, 'completed')   ($push completed onto B.status)
│       ├─ step 9 (tracker subscription): B.parent_action_id = track-installation._id → load tracker by primary key
│       │           tracker = mongoDBConnection('actions').MongoDBFindOne({ query: { _id: track-installation._id } })
│       └─ CHILD_STAGE_SIGNAL['completed'] = 'internal_mirror_child_completed'
│           └─ emitSignal(currentActionId=null, actions=[{type: track-installation, signal: internal_mirror_child_completed}], eventId=E1)
│               │
│               ├─ step 3 (resolve+write): tracker FSM in-progress → internal_mirror_child_completed → done; track-installation.status = done
│               ├─ step 6 (auto-complete check): all actions on Workflow A terminal? qualify is still in-review → NO
│               │           (no pushWorkflowStatus for A; recursion ends here)
│               ├─ step 9 (tracker subscription): skipped (no workflow status push in this branch)
│               └─ step 10 (summary recompute): recomputeSummary(Workflow A) → { done: 1, not_required: 0, total: 2 }   (track-installation now done)
├─ step 9 (tracker subscription): (covered by the inner recursion above)
└─ step 10 (summary recompute): recomputeSummary(Workflow B) → { done: 1, not_required: 0, total: 1 }
```

**End state.**

- Workflow B: `status = [{completed}, {active}]`, `summary = { done: 1, not_required: 0, total: 1 }`. Auto-completed. Still has `parent_action_id` and `parent_entity_id` populated.
- Workflow A: unchanged status array (`[{active}]` — `qualify` is still in-review, so A didn't auto-complete), `summary = { done: 1, not_required: 0, total: 2 }`. The `track-installation` tracker action reflects B's completion automatically.
- One `eventId` (E1) on every write — the user's single submission is one audit-chain event despite touching three docs across two workflows.

**Retry case.** If the caller retries the same per-action endpoint call (e.g. network blip after the response):

- `install-device` is already `done`; re-firing `approve` against `done` resolves to an undefined FSM cell (`done` has no `approve` transition) → silent no-op, no write.
- All of Workflow B's actions are still terminal, so step 6's auto-complete check runs `pushWorkflowStatus(B, 'completed', E1)` again.
- The same-stage guard catches `B.status[0].stage === 'completed'` and returns immediately. **No duplicate `$push` onto B.status**, no second tracker fire, no second recompute.
- Outer step 10 still recomputes A's summary — same result, idempotent write.

This is exactly the retry behaviour the idempotency guards are designed to provide.

**Variation: A auto-completes on the same call.** If `qualify` were already `done` before this submission, the inner `emitSignal` would find _all_ Workflow A actions terminal in its step 6 auto-complete check, push `completed` to A, and fire `pushWorkflowStatus(A, ...)` — which would read A's `parent_action_id` (null in this scenario, since A is top-level) and return early. The summary recompute in step 10 of both the inner and outer calls fires against A; both produce the same result. Bounded cost; correct end state.

## Decision 4 — Signal-driven FSM transitions

> Replaces the original priority-rule + `force: true` model. The canonical signal inventory and the per-kind FSM tables (form / check / tracker) are owned by the [state-machine](../state-machine/design.md) sub-design; this section covers how the engine consumes them.

Every status mutation is the result of a named **signal** fired against an action. The plugin's transition resolver (`shouldUpdate.js` → an FSM lookup) reads the action's `kind` and current `status[0].stage`, then looks up `transitions[kind][currentStatus][signal]`:

- **A listed cell** gives the new status; the engine writes it.
- **An unlisted cell** is a silent no-op — no write, no error. This is the structural guarantee that re-fires against states past a signal's reach (and signals against terminal states) can't regress an action — it replaces the priority rule's strict-less-than ordering.

**Three signal emitters, one resolution.** Signals come from (1) user button clicks (the page template surfaces the signal — see [state-machine](../state-machine/design.md) "Templates and buttons"), (2) engine cascades (`unblock` on `blocked_by` satisfaction, `internal_mirror_child_*` from the tracker subscription, `internal_cancel_action` from `CancelWorkflow`), and (3) pre-hook returns (`actions[]` entries against other actions). All three resolve through the same FSM lookup. There is no separate "user-driven vs auxiliary" code path — the old `currentActionId` self-exception is gone (the FSM tables list same-state transitions explicitly where wanted, e.g. `in-progress → progress → in-progress`).

**Where `currentActionId` comes from.** The per-action endpoint (`{workflow_type}-{action_type}-submit`, submit-pipeline) carries `action_id` in its payload; the `SubmitWorkflowAction` handler uses that value as `currentActionId` internally — "the action the user fired the signal against." The current action lands per that fired signal; a pre-hook cannot re-signal it. Every `actions[]` entry (unblocks, fan-outs, tracker writes) names its own *other* target and signal.

**Unknown signal names throw.** The signal vocabulary is engine-locked in v1 (the FSM tables aren't author-overridable), so the handler has a complete known-signal list at entry. A signal name not in that list is a programming error and throws (same posture as a missing `actions[]` target) — distinct from an *unlisted transition* (known signal, state doesn't accept it), which is the meaningful silent no-op. See [state-machine](../state-machine/design.md) review-1 finding 8.

**No `force: true`.** All mutations go through the FSM; there is no per-call or per-entry bypass. Migrations and admin overrides stay out-of-band (direct DB writes), same as today. Engine-internal write paths use explicit `internal_*` signals declared in the FSM tables (`internal_cancel_action`, `internal_mirror_child_*`) — the backward moves tracker writes used to need `force` for (e.g. a child uncancelling to push the parent `not-required → in-progress`) are now listed transitions in the tracker table.

**`priority` is display-only now.** The plugin reads the **static module-shipped enum** (see [action-authoring](../action-authoring/design.md) "Action status enum") for the canonical eight-name vocabulary, but the `priority` numbers no longer drive transition legality — they survive only to order statuses in pickers and visualizations. The same eight-name vocabulary is in effect across every consuming app; no per-app override at runtime.

## Decision 5 — Form data layout on the workflow doc

Form actions persist submitted form values on the **workflow doc**, not on the entity doc. (v0 stored form data on the entity doc; v1 reverses this so an entity carrying multiple workflows of different types doesn't collide field names, and so the workflows collection is the single source of truth for workflow state.)

### Storage paths

Per workflow doc — **one flat tree per action**, no reserved sub-keys for reviewer or error data:

```
form_data: {
  {action_type}: {
    {field}: <value>,           // all fields — submitter (form: blocks) and
                                //   reviewer (form_review: blocks) live in the
                                //   same flat namespace
  },
  {action_type_with_key}: {
    {key}: {                     // instance discriminator for keyed actions
      {field}: <value>,
    },
  },
}
```

### Path rules

- **Non-keyed action:** `form_data.{action_type}.{field}` — all values, submitter and reviewer alike, live directly under the action type.
- **Keyed action** (action-authoring Decision 9): `form_data.{action_type}.{key}.{field}` — one sub-object per instance key.
- **No `.review` namespace.** `form_review:` is a render-time concern (the review page renders these blocks alongside the read-only `form:` data), but submitted values write to the same flat tree as `form:`. Authors who declare both `form:` and `form_review:` must use non-colliding field names — the same constraint that already applies to fields within a single `form:` block.
- **No `.error` namespace.** Error context lives on the `events` collection entry written by step 7 of the submit lifecycle, surfaced via `event_overrides.metadata` from a pre-hook return — same channel as every other status push ([Part 29 § D2a](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#d2a-status-entry-shape-simplification-docstypesreturn-field-cleanup)). Status entries themselves are uniform `{ stage, created, event_id }`.

### Write semantics

`form_data.{action}` must accumulate across **multiple submits of different shapes** within one action namespace (submit → approve, draft → draft → submit, changes-required → resubmit): a later write must not wipe a sibling sub-key an earlier write set. This is a *sequential* requirement — concurrency (two writers, different fields, same workflow) is handled separately by CAS on `workflow.updated` ([Part 38 D15](../../workflows-module/parts/_completed/38-engine-rebuild/design.md)), not by the write shape.

The per-action endpoint payload (submit-pipeline) carries form data as a flat map under `form` / `form_review`; the handler merges them into one payload bag. Submitter (`form:`) and reviewer (`form_review:`) blocks share the flat `form_data.{action_type}.{field}` tree under one **uniform merge rule** — the engine doesn't disambiguate between them.

Part 38 implements this as a **whole-doc `$set`** of the planned workflow doc (no per-field dot-path `$set`), where `planFormDataMerge` **deep-merges the submitted fields onto the loaded `form_data.{action}` sub-object** (deep-merge objects; replace arrays/scalars/`null` whole). Sibling sub-keys survive because they're already in the loaded base; clearing is explicit (`field: null`), not by omission. See [Part 38 Q6](../../workflows-module/parts/_completed/38-engine-rebuild/design.md) for the full rationale and the per-channel-vs-uniform decision.

### No reserved sub-keys

Earlier drafts reserved `review` and `error` as sub-keys under `form_data.{action_type}`. v1 drops both:

- **Reviewer fields** share the action-type namespace with submitter fields. Authors pick non-colliding names the same way they already do inside a single `form:` block. The v0 corpus did this without trouble (reviewer fields under `form.validation.*`, submitter fields elsewhere in the same tree).
- **Error context** lives on the `events` collection entry, not on the action doc's status entry. Status entries are uniform `{ stage, created, event_id }`. The recovery surface (`-error` page) reads diagnostic context from the events-log entry referenced by `status[0].event_id` (carried into the event by a pre-hook's `event_overrides.metadata`). See [Part 29 § D2a](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#d2a-status-entry-shape-simplification-docstypesreturn-field-cleanup).

This collapses two reserved keys to zero. `makeWorkflowsConfig` no longer needs to validate against the list.

### Engine effects

- `start-workflow` initialises `form_data: {}` on the workflow doc.
- `SubmitWorkflowAction` writes form fields atomically with the status transition (same Mongo update).
- `get-entity-workflows` returns `form_data` alongside the workflow doc — pages reading per-action data fetch from the workflow doc, not from a separate request.
- `cancel-workflow` leaves `form_data` intact (audit trail preserved).

### Transitioning an action to `error`

`error` is purely an **author-driven** domain stage ([Part 29 § D1–D4](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md)). The engine never sets `error` itself — engine sub-step failures **throw**, and the throw surfaces as an API-level reject/error toast (submit-pipeline), not an action-status transition. The action does not pick up a synthetic `error` entry that nobody designed for.

Entry paths into `error` (both form and check kind):

1. **Pre-hook `error` signal.** The author-deliberate "this downstream action has failed" signal ([state-machine](../state-machine/design.md) inventory). A pre-hook fires `error` against another action via `actions: [{ type, signal: error }]`; the form/check FSM accepts it from every non-terminal state (`action-required`, `in-progress`, `in-review`, `changes-required`, `blocked`) → `error`. This replaces the v0 pre-hook `actions: [{ ..., status: 'error' }]` return. (To fail the *current* submission, `:reject` / `throw` — not an `error` signal against self.) Failure context rides on the events-log entry via `event_overrides.metadata`.
2. **External systems.** Backend microservices, scheduled lambdas, or other out-of-band writers push `error` directly (direct DB write). A follow-on injection API is deferred ([Part 29 § Out of scope](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#out-of-scope--deferred)).

Status entries are uniform `{ stage, created, event_id }` — no polymorphic `reason` / `error_message` / `error_metadata` fields. The on-disk shape is identical regardless of which entry path was used.

**Recovery (action leaves `error`).** Recovery is a normal submission from the `-error` page — the user clicks the template-shipped `resolve_error` button, which calls the per-action endpoint with `signal: resolve_error`. The form FSM resolves `error → resolve_error → in-review` ([state-machine](../state-machine/design.md)); the previous `status` entry stays in the array as audit history. No `force`, no special-cased recovery leg — `resolve_error` is an ordinary signal with an ordinary FSM transition. No `form_data` cleanup needed since error context was never written there.

## Risks

- **Plugin dual-runtime build complexity.** First-time server-side code in a package that currently ships React blocks. Treated as a v1 milestone (see [Decision 1 "Dual-runtime build"](#dual-runtime-build--a-v1-milestone-not-a-config-tweak)) with its own verification step: hard split between `src/blocks/` and `src/connections/`, dist/-output grep for React leakage, plugin-loader smoke test before declaring done.
- **No transactional atomicity in v1.** The `WorkflowAPI` handler runs sub-steps sequentially through the community-plugin dispatcher; each request opens and closes its own `MongoClient`, and there is no transaction wrapping the sequence. A mid-sequence failure leaves earlier writes durable and later steps unrun — same risk class as the existing `summary` writeback drift. Mitigation: caller retry is safe (the idempotency guards converge to the same end state), plus periodic reconciliation as the catch-all. Transactions are not available through the community-plugin dispatcher; a future ACID path would require a parallel raw-driver helper.
- **Connection-per-call cost.** Each helper-issued request opens and closes its own `MongoClient` via the community plugin. Driver-side pooling makes this cheap in steady state but a single `SubmitWorkflowAction` invocation issues many separate connect/close cycles. Acceptable for v1 (same posture every other module in this repo accepts); revisit if a real consumer surfaces latency.
- **Consumer-owned indexes.** Engine assumes the three indexes documented in [the spec § Indexes](spec.md#indexes) exist; engine code doesn't assert them at runtime (the dispatcher delegates to community-plugin handlers that don't expose a startup hook). Drift risk if consumers skip the index creation step in their migration pipeline. Mitigation: required-indexes section in the workflows module README (same convention as every other module in this repo).
- **Workflow-doc write contention** under highly-parallel workflows. Mitigation: provide a `summary_dirty: true` lazy-writeback fallback as an opt-in mode (set per workflow YAML), so apps with high parallelism can defer the recompute. Default stays eager.
- **Cross-module API invocation from the engine handler.** `SubmitWorkflowAction` calls events `new-event`, notifications `send-notification`, and pre/post hook APIs via `context.callApi` (see [call-api](../call-api/design.md)). Cross-module reference is a verified pattern (contacts module's `update-contact` does it from YAML); first-time JS-side use is via the call-api primitive. If the primitive's resolution behavior surfaces issues, fallback is having the app pass endpoint ids as caller-supplied vars.
- **Tracker subscription drift.** Mitigated by the failure-mode mitigations above; periodic reconciliation as the catch-all.
- **`keys: []` silent no-op footgun.** Authors who compute `unblocks[].keys` from `_array.map` over a possibly-empty payload field will silently skip the unblock when the source is empty. v1 mitigation is documentation only (README shows the `skip` / `_if` gating pattern). If real apps surface confusion, the engine can grow an `allowEmpty: true` flag on `unblocks[]` entries so the default flips to "error on empty `keys`" — purely additive, no migration.

## Open Questions

1. **Relationship-registry cycle protection.** Hard graph-cycle prevention is deferred. If real apps surface pathological linking patterns, add a runtime depth-limit guard (default 10) that fails with a clear error citing the recursion chain.
2. **Change-stream subscription variant.** Re-open if multi-process writers, direct DB writes, or migration tooling become real triggers.

(Entity-status mirroring on `tracker:` was previously an open question here — Steph's parent-level review surfaced it as a real-app need; resolution is **rejected**, tracker actions only ever track workflows. Apps tracking simple entities use the minimal-workflow shim pattern described in action-authoring "Tracking simple entities (minimal workflow shim)." See `review/review-steph-1.md` finding #1.)

## Next Step

Implementation of the plugin, the references write contract, and the tracker subscription mechanism. Builds against the action-authoring sub-design's payload contracts; called by the module-surface sub-design's operational APIs (`start-workflow` / `cancel-workflow`) and by the submit-pipeline per-action endpoints (`{workflow_type}-{action_type}-submit`).
