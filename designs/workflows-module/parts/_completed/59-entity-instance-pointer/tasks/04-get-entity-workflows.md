# Task 4: GetEntityWorkflows — nested param, dotted query, nested link value

## Context

`GetEntityWorkflows` (`WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.js`) lists all workflows across all types for one entity. Today it destructures `const { entity_collection, entity_id } = params;` and queries `findDocs({ ..., query: { entity_collection, entity_id }, ... })`, then builds each workflow's `entity_link.urlQuery` from `wfDoc.entity_id`.

Part 59 nests the entity pointer. Unlike StartWorkflow, this method **genuinely needs `connection_id` as a param** — it has no single `workflow_type` to derive it from — so its param stays `entity: { connection_id, id }`. The persisted query keys become dotted (`entity.connection_id` / `entity.id`); MongoDB indexes and matches dotted sub-fields identically, so the compound index serves the equality match the same way.

## Task

In `GetEntityWorkflows.js`:

- Destructure the nested param:

  ```js
  const { connection_id, id } = params.entity ?? {};
  ```

- Change the workflow query to dotted keys:

  ```js
  query: { 'entity.connection_id': connection_id, 'entity.id': id },
  ```

- In the `entity_link` build, change the `urlQuery` value from `wfDoc.entity_id` to `wfDoc.entity.id`.

**Boundary with Part 57:** the `entities[...]` lookup that resolves the routing fields (`page_id`, `id_query_key`, `title`) is refactored by Part 57 to source from `wfConfig.entity` (and the `entities` connection param is removed there). Do **not** rework that lookup here — this task changes only the param destructure, the query keys, and the `urlQuery` **value** (`wfDoc.entity.id`). If Part 57 has already moved the routing-field source, leave it; only ensure the entity-id value reads `wfDoc.entity.id`.

### Test

`GetEntityWorkflows.test.js` — pass `params.entity: { connection_id, id }`; seed workflow docs with `entity: { connection_id, id }`; assert the query matches via the nested fields and the returned `entity_link.urlQuery` uses `entity.id`.

## Acceptance Criteria

- The param is `entity: { connection_id, id }`; the Mongo query keys are `'entity.connection_id'` and `'entity.id'`.
- `entity_link.urlQuery` reads `wfDoc.entity.id`.
- `GetEntityWorkflows.test.js` passes with nested fixtures.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.js` — modify — nested param, dotted query, nested link value.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.test.js` — modify — nested params, fixtures, assertions.

## Notes

The documented index that serves this query (`workflows.{ entity.connection_id: 1, entity.id: 1 }`) is updated in the docs sweep (Task 14). No new index and no `actions`-index change.
