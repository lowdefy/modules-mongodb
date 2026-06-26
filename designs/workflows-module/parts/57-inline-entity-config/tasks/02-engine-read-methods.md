# Task 2: Build `entity_link` from `wfConfig.entity` in the read methods

## Context

After Task 1, the materialized workflow config (threaded into the engine as `workflowsConfig`) carries the whole `entity` block nested: `{ connection_id, ref_key, page_id, id_query_key, title }`. These read methods use only its routing fields (`page_id`, `id_query_key`, `title`) to build the back-link. The four read methods currently build the entity back-link from the connection's `entities` map keyed by the collection on the document (`connection.entities[wfDoc.entity_collection]`). They each already resolve the workflow's config entry (`wfConfig`) by `workflow_type` _before_ building the link, so reading `wfConfig.entity` is exactly as direct — no added indirection — and lets the link vary per workflow type.

The four methods (each has the identical `entity_link` block):

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js` — `entities` at line 31, `entityConfig`/`entity_link` at lines 184-189, `wfConfig` at line 44.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.js` — `entities` at line 31, link at lines 172-177, `wfConfig` via `findWorkflowConfig(wfDoc.workflow_type)` at line 81.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — `entities` at line 125, link at lines 220-225 keyed off `action.entity_collection`/`action.entity_id`, `wfConfig` resolved via `action.workflow_type` at line 147.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js` — `entities` at line 30, link at lines 142-147, `wfConfig` at line 43.

## Task

In each of the four files:

1. Remove the `const entities = connection.entities ?? {};` line.
2. Replace `const entityConfig = entities[wfDoc.entity_collection];` (or, in `GetWorkflowAction`, `entities[action.entity_collection]`) with `const entityConfig = wfConfig?.entity;`.
3. Leave the link body unchanged — it still reads:
   ```js
   const entity_link = entityConfig
     ? {
         pageId: entityConfig.page_id,
         urlQuery: { [entityConfig.id_query_key]: wfDoc.entity_id },
         title: entityConfig.title ?? null,
       }
     : null;
   ```
   In `GetWorkflowAction` the id source stays `action.entity_id` (the action doc), with `entityConfig` now from `wfConfig?.entity` (resolved via `action.workflow_type`).
4. Update the doc comments that reference `connection.entities`:
   - `GetWorkflowAction.js` line 21 (`// { pageId, urlQuery, title } from connection.entities, or null`) and lines 218-219 (the inline comment about "the connection's entities config" / "Null when the entity_collection has no entities entry") — reword to reference the workflow config's `entity` block (e.g. "from the workflow config's `entity` block, or null when the workflow type has no config / `entity` block").
   - Any analogous header comment in the other three files.

The collection/id reads stay on the flat `wfDoc.entity_collection` / `wfDoc.entity_id` (and `action.entity_collection` / `action.entity_id`) — those are document fields, unchanged by this part.

## Acceptance Criteria

- None of the four files reference `connection.entities`.
- Each builds `entity_link` from `wfConfig?.entity` (resolved by `workflow_type` / `action.workflow_type`).
- `GetWorkflowAction` still sources the id from `action.entity_id`.
- Doc comments no longer claim the link comes from `connection.entities`.
- A document whose `workflow_type` is no longer in `workflows_config` yields `entity_link: null` (expected behavior change, per the design's "Behavior change" note).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js` — modify

## Notes

- Test fixtures still pass `connection.entities` until Task 3 updates them; that's fine — the methods simply ignore it now, and the tests assert on `entity_link` which Task 3 re-points at `wfConfig.entity`. Run Task 3 to bring the suites green.
- This is the source-only change that makes the `entities` connection param dead, enabling its removal in Task 4.
