# Workflows Engine

The server-side workflow engine — the WorkflowAPI Lowdefy connection, the three request handlers (`StartWorkflow`, `UpdateWorkflowActions`, `CancelWorkflow`), the references-spread write contract, the tracker subscription mechanism, and the status enum priority rule.

This sub-design owns the runtime that makes workflows work. The YAML surface that drives the engine comes from [action-authoring](../action-authoring/design.md); the module APIs that call into the engine come from [module-surface](../module-surface/design.md); the page templates that read engine output come from [ui](../ui/design.md).

## Problem

The module commits the data model (workflows + actions collections, status-array history with newest at index 0, references spread to root) and the engine semantics (priority transition rule, eager summary writeback, auto-complete check, tracker lifecycle mirroring). What's not yet decided:

- The plugin package's server-side scaffolding — `@lowdefy/modules-mongodb-plugins` is client-side only today.
- Whether the references write contract enforces reserved-keys via validation throws or merge-order silence.
- How the priority rule reads the status enum at runtime.
- The subscription mechanism for child-workflow → tracker-action updates (synchronous in-process vs change-stream vs other).
- Universal action fields handling — `assignees`, `due_date`, `description` merged into per-action writes atomically with status transitions.
- The `keys: [...]` payload shape on `UpdateWorkflowActions`.

This sub-design covers all of the above.

## Decision 1 — Plugin shape

**Add a server-side `WorkflowAPI` connection to `@lowdefy/modules-mongodb-plugins`.**

The package is client-side only today (`types.js` declares `connections: []`, `requests: []`). Adding the server-side connection is bootstrapping a new capability for the package — a discrete chunk of v1 work.

### Connection structure

```
src/connections/WorkflowAPI/
  WorkflowAPI.js                    # 4-line shell that registers handlers
  UpdateWorkflowActions/
    UpdateWorkflowActions.js        (~25 lines)
    handleUpdateActions.js          (~60 lines)
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

- `createMongoDBConnection.js` — wraps `new MongoClient(...) + connect()` for the connection's `databaseUri`; returns a `{ client, workflowsCollection, actionsCollection }` handle used across the handler's sub-steps.
- `getActions.js` — bulk fetch of action docs by `workflow_id` (used by auto-complete check and summary writeback).
- `getActionFields.js` — given a payload `action_id`, returns the on-disk action's current core fields (`type`, `key`, `workflow_id`, current status array) so the handler can apply priority-rule checks and pick up `entity_type` / `entity_id` for write context.
- `populateIds.js` — generates server-side `_id` for newly-created action docs (`_uuid: true` equivalent). Action `_id`s are server-generated, not caller-supplied.

### Entity-agnostic field shape

Action docs and workflow docs use scalar `entity_type` + `entity_id` + `entity_collection` — not a per-entity-key array shape. This is a load-bearing invariant: it rules out an action belonging to multiple entities at once, which is what makes `get-entity-workflows` a single indexed lookup (`{ entity_type, entity_id }`) instead of a join. The cross-entity case — "this lead has an installation ticket whose workflow we want reflected here" — is handled by the `tracker:` block on a normal single-entity tracker action ([action-authoring](../action-authoring/design.md) Decision 5), not by attaching the action to multiple entities.

**`entity_collection` is the connection id of the entity's MongoDB collection** (e.g. `leads-collection`, `tickets-collection`). Storing it on the action and workflow docs makes them self-describing: a reader can find the referenced entity directly without external knowledge of an `entity_type → collection` mapping. This matches the files module's pattern ([modules/files/api/save-file.yaml](../../../modules/files/api/save-file.yaml) stores `collection` + `doc_id` on every file doc) so cross-module reporting / list pages / custom views can pivot uniformly. Tracker actions additionally carry `child_entity_collection` next to `child_entity_id`; child workflows carry `parent_entity_collection` next to `parent_entity_id`. Reserved-keys list extends accordingly.

### Capabilities

- **`StartWorkflow` writes both a workflow doc and N action docs.** The workflow doc carries `key`, `display_order`, initial `status: [{ stage: 'active', created }]`, empty `form_data`, empty `summary`. When the caller passes `parent_action_id`, the workflow doc also records `parent_action_id` and `parent_entity_id` (read from the parent tracker action) — and the same handler invocation writes the parent tracker action's `child_entity_id` and transitions it to `in-progress`. See "Parent ↔ child link shape" under Decision 3.
- **`summary` writeback in `UpdateWorkflowActions`** — eager strategy: recompute the parent workflow's `summary: { done, not_required, total }` after each transition.
- **Auto-complete check** — when all actions on a workflow reach a terminal stage (`done` or `not-required`), push `{ stage: 'completed' }` to the workflow's `status` history.
- **`references` field handling** — see "References write contract" below.
- **Tracker subscription handler** — see "Tracker subscription mechanism" below; runs synchronously after each workflow status write.
- **Priority-based transition rule** — see "Status enum priority rule" below.
- **`UpdateWorkflowActions` payload uses `keys: [...]` only** — no singular `key` field on action entries. The plugin flat-maps over `keys` before per-action processing: omitted → one op with `key: null`; `[]` → zero ops; `[k]` → one op with `key: k`; `[k1, k2, ...]` → N ops one per key. The on-disk action doc keeps singular `key`; only the plugin's input shape unifies. The `(workflow_id, type, key)` unique index is unchanged. **Footgun:** `keys: []` is silent — when authors compute `keys` from a possibly-empty payload field (e.g. `_array.map: { on: _payload: form.devices }`) and the user submits an empty form, the unblock silently no-ops with no error. Either the call site is fine with that (legitimate "no fan-out targets" case) or the author needs to gate the unblock with `skip` / `_if` on `keys.length` to surface the empty case as a form-validation error rather than a silent miss. The README's `unblocks` reference documents both shapes side-by-side.
- **Universal action fields handling.** The plugin reads `actions[].fields` from the `UpdateWorkflowActions` payload (see action-authoring sub-design) and merges it into the per-action `$set`. `fields.assignees` / `fields.due_date` / `fields.description` are written to the action doc's root alongside core fields. A null value clears the field; an omitted key leaves the existing value unchanged. Field writes are atomic with the status transition — the engine emits one update event covering both.
- **`CancelWorkflow` primitive** — pushes `cancelled` to workflow status; flips remaining open actions to `not-required`.
- **Access enforcement** — the engine runs the per-app verb filter and role gate from action-authoring's Decision 3 ("Action access semantics") at two server-side points: (1) **query-time in `get-entity-workflows`**, filtering returned actions by the host app's `app_name` verb map and intersecting the caller's roles (sourced via `_user: roles`) with `access.roles`. Actions where the filter doesn't pass are excluded from the response — invisible to that user. (2) **submit-time in `submit-action`**, re-checking the role gate against the action's `access.roles` before performing any writes; rejects with a structured error if the user's roles no longer match (e.g. role revoked between page render and submit). The verb-filter check at submit-time is implicit — the form-action page wouldn't have been generated by `makeActionPages` if the verb wasn't allowed in the current app — but the role gate is re-checked because role state can change between render and submit. See action-authoring Decision 3 for the canonical access-semantics definition.
- **Action groups as a persisted engine concept** — workflows declare a top-level `action_groups:` array (see [action-authoring](../action-authoring/design.md) and [action-groups](../action-groups/design.md) Decision 1). The workflow doc carries a `groups: [{ id, status, summary }]` array with derived three-value status (`blocked` / `in-progress` / `done`); written back eagerly inside `UpdateWorkflowActions` as part of the handler's ordered steps (see "Ordering relative to other engine work"). `blocked_by` entries accept both action types and group IDs; the engine resolves group references against `groups[].status`. The `UpdateWorkflowActions` return value carries `completed_groups: [...]` listing groups that transitioned to `done` in the call; an outer Layer-1 orchestration layer fans out one `CallApi` per declared `on_complete` (mechanism deferred — see action-groups Decision 6). Group state lives alongside `summary` on the workflow doc; the same drift / reconciliation risk class applies.

### Package shape changes (`@lowdefy/modules-mongodb-plugins/package.json`)

- Add `dependencies` for the Mongo driver (`mongodb`) and any Lowdefy server-side helpers (`@lowdefy/helpers` is already a peerDep — confirm it's available server-side).
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

The `WorkflowAPI` handler opens **one `MongoClient` per invocation** and threads the same client through every sub-step inside that call — action writes, auto-complete checks, tracker subscription recursion, summary writeback. The client is connected at handler entry and closed at handler exit. This matches the natural shape of "one user submission = one Mongo work session" without introducing transaction infrastructure.

Concrete handler shape, matching Lowdefy's connection-handler signature (`async ({ request, connection, ... }) => result`):

```js
// src/connections/WorkflowAPI/UpdateWorkflowActions/UpdateWorkflowActions.js
async function UpdateWorkflowActions({ request, connection }) {
  const ctx = await createMongoDBConnection(connection); // opens one client
  try {
    return await handleUpdateActions(ctx, request); // all sub-steps share `ctx`
  } finally {
    await ctx.client.close();
  }
}
```

`ctx` carries `{ client, workflowsCollection, actionsCollection }`; every helper called from `handleUpdateActions` takes `ctx` as its first argument and uses the shared collection handles. The `pushWorkflowStatus` pseudo-code in [Decision 3](#decision-3--tracker-subscription-mechanism) uses this same `ctx`.

**No Mongo transactions in v1.** The implementation is sequential writes through the shared client — ordering is preserved (step N completes before step N+1 begins), but atomicity is not (if step N fails, steps 1..N-1 are durable). This is the same risk class as the existing `summary` writeback drift; the "Failure-mode story" mitigations apply and periodic reconciliation is the catch-all. The earlier framing of "same transactional semantics as the underlying write" was imprecise — it conflated ordering with atomicity. What the design actually guarantees is **shared connection lifetime + sequential writes + idempotent retry** (per the Idempotency sub-section), not all-or-nothing rollback.

**Transactions are a purely-additive upgrade later.** If real apps need ACID across an `UpdateWorkflowActions` call, the handler body can be wrapped in `session.withTransaction(async (session) => { ... })`. No payload-shape changes, no caller-side coordination — just an internal opt-in. Constraint: transactions require a replica set or Atlas, not standalone Mongo, so we'd ship it as an opt-in mode rather than the default.

**The two `MongoDBCollection` exports (`workflows-collection`, `actions-collection`) are separate connections with their own client lifecycles** — they don't share state with `WorkflowAPI`. The split is intentional: `WorkflowAPI` owns the engine-managed write paths (with the priority rule, tracker subscription, summary writeback all running inside one client invocation), while the `MongoDBCollection` exports give apps direct read access for custom views, ad-hoc aggregations, list pages, or dedicated reporting that doesn't need to go through the engine. Apps that want app-specific indexes on `*_ids` reference fields layer them via the collection connections without touching engine internals. See [module-surface](../module-surface/design.md) Decision 1 for the full exported-connections list.

## Decision 2 — References write contract

The `references` map is spread onto the doc root at write time. Queries against the stored doc are flat (`{ company_ids: 'C1' }`), matching the shape consumers already use against the events module's `log-events` collection — but the contract here is enforced inside the plugin handler, not by the YAML routine layer the events module uses.

**Shape of `references` in the call payload.** One map per call, applied to all docs that call writes:

- `StartWorkflow` — `references` in the call payload is spread onto the workflow doc and onto every starting action doc.
- `UpdateWorkflowActions` — `references` at the call level is spread onto every action being written; per-action overrides on individual `actions[].references` are supported but rare.
- `CancelWorkflow` — `references` is rarely used; if supplied, spread onto the workflow doc on the `cancelled` status push.

**Storage shape.** No `references` key on the stored doc — the map is unwrapped and spread to root. Queries are flat (`{ company_ids: 'C1' }`); indexes live at root. Apps add Mongo indexes on whichever `*_ids` keys they query; the module ships indexes only for core fields.

**Update semantics.** `UpdateWorkflowActions` uses **replace per-key**: a call passing `references: { company_ids: [C2] }` replaces the doc's `company_ids` field but leaves other root-level reference fields (`deal_ids`, `region_ids`, etc.) untouched. Same as Mongo's `$set` semantics.

**Reserved-keys enforcement — merge order, not validation.** The plugin builds the doc by spreading `references` first, then layering core fields on top via `_object.assign`-equivalent semantics:

```js
// pseudo-code in createAction.js
const doc = {
  ...actionUpdate.references, // spread first
  // core fields layered last so they override any collision
  _id: actionId,
  workflow_id: currentAction.workflow_id,
  type: actionUpdate.type,
  entity_type: currentAction.entity_type,
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

If `references.{key}` collides with a core field name, the core field wins silently. The stored doc is always correct. The README documents the **reserved-keys list** (`_id`, `workflow_id`, `type`, `entity_type`, `entity_id`, `entity_collection`, `key`, `status`, `summary`, `created`, `updated`, `assignees`, `due_date`, `description`, `tracker`, `child_entity_id`, `child_entity_collection`, `parent_action_id`, `parent_entity_id`, `parent_entity_collection`, plus any other engine-managed keys) so authors know which keys to avoid; collisions from genuine app bugs surface as "the reference value I set didn't appear when I queried." The three universal fields (`assignees`, `due_date`, `description`) are reserved because they are user-editable engine-managed fields — apps that try to put `assignees` on `references` would have it silently overridden.

**Validation throws are deliberately not implemented in v1.** Merge-order silencing keeps the handler simple, the stored doc is always correct, and the reserved-keys list is small enough (~20 names) that the realistic failure mode is a developer surfacing "the reference value I set didn't appear when I queried" — debuggable without runtime errors. Build-time validation in `makeWorkflowsConfig` (catching collisions in static workflow YAML) and write-time validation in the plugin handlers (catching collisions in dynamic payloads) are purely-additive nice-to-haves if real apps surface confusion from silent overrides; they can land in any v1.x without breaking changes.

**App-defined index strategy.** The module ships indexes on core fields only. Apps populating `company_ids`, `deal_ids`, `region_ids`, etc. add their own Mongo index definitions wherever they manage indexes; out of scope for the module. The README documents this so authors know to add an index when they query by a reference key.

## Decision 3 — Tracker subscription mechanism

### Terminology

A **tracker action** is an action with `kind: tracker` and a `tracker:` block. It lives on a **parent workflow** and mirrors the lifecycle of a **child workflow**. The data flow is **child → parent**: when the child workflow's status changes, the engine looks up the parent tracker action (via the child's `parent_action_id` back-reference) and writes its status from the child-stage map. Trackers don't push state to the child; the child workflow runs independently and the parent's tracker action follows.

### Parent ↔ child link shape

The relationship between a tracker action and its child workflow is **bidirectional, established by `start-workflow` at child-workflow-creation time**:

- **Tracker action** (parent side) carries `child_entity_id` and `child_entity_collection` — the entity id and collection-connection-id of the child workflow's entity. Both empty until the child workflow is started.
- **Child workflow doc** carries `parent_action_id`, `parent_entity_id`, and `parent_entity_collection` — back-references to the tracker action that's mirroring it. All empty for top-level (non-child) workflows.

Both sides are written in **one `start-workflow` call**, not two. The trigger action's submit hook calls `start-workflow` with `parent_action_id` set; the engine writes:

1. The new child workflow doc with `parent_action_id`, `parent_entity_id`, and `parent_entity_collection` populated (the latter two read off the parent tracker action's `entity_id` / `entity_collection`).
2. The N starting action docs for the child.
3. The parent tracker action's `child_entity_id` and `child_entity_collection` fields (read from the `start-workflow` payload), transitioned to `in-progress`.

All three writes happen inside one `WorkflowAPI` handler invocation on the shared client (see "Client and transaction model"). Authors no longer chain `start-workflow` + `submit-action(fields: { key })` — the engine owns the link setup.

**Why `child_entity_id` and not `child_workflow_id`.** The tracker's `tracker:` block declares the `workflow_type` it follows. Combined with the entity id, `(child_entity_id, tracker.workflow_type)` uniquely identifies the child workflow. Storing the entity id (not the workflow id) on the parent side is more useful for UI: links from tracker action displays target the child entity's view page, not the workflow doc. The engine's subscription doesn't need `child_workflow_id` because the child workflow's `parent_action_id` provides the direct primary-key lookup back to the parent (next section).

**Why this isn't `key`.** Earlier drafts overloaded the action doc's `key` field — for fan-out actions, `key` is a domain id (e.g. a device serial number); for tracker actions, it was the child workflow's `_id`. The overloading was load-bearing only on the engine side and confusing for authors. With this design, `key` keeps its fan-out role (domain ids for per-row actions) and trackers get the dedicated `child_entity_id` field. The `(workflow_id, type, key)` unique index still applies to trackers (with `key: null`).

### Mechanism — synchronous in-process within `UpdateWorkflowActions`

When `UpdateWorkflowActions` writes a workflow's `status[0].stage`, the same handler — before returning — looks up the parent tracker action via the workflow's `parent_action_id` back-reference and applies the hard-coded child-stage map (defined in [action-authoring](../action-authoring/design.md)). No event bus, no async machinery, no separate consumer process. It's part of the handler's normal flow.

Pseudo-code:

```js
const CHILD_STAGE_MAP = {
  active: "in-progress",
  completed: "done",
  cancelled: "not-required",
};

// `eventId` is part of the UpdateWorkflowActions payload — generated by the
// `submit-action` API routine via `_uuid: true` in :set_state: (see
// module-surface Decision 5) and threaded through every write in this
// invocation so they all share one event id for audit. The plugin handler
// signature is (per Lowdefy's connection-handler contract):
//   ({ blockId, connection, connectionId, pageId, request, requestId, payload }) => result
// `request.eventId` and `request.actions[]` are the per-call inputs; `ctx`
// below is shorthand for the handler-local Mongo handle (see "Client and
// transaction model").

async function pushWorkflowStatus(ctx, workflowId, newStage, eventId) {
  // 0. Idempotency guard — workflow status pushes are no-op when the new stage
  //    equals the current top-of-stack. Without this, retries (and any double-
  //    call from concurrent writers) would $push a second `{ stage: completed }`
  //    onto the workflow's status history, breaking the "status[0] = current
  //    stage" invariant and double-firing tracker subscription downstream. See
  //    "Workflow-status idempotency" below.
  const current = await ctx.workflowsCollection.findOne(
    { _id: workflowId },
    { projection: { status: 1, workflow_type: 1, parent_action_id: 1 } },
  );
  if (current?.status?.[0]?.stage === newStage) return;

  // 1. Write the workflow's status (existing behaviour)
  const workflow = await writeWorkflowStatus(
    ctx,
    workflowId,
    newStage,
    eventId,
  );

  // 2. If this workflow has a parent tracker action, look it up by primary key.
  //    The link is bidirectional: child workflow's `parent_action_id` points at
  //    the tracker action's `_id`. No reverse-lookup index needed — `_id` is
  //    the primary key, served by the default `{ _id: 1 }` index.
  if (!current.parent_action_id) return; // top-level workflow, nothing to mirror
  const tracker = await ctx.actionsCollection.findOne({
    _id: current.parent_action_id,
  });
  if (!tracker) return; // tracker may have been removed; tolerate

  // 3. Apply the hard-coded map and update via UpdateWorkflowActions
  const targetStage = CHILD_STAGE_MAP[newStage];
  if (!targetStage) return; // unmapped child stage → no parent update
  await updateAction(ctx, {
    currentActionId: null,
    actions: [{ type: tracker.type, key: tracker.key, status: targetStage }],
    eventId, // reuse the same eventId — the tracker action update is part of this transition
    force: true, // tracker writes bypass priority rule (see Decision 4)
  });
}
```

Single tracker per child by construction: a child workflow has at most one `parent_action_id`. The loop over multiple matching parents in earlier drafts is gone — a child can only mirror to one parent. Apps that need the same physical event to drive multiple parents either spawn one child workflow per parent or model the dependency via shared state read independently by each parent.

### Why synchronous in-process

Three alternatives were considered:

- **In-process event emitter.** Adds an indirection (publish/subscribe) for no decoupling benefit — the plugin owns both writer and tracker-update handler, so direct calls match the data flow. Rejected.
- **MongoDB change-stream consumer.** A separate process tails the `workflows` collection's oplog and runs tracker logic on every status write. Multi-server safe by construction, captures direct DB writes (migrations, admin tools), but adds a long-running process to the deployment, requires resume-token discipline, and runs trackers in a separate transaction from the trigger write. **Deferred** — no current trigger forces this. Re-open if multi-process writers, direct DB writes, or migration tooling become real.
- **App-side imperative chaining (no engine subscription).** Each submit handler that triggers a workflow transition explicitly updates the tracker. Fragile because every lifecycle handler must remember to call the tracker update. Rejected.

Synchronous in-process wins because:

- **Shared connection lifetime, sequential writes, idempotent retry.** Tracker writes run on the same `MongoClient` as the trigger write ([Decision 1 "Client and transaction model"](#client-and-transaction-model)) — ordering is preserved across the recursion (step N completes before step N+1 starts), and the idempotency guards ([Decision 3 "Idempotency"](#idempotency)) make a retried submission converge to the same end state. The atomicity story is the same risk class as the existing `summary` writeback — no new failure surface relative to what the engine already accepts. Transactions are a purely-additive upgrade if real apps need ACID.
- **No new infrastructure.** No background process, no oplog tailing, no resume tokens.
- **Multi-server safe by construction.** Each server's plugin instance handles whatever writes go through it; trackers update in the same process.
- **Matches the data-flow shape.** Tracker updates _are_ part of "what happens when a workflow's status changes." Modelling them as follow-up steps in the same handler is the most direct expression.

### Parent lookup is primary-key, not reverse-index

The bidirectional link replaces the reverse-lookup partial index used in earlier drafts. When a child workflow's status changes, the engine reads `parent_action_id` off the child workflow doc and fetches the parent tracker action by primary key (`_id`). The default `{ _id: 1 }` index serves the lookup; no additional reverse-lookup index on the `actions` collection is needed.

**One child, one parent — by construction.** Each child workflow has at most one `parent_action_id`. Apps that need the same physical event (e.g. an installation visit) to unblock multiple parent workflows either spawn one child workflow per parent (one installation tracking workflow per parent that depends on it) or model the dependency via shared entity state that each parent reads independently — both shapes are cleaner than engine-side multi-parent mirroring.

### Auto-complete recursion

When a tracker action transitions to `done` via this mechanism, the parent workflow's auto-complete check runs as part of the same `UpdateWorkflowActions` invocation. If all parent's actions are now terminal, the parent workflow auto-completes, which fires this same tracker-update logic for any tracker actions tracking _it_. Recursion depth is bounded in practice because typical workflow nestings are 1–2 levels deep.

**The engine doesn't statically prove acyclicity.** Without a relationship registry, there's no metadata for the engine to walk in advance to confirm the parent/child workflow graph is acyclic. Pathological app code — e.g. parent A's tracker action tracks workflow B, whose tracker action tracks workflow A — could in principle recurse. Cycles are rare in real apps because they require app code to deliberately link parents to grandchildren; the design accepts the risk for v1. If it surfaces operationally, the engine adds a runtime depth-limit guard that fails with a clear error citing the recursion chain at, say, 10 levels.

### Idempotency

Tracker updates are just additional `UpdateWorkflowActions` calls — same priority/force rules, same `eventId`, same audit chain. The `eventId` is reused so all writes triggered by one user submission share one event id.

Two distinct idempotency stories matter:

- **Action status pushes** are guarded by the priority-based transition rule ([Decision 4](#decision-4--status-enum-priority-rule)). Repeating an `UpdateWorkflowActions` call that takes an action `in-review → done` is harmless on retry — the second push compares `done` (priority 3) against the already-stored `done` and rejects as a redundant write. The rule operates on action priority, so this protection is automatic.
- **Workflow status pushes** are not covered by the priority rule. The workflow lifecycle enum (`active`, `completed`, `cancelled`) doesn't have a natural priority ordering — its legal transitions are `active → completed` and `active → cancelled`, not a strict-less-than relationship. Instead, `pushWorkflowStatus` reads the workflow's current `status[0].stage` first and no-ops when it equals the new stage (see the guard at step 0 of the pseudo-code above). Without this, a retried auto-complete would `$push` a second `{ stage: 'completed' }` onto the workflow's status history, breaking the "current stage = `status[0]`" invariant, polluting the audit history, and double-firing tracker subscription on the no-op transition. The same-stage no-op is the narrow, retry-safe behaviour the engine needs. Legal-transition enforcement on workflow status (rejecting `completed → active`, etc.) is a separate concern, deferred to v1.x.

### Failure-mode story

If the tracker update throws after the workflow status write succeeded, the workflow doc is in `completed` (or whatever new stage) but the tracker is still in its previous stage. The handler shares one Mongo client across the sub-steps ([Decision 1 "Client and transaction model"](#client-and-transaction-model)) but does **not** wrap them in a transaction in v1 — so a mid-sequence failure leaves earlier writes durable, later steps unrun. Same risk model as the `summary` writeback. Mitigations:

- **Idempotent retry on next read of the parent workflow.** The `get-entity-workflows` API can detect "workflow's status[0] is terminal but tracker referencing it isn't" and queue a tracker reconciliation. Optional; cheap.
- **Periodic reconciliation job.** Walk workflows in terminal stages; verify their trackers are also terminal; correct any drift. Can run on a schedule. Listed in parent Risks.
- **Caller retry is safe by construction.** The idempotency guards ([Idempotency](#idempotency)) make a retried submission converge to the same end state, so the recommended recovery is "resubmit." Callers who got a partial-write error and retry will land on the correct end state without engine intervention.

Documented as the same risk-class as the summary writeback. Acceptable. Real ACID is available as a purely-additive opt-in by wrapping the handler body in `session.withTransaction(...)` — see [Decision 1 "Client and transaction model"](#client-and-transaction-model).

### Ordering relative to other engine work

Within one `UpdateWorkflowActions` call, the order is:

1. Write the action's status (the original transition the caller asked for).
2. Recompute affected groups' statuses; write `groups[]` back to the workflow doc (see [action-groups](../action-groups/design.md) Decision 4).
3. Re-evaluate `blocked_by` for every blocked action in the workflow against the new group/action state; push `action-required` on those whose dependencies are now terminal ([action-groups](../action-groups/design.md) Decision 2 unblock).
4. Apply auto-complete check on the workflow if all actions are terminal — push `completed` to workflow status. Re-run after step 3 since step 3 may have transitioned more actions.
5. If step 4 wrote a workflow status, run tracker-update for any tracker actions referencing this workflow.
6. Recompute the workflow's `summary` (eager writeback).
7. Return `{ action_ids, completed_groups, event_id }` — `completed_groups` lists groups that transitioned to `done` in step 2 (see [action-groups](../action-groups/design.md) Decision 5).

Step 5 happens between step 4 and step 6 because tracker writes themselves trigger their own auto-complete chain — a tracker action going `done` can complete its parent workflow. Doing summary writeback after lets it reflect the final state. Implementation verifies this ordering.

**Summary recompute is idempotent — redundant in nested cases, by design.** When tracker subscription recurses, the inner `updateAction` invocations each run their own step 4 against their own workflow. The outer call's step 4 then runs against the original workflow, which the recursion has already touched. The duplicate recompute is correct (reads N actions, writes one summary doc) and idempotent — the second write produces the same `{ done, not_required, total }` as the first. The cost is bounded by recursion depth (≤ 10 in practice; see "Auto-complete recursion") and the alternative (tracking visited workflow IDs to dedupe) adds complexity for negligible gain at this scale.

### Worked example: 2-level nested auto-complete

Concrete scenario exercising the ordering with two levels of nesting. The example confirms `summary` writeback, tracker subscription, and the workflow-status idempotency guard ([Decision 3 "Idempotency"](#idempotency)) all compose correctly.

**Setup.** Two workflows on two entities, linked via the parent/child fields:

- **Workflow A** on a `lead` entity (`entity_collection: leads-collection`). Two actions: `qualify` (form, currently `in-review`) and `track-installation` (tracker, currently `in-progress`, `child_entity_id = ticket._id`, `child_entity_collection = tickets-collection`, `tracker.workflow_type = device-installation`). `parent_action_id` / `parent_entity_id` / `parent_entity_collection` are null — A is top-level.
- **Workflow B** on a `ticket` entity (`entity_collection: tickets-collection`), `workflow_type: device-installation`. One action: `install-device` (form, currently `in-review`). Workflow B's `status = [{ stage: 'active' }]`, `parent_action_id = track-installation._id`, `parent_entity_id = lead._id`, `parent_entity_collection = leads-collection` — populated when `start-workflow` was called with `parent_action_id` set.

A reviewer submits the approval on `install-device` via `submit-action({ action_id: install-device._id, current_type: install-device, current_status: done })`. The `submit-action` routine aliases `payload.action_id` to `currentActionId` and calls `UpdateWorkflowActions({ currentActionId: install-device._id, actions: [{ type: install-device, status: done }], eventId: <new-uuid> })`.

**Execution trace.**

```
updateAction(currentActionId=install-device._id, actions=[{type: install-device, status: done}], eventId=E1)
│
├─ step 1: write install-device.status = done            (priority rule allows in-review → done)
├─ step 2: all actions on Workflow B terminal? YES (only one action, done)
│   └─ pushWorkflowStatus(Workflow B, 'completed', E1)
│       ├─ step 0 guard: B.status[0] = 'active' !== 'completed' → proceed
│       ├─ step 1: writeWorkflowStatus(B, 'completed')   ($push completed onto B.status)
│       ├─ step 2: B.parent_action_id = track-installation._id → load tracker by primary key
│       │           tracker = actionsCollection.findOne({ _id: track-installation._id })
│       └─ step 3: CHILD_STAGE_MAP['completed'] = 'done'
│           └─ updateAction(currentActionId=null, actions=[{type: track-installation, status: done}], eventId=E1, force=true)
│               │
│               ├─ step 1: write track-installation.status = done   (force=true bypasses in-progress → done check, though strict priority would also allow it)
│               ├─ step 2: all actions on Workflow A terminal? qualify is still in-review → NO
│               │           (no pushWorkflowStatus for A; recursion ends here)
│               ├─ step 3: skipped (no workflow status push in this branch)
│               └─ step 4: recomputeSummary(Workflow A) → { done: 1, not_required: 0, total: 2 }   (track-installation now done)
├─ step 3: (covered by the inner recursion above)
└─ step 4: recomputeSummary(Workflow B) → { done: 1, not_required: 0, total: 1 }
```

**End state.**

- Workflow B: `status = [{completed}, {active}]`, `summary = { done: 1, not_required: 0, total: 1 }`. Auto-completed. Still has `parent_action_id` and `parent_entity_id` populated.
- Workflow A: unchanged status array (`[{active}]` — `qualify` is still in-review, so A didn't auto-complete), `summary = { done: 1, not_required: 0, total: 2 }`. The `track-installation` tracker action reflects B's completion automatically.
- One `eventId` (E1) on every write — the user's single submission is one audit-chain event despite touching three docs across two workflows.

**Retry case.** If the caller retries the same `submit-action` payload (e.g. network blip after the response):

- `install-device.status` is already `done` (priority 3); pushing `done` again is rejected by the action's strict-less-than rule. No write.
- All of Workflow B's actions are still terminal, so step 2 runs `pushWorkflowStatus(B, 'completed', E1)` again.
- The step 0 guard catches `B.status[0].stage === 'completed'` and returns immediately. **No duplicate `$push` onto B.status**, no second tracker fire, no second recompute.
- Outer step 4 still recomputes A's summary — same result, idempotent write.

This is exactly the retry behaviour the idempotency guards are designed to provide.

**Variation: A auto-completes on the same call.** If `qualify` were already `done` before this submission, the inner `updateAction` would find _all_ Workflow A actions terminal in its step 2, push `completed` to A, and fire `pushWorkflowStatus(A, ...)` — which would read A's `parent_action_id` (null in this scenario, since A is top-level) and return early. The summary recompute in step 4 of both the inner and outer calls fires against A; both produce the same result. Bounded cost; correct end state.

## Decision 4 — Status enum priority rule

The plugin's `shouldUpdate.js` implements the priority transition rule, reading the **static module-shipped enum** (see [action-authoring](../action-authoring/design.md) "Action status enum") at runtime.

**Priority semantics.** A status transition is allowed when the new status's priority is **strictly less than** the current status's priority — lower number wins. Exceptions:

- The engine permits same-stage transitions for the action being submitted (`currentActionId` self-exception).
- A `force: true` override on `UpdateWorkflowActions` allows any transition (used for migrations and admin tools).
- `not-required` (priority 0) is the universal terminal — once an action is `not-required`, only `force: true` can move it.

**Where `currentActionId` comes from.** The `submit-action` API's routine aliases its `payload.action_id` to `currentActionId` when constructing the `UpdateWorkflowActions` request. The plugin treats `currentActionId` as "the one action in this call that the user clicked submit on"; every other entry in `actions[]` (unblocks, fan-outs, tracker writes) is auxiliary and gets the strict priority check. The alias makes the API payload caller-friendly (`action_id` matches "this action") while keeping the plugin's internal name precise.

**Where `force: true` lives.** Per-call only — `force` is a top-level field on the `UpdateWorkflowActions` payload (`{ currentActionId, actions, eventId, force?: true }`), not a per-entry field. When set, the priority rule is bypassed for every entry in the call, including the universal-terminal exception on `not-required`. Per-call matches the realistic use case (migrations and admin tools want to rewrite a whole batch consistently); per-entry forcing is a purely-additive future change if a real case wants surgical overrides.

**Tracker subscription uses `force: true` internally.** Tracker writes are engine-driven and can move parent actions in any direction the child workflow takes — most transitions are forward (`in-progress → done` when the child completes), but the child-stage map permits backward moves too (e.g. a child workflow uncancelled would push the parent from `not-required` back to `in-progress`, which violates strict-lower-priority and the universal-terminal rule). Tracker writes are non-user-driven and need the escape hatch by definition. The pseudo-code in Decision 3's `pushWorkflowStatus` therefore calls `updateAction(ctx, { ..., force: true })` — make this explicit when implementing.

The plugin reads `actionsEnum` from `_module.var` or directly from `global.action_statuses`; either way the same eight-name vocabulary is in effect across every consuming app. No per-app override at runtime.

## Risks

- **Plugin dual-runtime build complexity.** First-time server-side code in a package that currently ships React blocks. Treated as a v1 milestone (see [Decision 1 "Dual-runtime build"](#dual-runtime-build--a-v1-milestone-not-a-config-tweak)) with its own verification step: hard split between `src/blocks/` and `src/connections/`, dist/-output grep for React leakage, plugin-loader smoke test before declaring done.
- **No transactional atomicity in v1.** The `WorkflowAPI` handler runs sub-steps sequentially on one shared Mongo client but doesn't wrap them in a transaction. A mid-sequence failure leaves earlier writes durable and later steps unrun — same risk class as the existing `summary` writeback drift. Mitigation: caller retry is safe (the idempotency guards converge to the same end state), plus periodic reconciliation as the catch-all. `session.withTransaction(...)` is a purely-additive opt-in if a consumer surfaces a need for ACID.
- **Workflow-doc write contention** under highly-parallel workflows. Mitigation: provide a `summary_dirty: true` lazy-writeback fallback as an opt-in mode (set per workflow YAML), so apps with high parallelism can defer the recompute. Default stays eager.
- **Cross-module endpoint resolution at the module-level (`_module.endpointId: { id, module }`)** inside `submit-action`. The API calls into events (`new-event`) and notifications (`send-notification`); cross-module reference works from inside another module's API routine (verified — the contacts module already does this pattern in `update-contact`). If a future change to the module-loader breaks the cross-module reference, fallback is having the app pass endpoint IDs as caller-supplied vars.
- **Tracker subscription drift.** Mitigated by the failure-mode mitigations above; periodic reconciliation as the catch-all.
- **`keys: []` silent no-op footgun.** Authors who compute `unblocks[].keys` from `_array.map` over a possibly-empty payload field will silently skip the unblock when the source is empty. v1 mitigation is documentation only (README shows the `skip` / `_if` gating pattern). If real apps surface confusion, the engine can grow an `allowEmpty: true` flag on `unblocks[]` entries so the default flips to "error on empty `keys`" — purely additive, no migration.

## Open Questions

1. **Relationship-registry cycle protection.** Hard graph-cycle prevention is deferred. If real apps surface pathological linking patterns, add a runtime depth-limit guard (default 10) that fails with a clear error citing the recursion chain.
2. **Change-stream subscription variant.** Re-open if multi-process writers, direct DB writes, or migration tooling become real triggers.
3. **Entity-status mirroring on `tracker:` (revisit if real apps surface the need).** Decision 3 commits tracker actions to mirror workflow status only. Adding entity-status mirroring (an `on: workflow | entity` selector) is purely additive — no migration if it lands later.

## Next Step

Implementation of the plugin, the references write contract, and the tracker subscription mechanism. Builds against the action-authoring sub-design's payload contracts and is called by the module-surface sub-design's `submit-action` / `start-workflow` / `cancel-workflow` APIs.
