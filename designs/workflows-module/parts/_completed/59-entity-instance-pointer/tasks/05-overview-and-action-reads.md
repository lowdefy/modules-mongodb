# Task 5: Overview/Action read methods — nested link value and GetWorkflowAction response

## Context

Three read methods build an `entity_link` whose `urlQuery` value comes off the loaded doc, and `GetWorkflowAction` also returns flat entity scalars in its response:

- `GetWorkflowOverview.js` (~line 188) — `urlQuery: { [...]: wfDoc.entity_id }`.
- `GetWorkflowActionGroupOverview.js` (~line 146) — `urlQuery: { [...]: wfDoc.entity_id }`.
- `GetWorkflowAction.js` (~lines 220-248) — `urlQuery: { [...]: action.entity_id }`, and the response object returns flat `entity_id: action.entity_id ?? null` and `entity_collection: action.entity_collection ?? null`.

Part 59 nests the pointer on the docs, so these reads change to `.entity.id`, and `GetWorkflowAction`'s response returns a nested `entity` object instead of the two flat fields.

## Task

### `GetWorkflowOverview.js` and `GetWorkflowActionGroupOverview.js`

In each `entity_link` build, change the `urlQuery` value from `wfDoc.entity_id` to `wfDoc.entity.id`.

### `GetWorkflowAction.js`

- `entity_link` `urlQuery` value: `action.entity_id` → `action.entity.id`.
- Response shape: replace the two flat fields

  ```js
  entity_id: action.entity_id ?? null,
  entity_collection: action.entity_collection ?? null,
  ```

  with a single nested object:

  ```js
  entity: {
    connection_id: action.entity?.connection_id ?? null,
    id: action.entity?.id ?? null,
  },
  ```

- Update the response-shape doc comment (~lines 20-21) that lists `entity_id, entity_collection` to `entity: { connection_id, id }`.

**Boundary with Part 57:** the `entities[action.entity_collection]` / `entities[wfDoc.entity_collection]` lookup that resolves the routing fields is Part 57's domain (it moves the source to `wfConfig.entity` and removes the `entities` param). Don't rework that lookup here — change only the entity-id **value** used in `urlQuery` and the `GetWorkflowAction` response.

### Tests

- `GetWorkflowOverview.test.js`, `GetWorkflowActionGroupOverview.test.js` — workflow fixtures carry `entity: { connection_id, id }`; assert `entity_link.urlQuery` uses `entity.id`.
- `GetWorkflowAction.test.js` — action fixtures carry `entity: { connection_id, id }`; assert the response returns `entity: { connection_id, id }` (and the null-fallback case returns `{ connection_id: null, id: null }`); assert `entity_link.urlQuery` uses `action.entity.id`.

## Acceptance Criteria

- All three `entity_link` builds read `.entity.id`.
- `GetWorkflowAction`'s response returns nested `entity: { connection_id, id }` (with `?? null` fallbacks); no flat `entity_id` / `entity_collection` response fields remain.
- The three colocated test suites pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js` — modify — link value `wfDoc.entity.id`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js` — modify — link value `wfDoc.entity.id`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — modify — link value + nested response + doc comment.
- `…/GetWorkflowOverview/GetWorkflowOverview.test.js`, `…/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.test.js`, `…/GetWorkflowAction/GetWorkflowAction.test.js` — modify — nested fixtures + assertions.

## Notes

Only `entity.id` of the `GetWorkflowAction` response has a consumer (the `get_entity` request, Task 11). The response `connection_id` has no reader — it's carried for shape-symmetry with the document/denorm pointer and because the pre-existing flat response already returned `entity_collection`, so this is a 1:1 rename, not new surface.
