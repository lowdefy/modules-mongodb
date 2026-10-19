# Task 4: Implement `StartWorkflow` — no-parent happy path

## Context

The current `StartWorkflow.js` at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` is a stub that throws `WorkflowAPINotImplemented` (shipped by part 03). This task replaces the body with the no-parent code path: payload validation, workflow doc write, action doc writes, initial summary, change-stamp threading, return shape.

Parent linking (`parent_action_id` flow) is **task 5**. This task ships only the case where the payload has no `parent_action_id`. Don't write any of the parent-link validation rules or the parent-side `updateAction` call yet — task 5 adds those on top.

**Engine context pattern.** Every WorkflowAPI handler builds a context object at entry (see engine spec § Client and transaction model):

```js
async function StartWorkflow(lowdefyContext) {
  const { request, connection } = lowdefyContext;
  const context = {
    mongoDBConnection: createMongoDBConnection(lowdefyContext),
    workflowsConfig: connection.workflowsConfig,
    actionsEnum: connection.actionsEnum,
    changeStamp: connection.changeStamp,
    params: request,
  };
  // ... body ...
}
```

This shape is verified against the v0 `StartWorkflow` handler — same posture.

**Payload (per design.md `StartWorkflow.js` § Payload):**

- Required: `workflow_type`, `entity_id`, `entity_collection`. (`entity_type` is **not** part of the contract — see part 21.)
- Optional: `actions: [{ type, key?, status, fields?, references? }]` — overrides YAML `starting_actions`.
- Optional: `references: { ... }` — spread onto workflow + action docs.
- Optional: `parent_action_id` — defer to task 5.

**Validation (per design.md `StartWorkflow.js` § Validation, runtime, step 1):**

1. `workflow_type` exists in `context.workflowsConfig`. Throw a precise error if not.
2. When no payload `actions:` is supplied: every YAML `starting_actions[i].type` resolves to an action in the workflow's `actions[]` whose `key` is undefined. If any references a keyed action, throw "starting_actions cannot reference keyed actions; pass them via the `actions:` payload instead".

**Writes (per design.md `StartWorkflow.js` § Writes):**

Workflow doc shape (see also `ActionDoc` typedef in `plugins/modules-mongodb-plugins/src/connections/shared/types.js` for the action shape; the workflow doc shape is alongside):

```js
{
  _id: <uuid>,                              // generate via randomUUID from node:crypto
  workflow_type: payload.workflow_type,
  key: <workflowConfig.key ?? null>,        // from workflowsConfig (the workflow-level key, not per-action)
  display_order: workflowConfig.display_order,
  entity_id: payload.entity_id,
  entity_collection: payload.entity_collection,
  status: [{ stage: 'active', created: context.changeStamp }],
  summary: { done: 0, not_required: <count>, total: <N> },
  groups: [],                               // populated by part 7 on first transition
  form_data: {},
  parent_action_id: null,
  parent_entity_id: null,
  parent_entity_collection: null,
  ...payload.references,                    // reference-key spread (merge-order: references first, core fields after)
  created: context.changeStamp,
  updated: context.changeStamp,
}
```

**Note on field order in the spread.** Per the engine spec § References write contract, payload `references` is spread **first**, then all core fields are assigned. This is the reserved-key merge order. The same order applies inside `createAction` (task 2).

**Action docs.** Build via `createAction(context, { workflow, action, eventId: null })` (task 2). Source is either `payload.actions` if provided, else `workflowConfig.starting_actions`. Insert via `mongoDBConnection('actions').MongoDBInsertMany({ docs: actions })` — same pattern as v0 `createActions.js`.

**Order of writes.** Workflow doc first, then `MongoDBInsertMany` for the N action docs. Sequential through the dispatcher, not atomic — same posture as the rest of the engine.

**Summary computation.** Iterate the just-built action drafts (before insert) and count entries whose `status[0].stage === 'not-required'`. That count goes into the workflow doc's `summary.not_required`. `total = actions.length`. `done = 0` (a freshly-created workflow has no `done` actions).

**Return:** `{ workflow_id, action_ids }`.

**`meta.checkWrite`.** Once this handler has real bodies, flip `StartWorkflow.meta.checkWrite` from `false` to `true` so the connection's write gate runs (matches the contract part 03 set up — see commit `bdb2ea4`'s commit message: "parts 5/6 flip checkWrite: true and consumers add write: true").

## Task

Replace the body of `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js`:

1. Build the engine context object (see "Engine context pattern" above).
2. Validate per the two rules above.
3. Look up `workflowConfig` from `context.workflowsConfig` by `workflow_type`.
4. Resolve `startingActions`: `payload.actions ?? workflowConfig.starting_actions`.
5. Build the workflow doc (compute `_id`, but do **not** insert yet — `createAction` needs `workflow._id` via the `workflow_id` field).
6. Build action drafts via `createAction(context, { workflow, action, eventId: null })` for each entry in `startingActions`.
7. Compute the initial `summary` from the drafts and set it on the workflow doc.
8. Insert workflow doc via `context.mongoDBConnection('workflows').MongoDBInsertOne({ doc: workflowDoc })`.
9. Insert action drafts via `context.mongoDBConnection('actions').MongoDBInsertMany({ docs: actionDrafts })`.
10. Return `{ workflow_id: workflowDoc._id, action_ids: actionDrafts.map(a => a._id) }`.

Update `StartWorkflow.meta` to `{ checkRead: false, checkWrite: true }`.

Keep `StartWorkflow.schema = {}` for now (handler-level payload schema TBD; the connection-level schema validates `workflowsConfig` shape, and runtime validation covers the payload).

## Acceptance Criteria

- `StartWorkflow.js` no longer throws `WorkflowAPINotImplemented` for the no-parent case.
- Workflow doc + action docs are inserted via the community-plugin dispatcher.
- Validation rules from § Validation reject the documented failure modes with precise error messages.
- Initial `summary.not_required` counts only starting actions whose status is exactly `not-required`.
- `created` and `updated` carry `context.changeStamp` on every doc.
- Reference-key merge order is correct on the workflow doc (`references` spread, then core fields).
- `StartWorkflow.meta.checkWrite === true`.
- Plugin builds cleanly; demo app builds cleanly (verifies the schema + handler integrate).
- A `payload.actions: []` (override) flow takes precedence over YAML `starting_actions`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — modify — replace stub body with real handler.

## Notes

- **No `entity_type` on the workflow doc.** Per part 21, that field is dropped. The "field is absent" assertion lives in part 22's `start-cancel.spec.js`, not a unit test in this part (`tasks/tasks.md § Verification posture`).
- **The workflow `_id` is generated server-side.** Don't accept a caller-supplied `_id`. Per the design's "Retry posture" bullet, `StartWorkflow` is intentionally not idempotent on retry; callers handle exactly-once at the entity-creation step.
- **No event id threading on the workflow doc.** v0's action docs carry `event_id` on each status entry; the design doesn't commit to one for v1 `StartWorkflow`, but `createAction` (task 2) accepts an `eventId` parameter for forward compatibility with part 6. Pass `eventId: null` for now.
- **`StartWorkflow.js` should stay thin.** Heavy lifting belongs in helpers (`createAction`, eventually a `createActions.js` if the action-batch logic grows). For task 4's scope, keeping the loop inline is fine.
