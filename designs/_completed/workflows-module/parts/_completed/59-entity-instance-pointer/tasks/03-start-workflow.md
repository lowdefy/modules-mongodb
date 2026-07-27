# Task 3: StartWorkflow — nested entity param, doc write, and parent/child denormalization

## Context

`StartWorkflow` (`WorkflowAPI/StartWorkflow/StartWorkflow.js`) is the single workflow-doc creation site. Today it:

- requires both `params.entity_id` and `params.entity_collection`,
- writes flat `entity_id` / `entity_collection` / `entity_ref_key` (from `params` and `workflowConfig.entity_ref_key`),
- denormalizes flat `parent_entity_id` / `parent_entity_collection` from the parent action,
- and on a tracker-child fire writes flat `child_entity_id` / `child_entity_collection` into `payload.fields`.

Part 59 nests all of this. Two decisions shape it:

- **Drop the connection id from the start payload.** The payload carries `entity: { id }` only. The connection id is a static per-kind config constant, so it is sourced from `workflowConfig.entity.connection_id` — not the payload. (Part 57 puts `connection_id` + `ref_key` in the config `entity:` block; this task reads `workflowConfig.entity.connection_id` / `workflowConfig.entity.ref_key`.)
- **`entity_ref_key` folds into the workflow `entity` object** as `entity.ref_key`.

## Task

### Preconditions (~lines 58-66)

Replace the two flat checks with a single nested-id check:

```js
if (!params.entity?.id) {
  throw new WorkflowEngineError("StartWorkflow: entity.id is required", {
    code: "invalid_params",
  });
}
```

Drop the `params.entity_collection` precondition entirely (no connection-id check — it comes from config).

### Base workflow doc write (~lines 178-186)

Replace:

```js
entity_id: params.entity_id,
entity_collection: params.entity_collection,
entity_ref_key: workflowConfig.entity_ref_key,
```

with the nested object (the `ref_key` fold-in removes the separate `entity_ref_key` field):

```js
entity: {
  connection_id: workflowConfig.entity.connection_id,
  id: params.entity.id,
  ref_key: workflowConfig.entity.ref_key,
},
```

### Parent denormalization (~lines 187-188)

Replace the flat `parent_entity_id` / `parent_entity_collection` fields with a single nullable object:

```js
parent_entity: parent
  ? { connection_id: parent.entity.connection_id, id: parent.entity.id }
  : null,
```

### Tracker fire child link (~lines 268-272)

In the `trackerFires` `payload.fields`, replace the flat child link fields:

```js
fields: {
  child_workflow_id: plannedWorkflowDoc._id,
  child_entity: {
    connection_id: plannedWorkflowDoc.entity.connection_id,
    id: plannedWorkflowDoc.entity.id,
  },
},
```

(`child_workflow_id` is unchanged; only the entity link nests. This object replaces the seed's `child_entity: null` on the parent tracker action via `planActionTransition`'s `payload.fields`.)

Update the in-file comment (~line 167) that mentions "denormalised entity_ref_key + parent linkage" to reflect the folded `entity.ref_key`.

### Test

`StartWorkflow.test.js` — drop `entity_collection` from start params, pass `entity: { id }`; assert the written workflow doc carries `entity: { connection_id, id, ref_key }` (connection_id + ref_key sourced from the config fixture), `parent_entity` is `null` for a non-child start and `{ connection_id, id }` for a tracker child, and the tracker fire writes `child_entity: { connection_id, id }`. Ensure `workflowConfig` fixtures carry the nested `entity: { connection_id, ref_key, ... }` block (per Part 57).

## Acceptance Criteria

- StartWorkflow requires `params.entity.id`, ignores any payload `connection_id`, and sources the connection id + ref_key from `workflowConfig.entity.*`.
- The written workflow doc has `entity: { connection_id, id, ref_key }` and `parent_entity: { connection_id, id } | null`; no flat `entity_*` / `parent_entity_*` / `entity_ref_key` fields remain.
- The tracker-child fire writes `child_entity: { connection_id, id }` (not flat).
- `StartWorkflow.test.js` passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — modify — precondition, nested doc write + ref_key fold-in, parent/child denorm, comment.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.test.js` — modify — nested params, fixtures, and assertions.

## Notes

- Depends on Part 57: `workflowConfig.entity.connection_id` and `workflowConfig.entity.ref_key` must exist on the materialized config. If Part 57 has not yet landed, these reads resolve to `undefined` (accepted in-between broken state — the modules are unreleased).
- The narrow payload pick is also enforced at the request-mapping layer in Task 9 (`makeWorkflowApis`), which maps only `entity: { id: { _payload: entity.id } }`. No `additionalProperties: false` schema guard is added on the `entity` param.
