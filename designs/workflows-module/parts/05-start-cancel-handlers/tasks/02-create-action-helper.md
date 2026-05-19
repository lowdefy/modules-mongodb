# Task 2: Build the `createAction` shared helper

## Context

`createAction.js` lives in `plugins/modules-mongodb-plugins/src/connections/shared/` next to the existing `createMongoDBConnection.js`, `getActions.js`, `getActionFields.js`, `populateIds.js`. Per the design's `Shared internal helpers` section, `createAction` is consumed by `StartWorkflow`, `CancelWorkflow`, and (later) `SubmitWorkflowAction` (part 6).

This helper builds an action doc draft. It does **not** write to MongoDB — the caller decides whether to `MongoDBInsertOne` per draft or batch them via `MongoDBInsertMany`. Keeping it as a pure builder makes both call sites (single vs batch) clean.

V0 reference: the v0 `StartWorkflow.createActions` helper did the action-doc shape inline alongside the batch insert. We're splitting the builder out so the same logic can be reused by part 6's update path.

The action-doc shape is committed in `plugins/modules-mongodb-plugins/src/connections/shared/types.js` as `ActionDoc`. Note: per part 21, `entity_type` is dropped from the contract — part 21 owns the typedef edit, but this task should write **only** `entity_collection` (no `entity_type`) on the docs it builds.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/shared/createAction.js`.

The function takes the engine `context` (built at handler entry — has `actionsConfig` / `workflowsConfig`, `changeStamp`, etc.) plus the per-action input and returns an action-doc draft ready for insertion. Signature:

```js
/**
 * Build an action doc draft (caller inserts via MongoDBInsertOne / MongoDBInsertMany).
 *
 * @param {Object} context — engine handler context.
 * @param {Object} context.changeStamp
 * @param {Array<Object>} context.actionsConfig — workflow's actions[] from workflowsConfig.
 * @param {Object} options
 * @param {Object} options.workflow — the workflow doc this action belongs to (for `workflow_id`, `entity_id`, `entity_collection`).
 * @param {Object} options.action — { type, key?, status, fields?, references? } — entry from payload `actions[]` or YAML `starting_actions`.
 * @param {string} options.eventId — optional event id threaded into the status entry.
 * @returns {Object} the action doc draft.
 */
function createAction(context, { workflow, action, eventId }) {
  // ...
}

export default createAction;
```

Doc shape (matches `ActionDoc` typedef in `shared/types.js`, minus `entity_type` per part 21):

```js
{
  _id: <uuid>,                                // generate via `randomUUID()` from node:crypto, same as populateIds.js
  workflow_id: workflow._id,
  type: action.type,
  kind: <actionConfig.kind from context.actionsConfig>,
  key: action.key ?? null,
  status: [{ stage: action.status, event_id: eventId, created: context.changeStamp }],
  entity_id: workflow.entity_id,
  entity_collection: workflow.entity_collection,
  assignees: action.fields?.assignees ?? [],
  due_date: action.fields?.due_date ?? null,
  description: action.fields?.description ?? null,
  tracker: <actionConfig.kind === 'tracker' ? { workflow_type: actionConfig.tracker.workflow_type } : null>,
  child_workflow_id: null,
  child_entity_id: null,
  child_entity_collection: null,
  ...action.references,                       // reference-key spread per engine spec § References write contract
  created: context.changeStamp,
  updated: context.changeStamp,
}
```

**Merge order (load-bearing):** spread `action.references` first, then assign all core fields, so a malicious or buggy caller passing `references: { type: 'override' }` cannot rewrite reserved keys. The engine spec § References write contract documents this pattern:

```js
const doc = {
  ...action.references,    // spread first
  _id: actionId,
  workflow_id: workflow._id,
  // ... rest of core fields ...
};
```

**Looking up the action's `kind` and `tracker`:** find the matching entry in `context.actionsConfig` by `actionConfig.type === action.type`. Throw a precise error if not found — the validation in `StartWorkflow` should have caught this upstream, but a defensive check inside `createAction` keeps future callers (part 6) safe.

V0 reference for the dispatcher call style and the `event_id` threading: the v0 `StartWorkflow.createActions` helper's per-action mapping block (the section that returns the `{ _id, key, workflow_id, status: [...], ... }` doc shape, with `event_id` on the status entry).

## Acceptance Criteria

- `plugins/modules-mongodb-plugins/src/connections/shared/createAction.js` exports a default function matching the signature above.
- The function is **pure** — it does not touch `context.mongoDBConnection`. The caller does the insert.
- Reference-key merge order is correct: `references` cannot override reserved fields (`_id`, `workflow_id`, `type`, `kind`, `key`, `status`, `entity_id`, `entity_collection`, `assignees`, `due_date`, `description`, `tracker`, `child_*`, `created`, `updated`).
- `_id` is generated via `randomUUID()` from `node:crypto`.
- Throws a precise error if `action.type` doesn't resolve to an entry in `context.actionsConfig`.
- Plugin builds cleanly.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/createAction.js` — create — pure action-doc builder.

## Notes

- Tracker actions get `tracker: { workflow_type }` populated from the action config; non-trackers get `tracker: null`.
- `child_workflow_id`, `child_entity_id`, `child_entity_collection` are always `null` at action creation. They only get populated when `StartWorkflow` runs with a `parent_action_id` (task 5 calls `updateAction` to set them on the parent, not on the newly-created action).
- The `fields` payload field is the path to universal field updates (`assignees`, `due_date`, `description`). It's set at create time only when supplied; defaults are listed above.
