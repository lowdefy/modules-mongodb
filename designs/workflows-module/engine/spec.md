# Workflows Engine — Spec

Server-side runtime for the workflows module. Full rationale in [design.md](design.md); this file carries only the committed decisions.

## Plugin shape

`@lowdefy/modules-mongodb-plugins` grows a server-side `WorkflowAPI` connection. The package is client-only today (`connections: []`, `requests: []`); v1 makes it dual-runtime.

### Connection structure

```
src/connections/WorkflowAPI/
  WorkflowAPI.js                    # registers handlers via { schema, requests: { ... } }
  UpdateWorkflowActions/
    UpdateWorkflowActions.js
    handleUpdateActions.js
    createAction.js
    updateAction.js
    utils/{shouldUpdate,shouldCreate,getCurrentAction}.js
  StartWorkflow/
    StartWorkflow.js
    createActions.js
  CancelWorkflow/
    CancelWorkflow.js
  shared/
    createMongoDBConnection.js       # opens one MongoClient; returns { client, workflowsCollection, actionsCollection }
    getActions.js                    # bulk fetch by workflow_id
    getActionFields.js               # current core fields for a payload action_id
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

- Add `mongodb` to `dependencies`.
- `@lowdefy/helpers` already a peerDep (server-side available).
- Bump package version; update workflows module's `plugins:` entry to require the new minor.

### Dual-runtime build milestone

Hard split: client code in `src/blocks/`, `src/actions/`, `src/metas.js`; server code in `src/connections/`. `.swcrc` (`jsx: true`, classic React runtime) is verified to produce clean server-side dist files via grep for `react`/`React`/`jsx-runtime` after build. Plugin-loader smoke test (`types.js` discovery of `WorkflowAPI`) before declaring done.

## Client and transaction model

`WorkflowAPI` handlers open **one `MongoClient` per invocation** at handler entry, thread a shared `ctx = { client, workflowsCollection, actionsCollection }` through every sub-step, close on exit.

```js
async function UpdateWorkflowActions({ request, connection }) {
  const ctx = await createMongoDBConnection(connection);
  try {
    return await handleUpdateActions(ctx, request);
  } finally {
    await ctx.client.close();
  }
}
```

No Mongo transactions in v1. Ordering is preserved (sequential writes); atomicity is not. The failure-mode story is the same risk class as `summary` writeback drift — caller retry is safe (idempotency guards converge), periodic reconciliation is the catch-all. `session.withTransaction(...)` is a purely-additive opt-in inside the handler.

## Schema

### Workflow doc

| Field                      | Type           | Notes                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_id`                      | string         | server-generated                                                                                                                                                                                                                                                                                                   |
| `workflow_type`            | string         | from YAML                                                                                                                                                                                                                                                                                                          |
| `key`                      | string \| null | optional partition key                                                                                                                                                                                                                                                                                             |
| `display_order`            | number         | from YAML                                                                                                                                                                                                                                                                                                          |
| `entity_type`              | string         | scalar, e.g. `lead`                                                                                                                                                                                                                                                                                                |
| `entity_id`                | string         | the entity's `_id`                                                                                                                                                                                                                                                                                                 |
| `entity_collection`        | string         | MongoDB collection connection id, e.g. `leads-collection`                                                                                                                                                                                                                                                          |
| `parent_action_id`         | string \| null | tracker-action `_id` if this workflow is a child                                                                                                                                                                                                                                                                   |
| `parent_entity_id`         | string \| null | parent entity's `_id` if child                                                                                                                                                                                                                                                                                     |
| `parent_entity_collection` | string \| null | parent's collection connection id if child                                                                                                                                                                                                                                                                         |
| `status`                   | array          | history, newest at index 0; `[{ stage, created, ... }]`                                                                                                                                                                                                                                                            |
| `summary`                  | object         | `{ done, not_required, total }`                                                                                                                                                                                                                                                                                    |
| `groups`                   | array          | persisted group state — `[{ id, status, summary }]`, one entry per declared `action_groups[]`. `status` is the three-value derived enum (`blocked` / `in-progress` / `done`); `summary` is per-group `{ done, not_required, total }`. Written back eagerly inside `UpdateWorkflowActions`. See action-groups spec. |
| `form_data`                | object         | per-action form data (see "Form data layout" below). Initially `{}`.                                                                                                                                                                                                                                               |
| `created`, `updated`       | change_stamp   | per events module convention                                                                                                                                                                                                                                                                                       |
| `<reference keys>`         | various        | spread from `references` payload, e.g. `company_ids`, `region_ids`                                                                                                                                                                                                                                                 |

### Action doc

| Field                                           | Type           | Notes                                                                                |
| ----------------------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| `_id`                                           | string         | server-generated                                                                     |
| `workflow_id`                                   | string         | parent workflow's `_id`                                                              |
| `type`                                          | string         | from YAML                                                                            |
| `kind`                                          | string         | `form` \| `task` \| `tracker`                                                        |
| `key`                                           | string \| null | for fan-out actions (non-tracker); domain id like a device serial                    |
| `status`                                        | array          | history, newest at index 0                                                           |
| `entity_type`, `entity_id`, `entity_collection` | various        | matches parent workflow                                                              |
| `assignees`                                     | string[]       | universal field                                                                      |
| `due_date`                                      | Date \| null   | universal field                                                                      |
| `description`                                   | string \| null | universal field                                                                      |
| `tracker`                                       | object \| null | `{ workflow_type }` on tracker actions only                                          |
| `child_workflow_id`                             | string \| null | tracker actions; set when child workflow is started (the child workflow doc's `_id`) |
| `child_entity_id`                               | string \| null | tracker actions; set when child workflow is started                                  |
| `child_entity_collection`                       | string \| null | tracker actions; collection connection id                                            |
| `<reference keys>`                              | various        | spread from `references` payload                                                     |

### Form data layout

Per-workflow `form_data` keyed by action type, with optional key segment for instanced actions and reserved `.review` / `.error` sub-keys:

```
form_data: {
  {action_type}: {                         // non-keyed action
    {field}: <value>,                      // submitter values (form: blocks)
    review: { {field}: <value> },          // reviewer values (form_review: blocks)
    error:  { message, step },             // engine-written on failed submit
  },
  {action_type_with_key}: {                // keyed action (action-authoring Decision 9)
    {key}: {
      {field}: <value>,
      review: { {field}: <value> },
      error:  { ... },
    },
  },
}
```

**Path rules:**

- Non-keyed: `form_data.{action_type}.{field}`.
- Keyed: `form_data.{action_type}.{key}.{field}`.
- Reviewer values: `form_data.{action_type}.review.{field}` (or `.{key}.review.{field}`).
- Engine error context: `form_data.{action_type}.error.{field}` (or `.{key}.error.{field}`).

**Reserved sub-keys** within `form_data.{action_type}` / `form_data.{action_type}.{key}`: `review`, `error`. Build-time validation flags `form:` / `form_review:` blocks with these names.

**Write semantics:** per-field `$set` on dot-notation paths. Field-level granularity so concurrent edits on different fields don't clobber, reviewer/submitter writes don't collide, and engine error writes don't disturb either side.

### Action `error` transition

Two entry paths put an action into `error` status:

- **Engine-driven mid-submit failure.** The submit pipeline catches a thrown failure from a sub-step (submit hook, entity_update, event, notification dispatch) and converts it to an `error` transition: writes `{ stage: error, created, reason: <step-name>, error_message }` to the action's `status` array with **`force: true` semantics** (bypasses priority rule); writes captured failure context to `form_data.{action_type}.error.{field}` (or `.{key}.error.{field}`) — conventional fields `message`, `step`, `timestamp`; skips remaining auto-complete / tracker-subscription / group-rollup work (an `error` action is non-terminal); returns partial `{ action_ids, event_id }`.
- **Author-driven.** Submit-hook routine calls `submit-action` with `current_status: error` for app-validated business-rule failures. Engine treats this identically to the engine-driven path; author supplies the error fields via the `form` payload using `error.*` field names (engine routes to the reserved `.error` sub-key).

**Force-write rationale.** Priority rule would otherwise reject `error` pushes from terminal statuses. Operationally an error must always surface — a `done` transition that fails mid-side-effects needs to roll back to `error` so the user sees recovery, not a falsely-completed action.

**Recovery.** A normal `submit-action` call from the `-error` page; on success, engine clears `form_data.{action_type}.error` fields via per-field `$set` (or overwrites individually for partial recovery) and transitions the action out of `error`.

### Indexes

- `actions`: unique `(workflow_id, type, key)`.
- `actions`: `(entity_type, entity_id)` for `get-entity-workflows`.
- `workflows`: `(entity_type, entity_id)` for `get-entity-workflows`.
- No reverse-lookup index for tracker subscription — primary-key lookup on the child's `parent_action_id` serves it.

## Capabilities

- **`StartWorkflow`** writes a workflow doc + N action docs. When `parent_action_id` is in the payload, the engine validates the action exists, is `kind: tracker`, and isn't already linked (`child_workflow_id` is null), then writes the new workflow's `parent_action_id` / `parent_entity_id` / `parent_entity_collection` (latter two read from the parent action's `entity_id` / `entity_collection`) and the parent tracker action's `child_workflow_id` (the new workflow's `_id`) / `child_entity_id` / `child_entity_collection` + `in-progress` transition. All writes share the same handler invocation.
- **`UpdateWorkflowActions`** writes one or more action transitions per call. Payload uses `keys: [...]` plural; the plugin flat-maps over `keys` (omitted → one op `key: null`; `[]` → zero ops; `[k]` → one op `key: k`; `[k1,k2,...]` → N ops). On-disk action docs keep singular `key`. After action writes, recomputes affected `groups[]` statuses and writes them to the workflow doc; re-evaluates every blocked action's `blocked_by` against the new state and pushes `action-required` on those whose dependencies are now terminal; runs auto-complete check (all actions terminal → push `completed` to workflow status); fires tracker subscription if workflow status changed; recomputes workflow-level `summary` (eager writeback). Returns `{ action_ids, completed_groups, event_id }` — `completed_groups` lists groups that transitioned to `done` in this call (consumed by outer Layer-1 orchestration that fans out `on_complete` hooks; see action-groups Decision 6).
- **`CancelWorkflow`** pushes `cancelled` to workflow status; flips remaining open actions on the workflow to `not-required`. References at the call level spread onto the workflow doc on the cancelled push.
- **Universal action fields** (`assignees`, `due_date`, `description`) flow through `UpdateWorkflowActions` payload's `actions[].fields`. Merged into per-action `$set` atomically with the status transition. `null` clears; omitted leaves unchanged.
- **Access enforcement** — runs the per-app verb filter + role gate from action-authoring Decision 3 ("Action access semantics") at two server-side points: (1) **`get-entity-workflows`** filters returned actions by host app's verb map and intersects caller's `_user: roles` with `access.roles`. (2) **`submit-action`** re-checks role gate before writes; rejects with structured error on mismatch (role revoked between render and submit). Verb-filter check at submit-time is implicit (page wouldn't have been generated if verb wasn't allowed in current app).

### `UpdateWorkflowActions` payload

```
{
  currentActionId: string | null,    // the action the user submitted on; aliased from submit-action's action_id
  actions: [
    { type, status, keys?, fields?, references? }
  ],
  eventId: string,                   // generated upstream by submit-action's :set_state:
  force: true | false                // per-call; bypasses priority rule + universal-terminal exception
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
  entity_type,
  entity_id,
  entity_collection,
  ...(actionUpdate.fields ?? {}),
  // ... other core fields ...
};
```

Reserved keys: `_id`, `workflow_id`, `type`, `entity_type`, `entity_id`, `entity_collection`, `key`, `status`, `summary`, `created`, `updated`, `assignees`, `due_date`, `description`, `tracker`, `child_workflow_id`, `child_entity_id`, `child_entity_collection`, `parent_action_id`, `parent_entity_id`, `parent_entity_collection`. Collisions are silently overridden by core fields; no validation throws in v1.

## Tracker subscription

**Terminology.** A tracker action lives on a parent workflow with `kind: tracker` and a `tracker:` block. It mirrors a child workflow. Data flow is **child → parent**: child status changes drive parent action status writes via the hard-coded child-stage map.

**Child-stage map** (fixed by the module; apps cannot override per action):

| Child workflow stage | Parent tracker action stage |
| -------------------- | --------------------------- |
| `active`             | `in-progress`               |
| `completed`          | `done`                      |
| `cancelled`          | `not-required`              |

**Mechanism**: synchronous in-process within `UpdateWorkflowActions`. When the handler writes a workflow's `status[0].stage` (via auto-complete or `CancelWorkflow`), it reads the workflow's `parent_action_id` and fetches the tracker action by primary key. If the new stage maps to a target, the tracker action is updated via an inner `updateAction` call with `force: true` (tracker writes bypass the priority rule).

**Pseudo-code:**

```js
async function pushWorkflowStatus(ctx, workflowId, newStage, eventId) {
  const current = await ctx.workflowsCollection.findOne(
    { _id: workflowId },
    { projection: { status: 1, workflow_type: 1, parent_action_id: 1 } },
  );
  if (current?.status?.[0]?.stage === newStage) return; // idempotency guard

  await writeWorkflowStatus(ctx, workflowId, newStage, eventId);

  if (!current.parent_action_id) return;
  const tracker = await ctx.actionsCollection.findOne({
    _id: current.parent_action_id,
  });
  if (!tracker) return;

  const targetStage = CHILD_STAGE_MAP[newStage];
  if (!targetStage) return;

  await updateAction(ctx, {
    currentActionId: null,
    actions: [{ type: tracker.type, key: tracker.key, status: targetStage }],
    eventId,
    force: true,
  });
}
```

**One-to-one constraint**: each child workflow has at most one `parent_action_id`; each tracker action has at most one `child_workflow_id`. Apps needing the same physical event to drive multiple parents spawn separate child workflows per parent.

## Idempotency

- **Action status pushes** are guarded by the priority rule. Retrying a `done` push on an already-`done` action is rejected automatically (strict-less-than).
- **Workflow status pushes** have no priority ordering. Guarded by a same-stage no-op check at the top of `pushWorkflowStatus` — reads `status[0].stage`, returns early if it equals the new stage. Prevents duplicate `$push` and double-firing tracker subscription on retry.
- **Submit-action retry** is safe end-to-end: the engine's idempotency guards converge to the same state; the four `submit-action` routine steps tolerate re-runs (the leaky steps are `new_event` and `notify` — known cost, duplicate events / notifications on retry).

## Priority rule

A status transition is allowed when the new status's priority is strictly less than the current. Exceptions:

- `currentActionId` self-exception: same-stage allowed for the one action the user submitted on.
- `force: true` per-call: bypasses the priority rule and the universal-terminal exception for every entry in the call.
- `not-required` (priority 0) is the universal terminal — only `force: true` moves it.

`currentActionId` is aliased from `submit-action`'s `payload.action_id` by the API routine.

`force: true` lives at the top of the `UpdateWorkflowActions` payload, not per entry. Tracker subscription uses `force: true` internally (engine-driven writes can move parent actions in any direction the child workflow takes).

## Ordering inside one `UpdateWorkflowActions` invocation

1. Write the action's status (the original transition the caller asked for).
2. Recompute affected groups' statuses; write `groups[]` back to the workflow doc (action-groups Decision 4).
3. Re-evaluate `blocked_by` for every blocked action against the new group/action state; push `action-required` on those whose dependencies are now terminal (action-groups Decision 2).
4. Auto-complete check on the workflow if all actions are terminal — push `completed` to workflow status. Re-run after step 3.
5. If step 4 pushed a workflow status, run tracker subscription (recurse if the parent's parent exists).
6. Recompute the workflow's `summary` (eager writeback).
7. Return `{ action_ids, completed_groups, event_id }` — `completed_groups` lists groups that transitioned to `done` in step 2.

Summary recompute is idempotent — nested recursion may recompute the same workflow's summary twice. Idempotent writes; bounded cost. `completed_groups` is computed from step 2's transitions, so a retry that no-ops step 2 returns an empty `completed_groups` (the hook doesn't fire twice).

## Worked example: 2-level nested auto-complete

**Setup.** Two workflows on two entities, bidirectionally linked:

- **Workflow A** on a `lead` (`entity_collection: leads-collection`). Two actions: `qualify` (form, `in-review`) and `track-installation` (tracker, `in-progress`, `child_workflow_id: Workflow B._id`, `child_entity_id: ticket._id`, `child_entity_collection: tickets-collection`, `tracker.workflow_type: device-installation`). `parent_*` fields null.
- **Workflow B** on a `ticket` (`entity_collection: tickets-collection`), `workflow_type: device-installation`. One action: `install-device` (form, `in-review`). `status = [{active}]`, `parent_action_id: track-installation._id`, `parent_entity_id: lead._id`, `parent_entity_collection: leads-collection`.

**User submits `install-device` → `done`** via `submit-action`. Engine routine maps `action_id → currentActionId`, generates `eventId E1`, calls `UpdateWorkflowActions`.

**Trace:**

```
updateAction(currentActionId=install-device._id, actions=[{type: install-device, status: done}], eventId=E1)
├─ step 1: install-device.status = done
├─ step 2: B fully terminal → pushWorkflowStatus(B, 'completed', E1)
│   ├─ step 0 guard: B.status[0]='active' ≠ 'completed' → proceed
│   ├─ writeWorkflowStatus(B, 'completed')
│   ├─ load tracker by B.parent_action_id (primary-key)
│   └─ updateAction(actions=[{type: track-installation, status: done}], eventId=E1, force=true)
│       ├─ track-installation.status = done
│       ├─ step 2: A not terminal (qualify still in-review) → no pushWorkflowStatus
│       └─ step 4: recomputeSummary(A) → { done: 1, not_required: 0, total: 2 }
└─ step 4: recomputeSummary(B) → { done: 1, not_required: 0, total: 1 }
```

**End state.** B auto-completed; A unchanged status array (qualify still in-review); A's summary reflects track-installation now done. One `eventId` across all writes.

**Retry.** A retried `submit-action` produces no duplicate writes: priority rule no-ops the action push; same-stage guard no-ops the workflow push; tracker doesn't refire; summary recompute is idempotent.

## Open questions (in scope; deferred)

1. **Cycle protection.** Engine doesn't statically prove acyclicity. If real apps surface pathological linking, add a runtime depth-limit guard (default 10) failing with a clear error.
2. **Change-stream subscription variant.** Reopen if multi-process writers, direct DB writes, or migration tooling become real triggers.

## Risks

- **Plugin dual-runtime build complexity.** First-time server-side code in this package; verified by hard `src/` split + dist-output React-leak grep + plugin-loader smoke test before declaring done.
- **No transactional atomicity in v1.** Mid-sequence handler failure leaves partial writes. Mitigation: caller retry (idempotent), periodic reconciliation, `session.withTransaction` as purely-additive opt-in.
- **Workflow-doc write contention** under highly-parallel workflows. Mitigation: opt-in `summary_dirty: true` lazy-writeback per workflow YAML.
- **Cross-module endpoint resolution** inside `submit-action` (calls events `new-event` and optional notifications). Verified pattern from contacts module's `update-contact`; fallback is caller-supplied endpoint ids if the cross-module reference breaks.
- **Tracker subscription drift.** Same risk class as summary writeback; periodic reconciliation as catch-all.
- **`keys: []` silent no-op.** Documentation-only mitigation in v1; `allowEmpty: true` opt-in flag is a future change.
