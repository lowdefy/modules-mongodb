# Task 3: Update the four engine test suites to the `wfConfig.entity` shape

## Context

After Task 2, the four read methods build `entity_link` from the materialized workflow config's `entity` block (`wfConfig?.entity`) instead of the connection's `entities` map. The engine test suites still set up an `entities` connection fixture and assert "resolves from `connection.entities`" / "null when no entry". They need to move to the new shape.

Test files:

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.test.js`
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.test.js`
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.test.js`
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.test.js`

The materialized workflow-config fixture each suite passes via `workflowsConfig` should now carry the whole `entity` block nested, with **no** flat `entity_collection`/`entity_ref_key` on the config, e.g.:

```js
{
  type: 'onboarding',
  entity: {
    connection_id: 'leads-collection',
    ref_key: 'lead_ids',
    page_id: 'lead-view',
    id_query_key: '_id',
    title: 'Lead',
  },
  // ...actions, action_groups, etc.
}
```

The **document** fixtures (`wfDoc` / action docs) keep the flat `entity_collection` / `entity_id` they have today — this part does not touch the document shape (Part 59 does), and the read methods still source the id from `wfDoc.entity_id` / `action.entity_id`.

## Task

In each of the four test suites:

1. Remove the `entities` connection fixture (the `connection: { entities: {...} }` setup).
2. Add the whole `entity` block (nested — `connection_id`, `ref_key`, `page_id`, `id_query_key`, `title`) to the workflow-config fixture(s) the suite already passes via `workflowsConfig` (matching the collection/type used by the doc fixtures), and drop any flat `entity_collection`/`entity_ref_key` from the config fixture.
3. Rewrite the entity-link test cases:
   - "resolves `entity_link` from `connection.entities`" → "resolves `entity_link` from `wfConfig.entity`".
   - "null when the entity_collection has no `entities` entry" → "null when the workflow config has no `entity` block" (i.e. the resolved `wfConfig` has no `entity`, or the `workflow_type` is not in `workflowsConfig`).
4. Keep the `entity_link` response-shape assertions (`{ pageId, urlQuery: { [id_query_key]: entity_id }, title }`) — the shape is unchanged; only the source of the routing fields moved. `GetWorkflowAction` still asserts the id comes from `action.entity_id`.

Add a case (at least in one suite, e.g. `GetWorkflowOverview`) asserting that a document whose `workflow_type` is absent from `workflowsConfig` yields `entity_link: null` — the design's documented behavior change.

## Acceptance Criteria

- No engine test references `connection.entities`.
- Each suite's workflow-config fixture carries the whole nested `entity: { connection_id, ref_key, page_id, id_query_key, title }` block, with no flat `entity_collection`/`entity_ref_key` on the config.
- The "null `entity_link`" case now triggers via a missing `entity` block / unconfigured `workflow_type`, not a missing map entry.
- `entity_link` shape assertions are preserved.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` (or the repo's plugin test command) passes for all four suites.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.test.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.test.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.test.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.test.js` — modify
