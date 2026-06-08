# Workflows Engine — Spec

Server-side runtime for the workflows module. Full rationale in [design.md](designs/workflows-module-concept/engine/design.md); this file carries only the committed decisions.

## Plugin shape

`@lowdefy/modules-mongodb-plugins` grows a server-side `WorkflowAPI` connection. The package is client-only today (`connections: []`, `requests: []`); v1 makes it dual-runtime.

### Connection structure

```
src/connections/WorkflowAPI/
  WorkflowAPI.js                    # registers handlers via { schema, requests: { ... } }
  SubmitWorkflowAction/
    SubmitWorkflowAction.js          # handler entry point
    handleSubmit.js                  # lifecycle orchestration (validate → pre-hook → writes → side effects → post-hook)
    invokePreHook.js                 # context.callApi to action.hooks[signal].pre
    invokePostHook.js                # context.callApi to action.hooks[signal].post
    computeAutoUnblocks.js           # walks blocked_by, identifies actions to unblock
    dispatchLogEvent.js              # context.callApi to events.new-event with merged event payload
    dispatchNotifications.js         # context.callApi to notifications.send-notification
    fireGroupOnComplete.js           # context.callApi per completed_groups entry (action-groups D6)
    createAction.js
    updateAction.js
    utils/{shouldUpdate,shouldCreate,getCurrentAction}.js
  StartWorkflow/
    StartWorkflow.js
    createActions.js
  CancelWorkflow/
    CancelWorkflow.js
  shared/
    createMongoDBConnection.js       # per-collection dispatcher over @lowdefy/community-plugin-mongodb's MongoDBCollection.requests
    getActions.js                    # bulk fetch by workflow_id (via MongoDBFind)
    getActionFields.js               # core fields for a payload action_id (via MongoDBFindOne with projection)
    populateIds.js                   # server-side _id generation for new action docs
```

### `types.js` registration

The package's `src/types.js` follows the upstream Lowdefy convention:

```js
import * as connections from './connections.js';
export default {
  ...
  connections: Object.keys(connections),
  requests: Object.keys(connections).flatMap(c => Object.keys(connections[c].requests)),
};
```

`src/connections.js` re-exports `WorkflowAPI`. Each connection exports `{ schema, requests: { RequestType: handlerFn } }`. Handler signature: `async ({ blockId, connection, connectionId, pageId, request, requestId, payload }) => result`.

### Package shape

- Add `@lowdefy/community-plugin-mongodb` to `peerDependencies` — the engine's `createMongoDBConnection` imports `MongoDBCollection` from it.
- `@lowdefy/helpers` already a peerDep (server-side available).
- Bump package version; update workflows module's `plugins:` entry to require the new minor.

### Dual-runtime build milestone

Hard split: client code in `src/blocks/`, `src/actions/`, `src/metas.js`; server code in `src/connections/`. `.swcrc` (`jsx: true`, classic React runtime) is verified to produce clean server-side dist files via grep for `react`/`React`/`jsx-runtime` after build. Plugin-loader smoke test (`types.js` discovery of `WorkflowAPI`) before declaring done.

## Client and transaction model

`WorkflowAPI` handlers delegate every MongoDB read and write to `@lowdefy/community-plugin-mongodb`'s `MongoDBCollection` request handlers (`MongoDBFind`, `MongoDBFindOne`, `MongoDBInsertOne`, `MongoDBInsertMany`, `MongoDBUpdateOne`, etc.) via a per-collection dispatcher returned by `createMongoDBConnection`. The dispatcher is built once at handler entry from the Lowdefy request context (`blockId`, `connection`, `connectionId`, `pageId`, `requestId`) and reused across every sub-step inside the call:

```js
async function SubmitWorkflowAction(lowdefyContext) {
  const { connection, request } = lowdefyContext;
  const context = {
    mongoDBConnection: createMongoDBConnection(lowdefyContext),
    workflowsConfig: connection.workflowsConfig,
    actionsEnum: connection.actionsEnum,
    changeStamp: connection.changeStamp,
    params: request,
  };
  return handleSubmit(context);
}

// inside handleSubmit / sub-steps:
const action = await context.mongoDBConnection('actions').MongoDBFindOne({
  query: { _id: actionId },
  options: { projection: { ... } },
});

await context.mongoDBConnection('actions').MongoDBInsertOne({ doc });
```

Connection lifecycle, change-log writes (the `changeLog` block on the connection config flows through to every dispatched request), and BSON serialization are owned by the community plugin. The community-plugin handlers open a fresh `MongoClient` per request and close it in a `finally` block — this is the same posture every other module in this repo uses (events, contacts, companies, notifications). The engine adds no client management of its own.

**Cost note.** Each helper-issued request opens and closes its own `MongoClient`. Driver-side pooling makes this cheap in steady state but it is a real per-request cost — a single `SubmitWorkflowAction` invocation issues N reads + N writes + side-effect `context.callApi` calls, each of which is a separate connect/close. Acceptable for v1 given that every other module in the repo accepts the same posture; revisit only if a real consumer surfaces latency.

**No Mongo transactions in v1.** Ordering inside a handler invocation is preserved (sub-steps are awaited sequentially), but atomicity is not. The failure-mode story is the same risk class as `summary` writeback drift — caller retry is safe (idempotency guards converge), periodic reconciliation is the catch-all. Transactions are not available through the community-plugin dispatcher; if a future consumer needs ACID across a submit, the engine would need a parallel raw-driver path — out of scope for v1.

> **Supersedes [engine review-1's "Client and transaction model" resolution](designs/workflows-module-concept/engine/review/review-1.md).** Review-1 settled on a single-`MongoClient`-per-invocation raw-driver shape; this section walks that back to the community-plugin dispatcher to align with every other module in the repo, pick up `changeLog` integration for free, and reuse the prior-generation `WorkflowAPI` implementation under `plugins/modules-mongodb-plugins/src/connections/old/`. See [review/review-2.md](designs/workflows-module-concept/engine/review/review-2.md) for the rationale.

## Schema

### Workflow doc

| Field                      | Type           | Notes                                                                                                                                                                                                                                                                                                             |
| -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_id`                      | string         | server-generated                                                                                                                                                                                                                                                                                                  |
| `workflow_type`            | string         | from YAML                                                                                                                                                                                                                                                                                                         |
| `key`                      | string \| null | optional partition key                                                                                                                                                                                                                                                                                            |
| `display_order`            | number         | from YAML                                                                                                                                                                                                                                                                                                         |
| `entity_id`                | string         | the entity's `_id`                                                                                                                                                                                                                                                                                                |
| `entity_collection`        | string         | MongoDB collection connection id, e.g. `leads-collection`                                                                                                                                                                                                                                                         |
| `parent_action_id`         | string \| null | tracker-action `_id` if this workflow is a child                                                                                                                                                                                                                                                                  |
| `parent_entity_id`         | string \| null | parent entity's `_id` if child                                                                                                                                                                                                                                                                                    |
| `parent_entity_collection` | string \| null | parent's collection connection id if child                                                                                                                                                                                                                                                                        |
| `status`                   | array          | history, newest at index 0; `[{ stage, created, ... }]`                                                                                                                                                                                                                                                           |
| `summary`                  | object         | `{ done, not_required, total }`                                                                                                                                                                                                                                                                                   |
| `groups`                   | array          | persisted group state — `[{ id, status, summary }]`, one entry per declared `action_groups[]`. `status` is the three-value derived enum (`blocked` / `in-progress` / `done`); `summary` is per-group `{ done, not_required, total }`. Written back eagerly inside `SubmitWorkflowAction`. See action-groups spec. |
| `form_data`                | object         | per-action form data (see "Form data layout" below). Initially `{}`.                                                                                                                                                                                                                                              |
| `created`, `updated`       | change_stamp   | per events module convention                                                                                                                                                                                                                                                                                      |
| `<reference keys>`         | various        | spread from `references` payload, e.g. `company_ids`, `region_ids`                                                                                                                                                                                                                                                |

### Action doc

| Field                            | Type           | Notes                                                                                |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| `_id`                            | string         | server-generated                                                                     |
| `workflow_id`                    | string         | parent workflow's `_id`                                                              |
| `type`                           | string         | from YAML                                                                            |
| `kind`                           | string         | `form` \| `check` \| `tracker`                                                       |
| `key`                            | string \| null | for fan-out actions (non-tracker); domain id like a device serial                    |
| `status`                         | array          | history, newest at index 0                                                           |
| `entity_id`, `entity_collection` | various        | matches parent workflow                                                              |
| `assignees`                      | string[]       | universal field                                                                      |
| `due_date`                       | Date \| null   | universal field                                                                      |
| `description`                    | string \| null | universal field                                                                      |
| `tracker`                        | object \| null | `{ workflow_type }` on tracker actions only                                          |
| `child_workflow_id`              | string \| null | tracker actions; set when child workflow is started (the child workflow doc's `_id`) |
| `child_entity_id`                | string \| null | tracker actions; set when child workflow is started                                  |
| `child_entity_collection`        | string \| null | tracker actions; collection connection id                                            |
| `<reference keys>`               | various        | spread from `references` payload                                                     |

### Form data layout

Per-workflow `form_data` keyed by action type, with optional key segment for instanced actions. **One flat tree per action — no reserved sub-keys.**

```
form_data: {
  {action_type}: {                         // non-keyed action
    {field}: <value>,                      // submitter (form:) + reviewer (form_review:)
                                           //   share the same flat namespace
  },
  {action_type_with_key}: {                // keyed action (action-authoring Decision 9)
    {key}: {
      {field}: <value>,
    },
  },
}
```

**Path rules:**

- Non-keyed: `form_data.{action_type}.{field}`.
- Keyed: `form_data.{action_type}.{key}.{field}`.
- No `.review` namespace — reviewer values share the action-type tree with submitter values; authors pick non-colliding names.
- No `.error` namespace — error context lives on the `events` collection entry written by step 7 of the submit lifecycle, surfaced via `event_overrides.metadata` (see [submit-pipeline § Pre-hook return](../submit-pipeline/spec.md#pre-hook-return-all-fields-optional) and "Action `error` transition" below). Status entries themselves are uniform `{ stage, created, event_id }`.

**Write semantics:** per-field `$set` on dot-notation paths. Field-level granularity so concurrent edits on different fields don't clobber. Submitter (`form:`) and reviewer (`form_review:`) payloads are merged into one bag before write; the engine doesn't disambiguate.

### Action `error` transition

`error` is a purely **author-driven** domain stage. Engine sub-step failures do not write an `error` transition — they throw, and the throw propagates to `CallApi` (rationale and partial-write retry semantics in [Part 29 § D1](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#d1-why-throwing-is-safer-than-force-writing-error)).

Two entry paths push an action into `error` (both form and check kind):

- **Pre-hook `error` signal.** A pre-hook fires `error` against *another* action via `actions: [{ type, signal: error }]` ([submit-pipeline § Pre-hook return](../submit-pipeline/spec.md#pre-hook-return-all-fields-optional)). The form/check FSM accepts `error` from every non-terminal state (`action-required`, `in-progress`, `in-review`, `changes-required`, `blocked`) → `error`. This replaces the v0 `{ ..., status: 'error' }` return. There is no way to error the *current* action from its own pre-hook — to fail a submission, `:reject` / `throw` instead.
- **External systems.** Out-of-band processes (backend microservices, scheduled lambdas) write directly to the action doc, or in future will go through a follow-on injection API.

The engine never sets `error` itself — engine sub-step failures **throw**, surfacing as an API-level reject/error toast (submit-pipeline), not an action-status transition.

Status entries are uniform `{ stage, created, event_id }` — there are no polymorphic `{ reason, error_message, error_metadata }` fields. Diagnostic context lives on the `events` collection entry written by step 7, carried via `event_overrides.metadata` on the pre-hook return (same channel as every other status push).

**Recovery.** A normal submission from the `-error` page — the user clicks the template-shipped `resolve_error` button, which calls the per-action endpoint with `signal: resolve_error`. The form FSM resolves `error → resolve_error → in-review` ([state-machine](../state-machine/design.md)); the previous `{ stage: error, ... }` entry stays in the status array as audit history. No `force`, no special-cased recovery leg — `resolve_error` is an ordinary signal with an ordinary FSM transition. No `form_data` cleanup needed.

### Indexes

The engine assumes the following indexes exist on the consuming app's `workflows` and `actions` collections. The module README ships them as a "Required indexes" section — same convention as every other module in this repo (`activities`, `companies`, `notifications` all document indexes prose-style without auto-asserting). Consumers create them via the repo's `r:index-dev` migration skill or directly in Atlas/mongo shell.

- `actions`: unique `(workflow_id, type, key)`.
- `actions`: `(entity_collection, entity_id)` for `get-entity-workflows`.
- `workflows`: `(entity_collection, entity_id)` for `get-entity-workflows`.
- No reverse-lookup index for tracker subscription — primary-key lookup on the child's `parent_action_id` serves it.

The engine does not assert these at runtime; the dispatcher delegates every read/write to community-plugin handlers that don't expose a startup hook.

## Capabilities

- **`StartWorkflow`** writes a workflow doc + N action docs. When `parent_action_id` is in the payload, the engine validates the action exists, is `kind: tracker`, and isn't already linked (`child_workflow_id` is null), then writes the new workflow's `parent_action_id` / `parent_entity_id` / `parent_entity_collection` (latter two read from the parent action's `entity_id` / `entity_collection`) and the parent tracker action's `child_workflow_id` (the new workflow's `_id`) / `child_entity_id` / `child_entity_collection` + `in-progress` transition. All writes share the same handler invocation.
- **`SubmitWorkflowAction`** resolves one or more signals against the FSM per call. Payload uses `keys: [...]` plural; the plugin flat-maps over `keys` (omitted → one op `key: null`; `[]` → zero ops; `[k]` → one op `key: k`; `[k1,k2,...]` → N ops). On-disk action docs keep singular `key`. For each staged signal it resolves `transitions[kind][currentStatus][signal]` and writes the resulting status (an unlisted cell no-ops, no write). After action writes, recomputes affected `groups[]` statuses and writes them to the workflow doc; re-evaluates every blocked action's `blocked_by` against the new state and fires `unblock` on those whose dependencies are now terminal; runs auto-complete check (all actions terminal → push `completed` to workflow status); fires tracker subscription if workflow status changed; recomputes workflow-level `summary` (eager writeback). Returns `{ action_ids, completed_groups, event_id, tracker_fired, pre_hook_response, post_hook_response }` on success — `completed_groups` lists groups that transitioned to `done` in this call; the engine fans out one `context.callApi` per `on_complete` engine-internally as step 11 of the submit-pipeline lifecycle (see action-groups Decision 6, submit-pipeline Decision 1). **Failures throw** — there is no failure-return shape, no `error_transition` / `hook_error` / `post_hook_error` fields. Sub-step throws propagate to `CallApi`; the user retries the same submit and the FSM idempotency guards converge (see [Part 29 § D1, § D6](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#d1-why-throwing-is-safer-than-force-writing-error)).
- **`CancelWorkflow`** pushes `cancelled` to workflow status; emits the `internal_cancel_action` signal against every open action on the workflow (the form/check/tracker FSMs resolve it to `not-required` from any non-terminal state). References at the call level spread onto the workflow doc on the cancelled push.
- **Universal action fields** (`assignees`, `due_date`, `description`) flow through `SubmitWorkflowAction` payload's `actions[].fields`. Merged into per-action `$set` atomically with the status transition. `null` clears; omitted leaves unchanged.
- **Access enforcement** — runs the per-app, per-verb role gates from action-authoring Decision 3 ("Action access semantics") at two server-side points: (1) **`get-entity-workflows`** evaluates each declared verb's gate (`true` or role-array) against the caller's `_user.apps.{app_name}.roles` and projects `visible_verbs: { view, edit, review, error }` onto each action; an action with all four `false` drops from the response. (2) **`SubmitWorkflowAction` handler** reads the interaction's required verb (`submit_edit`/`not_required` → `edit`; `resolve_error` → `error`; `approve`/`request_changes` → `review`), checks `access.{current_app}.{required_verb}` against `_user.apps.{current_app}.roles` before writes, and rejects with a structured error on mismatch (e.g. role revoked between render and submit). This handler check is the authoritative gate; the central `api.roles` glob over the submit endpoint id is the coarse outer fence (Part 34 D10–D11).

### `SubmitWorkflowAction` payload

```
{
  currentActionId: string | null,    // the action the user fired the signal against; same as the per-action endpoint's action_id (submit-pipeline). The current action lands per that fired signal; a pre-hook cannot re-signal it.
  actions: [
    { type, signal, keys?, fields?, references?, upsert?, status? }
                                     //   signal: the named signal to resolve against this target's
                                     //     FSM (transitions[kind][currentStatus][signal]); unlisted
                                     //     cell = silent no-op. No `force` — the FSM no-op replaces
                                     //     the priority bypass.
                                     //   status: ONLY for upsert spawns — the initial status of a
                                     //     newly-created keyed instance (creation seed, not a transition).
                                     //   upsert: when true, creates a new keyed instance in `status`.
  ],
  eventId: string,                   // generated by SubmitWorkflowAction on entry; threaded through every write in this invocation
}
```

**Footgun: `keys: []` is silent.** Authors computing `keys` from `_array.map` over a possibly-empty payload field will skip the unblock with no error. Gate with `skip` / `_if` on `keys.length` to surface the empty case as validation.

## References write contract

The `references` map is spread onto the doc root at write time. Stored docs have no `references` key; queries are flat (`{ company_ids: 'C1' }`); indexes live at root. Apps add their own indexes for the reference keys they query.

**Update semantics**: replace per-key. `references: { company_ids: [C2] }` replaces the doc's `company_ids` and leaves other root-level reference fields untouched (Mongo `$set` semantics).

**Reserved-keys enforcement via merge order:**

```js
const doc = {
  ...actionUpdate.references, // spread first
  _id: actionId,
  workflow_id,
  type,
  entity_id,
  entity_collection,
  ...(actionUpdate.fields ?? {}),
  // ... other core fields ...
};
```

Reserved keys: `_id`, `workflow_id`, `type`, `entity_id`, `entity_collection`, `key`, `status`, `summary`, `created`, `updated`, `assignees`, `due_date`, `description`, `tracker`, `child_workflow_id`, `child_entity_id`, `child_entity_collection`, `parent_action_id`, `parent_entity_id`, `parent_entity_collection`. Collisions are silently overridden by core fields; no validation throws in v1.

## Tracker subscription

**Terminology.** A tracker action lives on a parent workflow with `kind: tracker` and a `tracker:` block. It mirrors a child workflow. Data flow is **child → parent**: a child status change emits the matching `internal_mirror_child_*` signal against the parent tracker action (via the hard-coded child-stage → tracker signal map), which the tracker FSM resolves.

**Child-stage → tracker signal map** (fixed by the module; apps cannot override per action). Each child stage maps to a `internal_mirror_child_*` signal; the tracker kind's FSM table ([state-machine](../state-machine/design.md)) maps each signal to the parent status, conditional on the tracker's current state:

| Child workflow stage | Tracker signal emitted            | Tracker target (typical) |
| -------------------- | --------------------------------- | ------------------------ |
| `active`             | `internal_mirror_child_active`    | `in-progress`            |
| `completed`          | `internal_mirror_child_completed` | `done`                   |
| `cancelled`          | `internal_mirror_child_cancelled` | `not-required`           |

**Mechanism**: synchronous in-process within `SubmitWorkflowAction`. When the handler writes a workflow's `status[0].stage` (via auto-complete or `CancelWorkflow`), it reads the workflow's `parent_action_id` and fetches the tracker action by primary key. If the new stage maps to a signal, the engine emits that signal against the tracker action via an inner `emitSignal` call (no `force`). The tracker FSM accepts `internal_mirror_child_*` from `done` / `not-required` too, so a child that re-activates or completes after the tracker had landed terminal recovers the parent — the backward-move case the priority-rule model needed `force` for. An unlisted cell no-ops silently.

**Pseudo-code:**

```js
// Child workflow stage → the tracker signal the engine emits against the parent.
const CHILD_STAGE_SIGNAL = {
  active: "internal_mirror_child_active", // → in-progress
  completed: "internal_mirror_child_completed", // → done
  cancelled: "internal_mirror_child_cancelled", // → not-required
};

async function pushWorkflowStatus(context, workflowId, newStage, eventId) {
  const { mongoDBConnection } = context;
  const current = await mongoDBConnection("workflows").MongoDBFindOne({
    query: { _id: workflowId },
    options: {
      projection: { status: 1, workflow_type: 1, parent_action_id: 1 },
    },
  });
  if (current?.status?.[0]?.stage === newStage) return; // idempotency guard

  await writeWorkflowStatus(context, workflowId, newStage, eventId);

  if (!current.parent_action_id) return;
  const tracker = await mongoDBConnection("actions").MongoDBFindOne({
    query: { _id: current.parent_action_id },
  });
  if (!tracker) return;

  const signal = CHILD_STAGE_SIGNAL[newStage];
  if (!signal) return; // unmapped child stage → no signal, no parent update

  await emitSignal(context, {
    currentActionId: null,
    actions: [{ type: tracker.type, key: tracker.key, signal }],
    eventId, // reuse the same eventId — the tracker update is part of this transition
  });
  // No `force`. emitSignal resolves transitions[tracker.kind][tracker.status][signal];
  // an unlisted entry no-ops silently.
}
```

**One-to-one constraint**: each child workflow has at most one `parent_action_id`; each tracker action has at most one `child_workflow_id`. Apps needing the same physical event to drive multiple parents spawn separate child workflows per parent.

## Idempotency

- **Action signal emissions** are guarded by the FSM tables (see "Signal-driven FSM transitions"). Re-firing a signal against an action that has already moved past the signal's reach resolves to an undefined cell and writes nothing — e.g. re-firing `approve` against a `done` action (`done` has no `approve` transition) is a silent no-op; re-firing `unblock` against an already-unblocked `action-required` action is a silent no-op. This re-fire safety is the structural guarantee the priority rule used to provide; the protection is automatic from the table.
- **Workflow status pushes** are not signal-driven and not covered by the FSM. Guarded by a same-stage no-op check at the top of `pushWorkflowStatus` — reads `status[0].stage`, returns early if it equals the new stage. Prevents duplicate `$push` and double-firing tracker subscription on retry.
- **Submit retry is safe end-to-end:** the engine's idempotency guards converge to the same state; the side-effect steps inside `SubmitWorkflowAction` (log event, notifications dispatch) are the leaky cases — known cost, duplicate events / notifications on retry.

## Signal-driven FSM transitions

Every status mutation is the result of a named **signal** fired against an action. The plugin's transition resolver reads the action's `kind` and current `status[0].stage`, then looks up `transitions[kind][currentStatus][signal]` ([state-machine](../state-machine/design.md) owns the per-kind tables):

- **A listed cell** gives the new status; the engine writes it.
- **An unlisted cell** is a silent no-op — no write, no error. This replaces the priority rule's strict-less-than ordering: re-fires against states past a signal's reach (and signals against terminal states) can't regress an action.

`currentActionId` carries the user-fired action's id — the per-action endpoint's `action_id` payload field maps directly to `currentActionId` inside the handler. The current action lands per the signal the user fired; a pre-hook cannot re-signal it. Every `actions[]` entry names its own *other* target and signal.

**Three emitters, one resolution.** Signals come from (1) user button clicks, (2) engine cascades (`unblock` on `blocked_by` satisfaction, `internal_mirror_child_*` from the tracker subscription, `internal_cancel_action` from `CancelWorkflow`), and (3) pre-hook `actions[]` entries against other actions. All resolve through the same FSM lookup. There is no separate user-driven-vs-auxiliary code path — the old `currentActionId` self-exception is gone (the tables list same-state transitions explicitly where wanted, e.g. `in-progress → progress → in-progress`).

**Unknown signal names throw.** The signal vocabulary is engine-locked in v1, so the handler has the complete known-signal list at entry. A signal name not in that list is a programming error and throws (same posture as a missing `actions[]` target) — distinct from an *unlisted transition* (known signal, state doesn't accept it), which is the meaningful silent no-op.

**No `force: true`.** All mutations go through the FSM; there is no per-call or per-entry bypass. Migrations and admin overrides stay out-of-band (direct DB writes). Engine-internal write paths use explicit `internal_*` signals declared in the FSM tables (`internal_cancel_action`, `internal_mirror_child_*`) — the backward moves tracker writes used to need `force` for (e.g. a child uncancelling to push the parent `not-required → in-progress`) are now listed transitions in the tracker table.

**`priority` is display-only.** The module-shipped status enum still orders the eight statuses for pickers and visualizations, but `priority` numbers no longer drive transition legality.

## Ordering inside one `SubmitWorkflowAction` invocation

The full 11-step lifecycle (validate → pre-hook → writes → side effects → post-hook → return) is owned by [submit-pipeline Decision 1](../submit-pipeline/design.md#decision-1--submitworkflowaction-replaces-updateworkflowactions). Engine ownership inside that lifecycle covers steps 1, 3–8, 12 (validation, auto-unblock computation, action transitions, summary + groups recompute, form_data writes, workflow-doc updates, tracker subscription). The internal write-ordering for the engine's contribution:

1. **Validate.** Payload shape, action exists, action belongs to caller's accessible workflows, the per-verb access gate passes — `access.{current_app}.{interaction-required-verb}` intersects `_user.apps.{current_app}.roles` (or is `true`) — and signal name is known (unknown signal names throw — see "Signal-driven FSM transitions"). (Submit-pipeline lifecycle step 1.)
2. **Compute auto-unblocks.** Walk the workflow's `blocked_by` graph; for each action whose dependencies are now terminal, stage an `unblock` signal. Merge pre-hook `actions[]` signals (precedence) with auto-unblocks. (Lifecycle steps 3–4.)
3. **Resolve and write action transitions.** For each staged signal, resolve `transitions[kind][currentStatus][signal]`; write the resulting status (unlisted cell = no-op, no write). (Lifecycle step 5.)
4. **Recompute affected groups' statuses**; write `groups[]` back to the workflow doc (action-groups Decision 4). (Lifecycle step 6.)
5. **Re-evaluate `blocked_by`** for every blocked action against the new group/action state; fire `unblock` on those whose dependencies are now terminal (action-groups Decision 2).
6. **Auto-complete check** on the workflow if all actions are terminal — push `completed` to workflow status. Re-run after step 5.
7. **Write `form_data`** per-field `$set` (engine Decision 5 layout); write workflow-doc updates (summary, groups, form_data) in one Mongo update where possible. (Lifecycle steps 7–8.)
8. **Generate log event** + **dispatch notifications** + **fire group `on_complete` pipelines** for any groups that transitioned to `done` in step 4 — all via `context.callApi` (submit-pipeline Decision 6). (Lifecycle steps 9–11.)
9. **Tracker subscription**: if step 6 pushed a workflow status, run the synchronous in-process subscription via internal `emitSignal` recursion firing the `internal_mirror_child_*` signal against the parent tracker action (Decision 3). (Lifecycle step 12.)
10. **Recompute the workflow's `summary`** (eager writeback).
11. **Return** `{ action_ids, completed_groups, event_id, tracker_fired?, pre_hook_response?, post_hook_response? }` — `completed_groups` lists groups that transitioned to `done` in step 4; `tracker_fired` is populated when step 9 propagated to a parent.

Pre-hook (lifecycle step 2) and post-hook (lifecycle step 13) are bracketed around this engine-internal sequence by submit-pipeline; they aren't part of the engine's own ordering concerns beyond hosting the calls via `context.callApi`.

Summary recompute is idempotent — nested recursion may recompute the same workflow's summary twice. Idempotent writes; bounded cost. `completed_groups` is computed from step 4's transitions, so a retry that no-ops step 4 returns an empty `completed_groups` (the hook doesn't fire twice).

## Worked example: 2-level nested auto-complete

**Setup.** Two workflows on two entities, bidirectionally linked:

- **Workflow A** on a `lead` (`entity_collection: leads-collection`). Two actions: `qualify` (form, `in-review`) and `track-installation` (tracker, `in-progress`, `child_workflow_id: Workflow B._id`, `child_entity_id: ticket._id`, `child_entity_collection: tickets-collection`, `tracker.workflow_type: device-installation`). `parent_*` fields null.
- **Workflow B** on a `ticket` (`entity_collection: tickets-collection`), `workflow_type: device-installation`. One action: `install-device` (form, `in-review`). `status = [{active}]`, `parent_action_id: track-installation._id`, `parent_entity_id: lead._id`, `parent_entity_collection: leads-collection`.

**A reviewer approves `install-device`** via `workflow-device-installation-install-device-submit` (per-action endpoint, submit-pipeline) with `signal: approve`. The endpoint passes `action_id` straight through to `SubmitWorkflowAction`, which generates `eventId E1` on entry; the form FSM resolves `in-review → approve → done`.

**Trace:**

```
emitSignal(currentActionId=install-device._id, actions=[{type: install-device, signal: approve}], eventId=E1)
├─ step 3 (resolve+write): form FSM in-review → approve → done; install-device.status = done
├─ step 6 (auto-complete check): B fully terminal → pushWorkflowStatus(B, 'completed', E1)
│   ├─ same-stage guard: B.status[0]='active' ≠ 'completed' → proceed
│   ├─ writeWorkflowStatus(B, 'completed')
│   ├─ step 9 (tracker subscription): load tracker by B.parent_action_id (primary-key)
│   └─ emitSignal(actions=[{type: track-installation, signal: internal_mirror_child_completed}], eventId=E1)
│       ├─ step 3 (resolve+write): tracker FSM in-progress → internal_mirror_child_completed → done; track-installation.status = done
│       ├─ step 6 (auto-complete check): A not terminal (qualify still in-review) → no pushWorkflowStatus
│       └─ step 10 (summary recompute): recomputeSummary(A) → { done: 1, not_required: 0, total: 2 }
└─ step 10 (summary recompute): recomputeSummary(B) → { done: 1, not_required: 0, total: 1 }
```

**End state.** B auto-completed; A unchanged status array (qualify still in-review); A's summary reflects track-installation now done. One `eventId` across all writes.

**Retry.** A retried submit produces no duplicate writes: re-firing `approve` against the now-`done` action resolves to an undefined FSM cell → silent no-op; same-stage guard no-ops the workflow push; tracker doesn't refire; summary recompute is idempotent.

## Open questions (in scope; deferred)

1. **Cycle protection.** Engine doesn't statically prove acyclicity. If real apps surface pathological linking, add a runtime depth-limit guard (default 10) failing with a clear error.
2. **Change-stream subscription variant.** Reopen if multi-process writers, direct DB writes, or migration tooling become real triggers.

## Risks

- **Plugin dual-runtime build complexity.** First-time server-side code in this package; verified by hard `src/` split + dist-output React-leak grep + plugin-loader smoke test before declaring done.
- **No transactional atomicity in v1.** Mid-sequence handler failure leaves partial writes. Mitigation: caller retry (idempotent), periodic reconciliation. Transactions are not available through the community-plugin dispatcher; a future ACID path would require a parallel raw-driver helper.
- **Connection-per-call cost.** Each helper-issued request opens and closes its own `MongoClient` via the community plugin. Driver-side pooling makes this cheap in steady state but a single `SubmitWorkflowAction` invocation issues many separate connect/close cycles. Acceptable for v1 (same posture every other module accepts); revisit if a real consumer surfaces latency.
- **Workflow-doc write contention** under highly-parallel workflows. Mitigation: opt-in `summary_dirty: true` lazy-writeback per workflow YAML.
- **Cross-module API invocation from the engine handler** — `SubmitWorkflowAction` calls events `new-event`, notifications `send-notification`, and pre/post hook APIs via `context.callApi` (see [call-api](../call-api/spec.md)). Cross-module reference is a verified pattern (contacts module's `update-contact` does it from YAML); first-time JS-side use is via the call-api primitive.
- **Tracker subscription drift.** Same risk class as summary writeback; periodic reconciliation as catch-all.
- **`keys: []` silent no-op.** Documentation-only mitigation in v1; `allowEmpty: true` opt-in flag is a future change.
- **Consumer-owned indexes.** Engine assumes the three indexes listed under [§ Indexes](#indexes) exist; engine code doesn't assert them at runtime. Drift risk if consumers skip the index creation step in their migration pipeline. Mitigation: required-indexes section in the workflows module README (same convention as every other module in this repo); flag in onboarding checklist.
