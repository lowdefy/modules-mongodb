# Task 4: Three overview read methods on the WorkflowAPI connection

## Context

The three overview read APIs are MongoDB aggregations
(`modules/workflows/api/get-entity-workflows.yaml`,
`get-workflow-overview.yaml`, `get-action-group-overview.yaml`) that join
actions, compute the per-verb `visible_verbs` bag + `$match` drop (via
`api/stages/visible_verbs_filter.yaml`), resolve a single `link` (via
`resolve_action_link.yaml`), and project per-action cards. The display config
(titles, group icons/order, form metadata, entity back-link) rides **separately,
client-side, sized "all workflows"**.

This task adds the three engine methods that replace those aggregations. Each
runs the doc read, evaluates per-user access + link collapse in JS (task 2's
`computeAllowed` / `collapseLink`), and joins display config from
`context.workflowsConfig` + the new `context.connection.entities` map (task 1).
The endpoints are **rewired** to call these methods in task 7 — this task only
adds and registers the methods + tests.

Method handlers follow the write-handler shape (see
`StartWorkflow/StartWorkflow.js`): an async `(lowdefyContext) => result` function
with `.schema = {}` and `.meta`, composing `createEngineContext(lowdefyContext)`
first, then registered in `WorkflowAPI.js` under `requests`.

**`meta` for read methods is `{ checkRead: false, checkWrite: false }`** —
`checkConnectionRead` dereferences `meta.checkRead` unconditionally
(`checkConnectionRead.js:17`), so `meta` is **mandatory**, but both
connection-level capability flags are intentionally disabled: access control
lives in the engine verb gate _inside_ each method.

## Task

Create three handlers under
`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`:

- `GetEntityWorkflows/GetEntityWorkflows.js`
- `GetWorkflowOverview/GetWorkflowOverview.js`
- `GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js`

Each:

1. `const context = await createEngineContext(lowdefyContext);`
2. **Doc read** — reproduce the existing pipeline's match/lookup/group/sort
   logic. Implementer's choice per method: JS-built aggregation pipeline run via
   the engine's Mongo access, or a simpler find + JS post-processing. Inputs come
   from `context.params` (the request payload): `GetEntityWorkflows` →
   `{ entity_collection, entity_id }`; the other two → `{ workflow_id }`
   (+ `group_id` for the group method).
3. **Access** — for each joined action compute
   `allowed = computeAllowed({ access: action.access, app_name:
context.connection.app_name, userRoles: context.user?.apps?.[app_name]?.roles })`,
   and **drop** actions whose four verbs are all false (the existing
   `visible_verbs_filter` `$match`-drop). Resolve `link = collapseLink({ links:
action[app_name]?.links, allowed })`.
4. **Display join** from `context.workflowsConfig`:
   - `workflow.title` on each workflow.
   - Per action group `{ id, order, title, icon, link }` where `link` is the
     `workflow-group-overview` page link built with `context.connection.entry_id`
     **exactly as `computeEngineLinks` builds page links** (`${entry_id}/workflow-group-overview`,
     urlQuery `{ workflow_id, group_id }`). `order` is the group's index in the
     config's `action_groups`.
   - `action.form_meta` per form action (read off the validated action config) —
     overview methods only, the form **schema** for inline submitted-data
     rendering.
   - `workflow.form_data` **filtered to the view-visible actions** — the
     submitted **values** the inline `DataDescriptions` render (same
     `{type}`/`{type}.{key}` map shape, so the pages' `_state:
workflow.form_data.{type}` reads are unchanged). The raw `form_data` blob
     carries values for **every** action in the workflow, including ones dropped
     by the access filter (step 3); shipping it whole would leak a view-denied
     action's submitted values into the response. Prune `form_data` to the
     surviving actions' `type`/`key` — a few lines of JS over the
     already-computed surviving-actions list (D8: never ship a raw resolution
     input when its filtered output is what the surface needs). This closes a
     pre-existing leak in today's raw-`$match` overview routines.
   - `workflow.entity_link = { pageId, urlQuery, title }` where
     `pageId = entities[workflow.entity_collection].page_id`,
     `urlQuery = { [entities[ec].id_query_key]: workflow.entity_id }`,
     `title = entities[ec].title` — resolved from `context.connection.entities`.

5. **Response shape** (match the design's method↔endpoint table):
   - `GetEntityWorkflows`: `{ workflows: [...] }` where each workflow has
     `title`; groups become `{ id, order, title, icon, link, ...summary }`; and
     **per-action shape gains `_id` and `kind`** →
     `{ _id, kind, type, status, allowed, message, link }`. (Today's `$push`
     drops `_id`/`kind` — `get-entity-workflows.yaml:67–76`. They are needed
     because the entity page hosts the check modal: `kind` drives the
     `onActionClick` branch, `_id` opens it.)
   - `GetWorkflowOverview`: `{ workflow, actions }`. `workflow` has `title` +
     `entity_link` + **`form_data` (filtered to view-visible actions)**; group
     display fields present; each action has `form_meta`. Per-action cards keep
     `{ type, status, message, link, allowed }`. (No `_id`/`kind` — this surface
     navigates via `action.link` and hosts no modal.)
   - `GetWorkflowActionGroupOverview`: `{ workflow, group, actions }`. `workflow`
     has `title` + `entity_link` + **`form_data` (filtered to view-visible
     actions)**; `group` keeps `{ id, status, summary }` and gains `title` +
     `icon` (**no `group.link`** — back-nav is `entity_link`). Per-action
     `{ type, status, message, link, allowed }`. Preserve the existing
     `group: null` collapse behavior (group is null when the workflow is null /
     no visible actions / unknown group).

   The `message` field is the per-app message string the aggregations build today
   as `$<app_name>.message` — resolve `action[app_name]?.message` in JS.

6. Set `.schema = {}` and `.meta = { checkRead: false, checkWrite: false }`.

Register all three in
`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js`
under `requests`.

Add `*.test.js` beside each handler using the in-memory Mongo helper
(`shared/inMemoryMongo.js`) the write-handler tests use — seed workflows +
actions + a `user` with roles, assert the access drop, the resolved `link`, the
display joins, and `entity_link`.

## Acceptance Criteria

- The three methods are exported from `WorkflowAPI.js` and resolve via
  `createEngineContext`.
- Each reproduces its endpoint's current doc selection, access drop, sort, and
  grouping, plus the new display fields.
- `GetEntityWorkflows` per-action cards include `_id` and `kind`.
- `entity_link` resolves from `connection.entities` with the correct `urlQuery`
  key.
- `GetWorkflowOverview` / `GetWorkflowActionGroupOverview` return
  `workflow.form_data` pruned to the view-visible actions (a view-denied action's
  submitted values never ship); the map shape is unchanged.
- `allowed` (not `visible_verbs`) is the access bag field name on every card.
- New tests pass; full plugin test suite green.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js` — create.
- `.../GetEntityWorkflows/GetEntityWorkflows.test.js`, `.../GetWorkflowOverview/GetWorkflowOverview.test.js`, `.../GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.test.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js` — modify — register the three methods.

## Notes

- These methods `$match` from the `workflows` collection and `$lookup` actions by
  `workflow_id`, so `workflow_id: null` task docs are never joined — no
  task-guard needed (unlike `GetWorkflowAction`, task 5).
- The overview methods surface **navigation links** (`action.link`), not signal
  buttons — button resolution attaches only to `GetWorkflowAction` (task 5).
- Reuse `computeEngineLinks`'s `scoped(entry_id, page)` convention for the group
  link to stay consistent with how action-doc links are built.
- Look at the current aggregations' sort/`required_sort`/group logic carefully
  (`get-entity-workflows.yaml`, `get-action-group-overview.yaml`) and reproduce
  the `not-required`-sinks-last ordering.
