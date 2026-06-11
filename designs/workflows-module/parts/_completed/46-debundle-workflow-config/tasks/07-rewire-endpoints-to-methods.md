# Task 7: Rewire the module's endpoints and requests to the engine methods

## Context

Tasks 4–6 added five read methods to the `WorkflowAPI` connection. This task
points the module's read surfaces at them. The endpoint/request **ids, routes,
and payloads are unchanged** (D-level contract preservation) — only the routine
bodies change from `MongoDBAggregation` against the collection connection to a
single call against the `WorkflowAPI` connection. Responses are extended with the
display + access fields (tasks 4–5).

Current state:

- `modules/workflows/api/get-entity-workflows.yaml`,
  `get-workflow-overview.yaml`, `get-action-group-overview.yaml` — `Api`
  routines with a `MongoDBAggregation` step on `_module.connectionId:
workflows-collection`, then a `:return:`.
- `modules/workflows/requests/get_action.yaml` — a `MongoDBAggregation` request
  on `_module.connectionId: actions-collection`.

The `WorkflowAPI` connection id is `workflow-api`
(`connections/workflow-api.yaml`); the write APIs already target it (see
`api/start-workflow.yaml` for the `type`/`connectionId`/`requestType` idiom).

## Task

**1. Three overview endpoints** — replace each routine's `MongoDBAggregation`
step with a single call to the matching method on the `workflow-api` connection,
passing the existing payload, and `:return:` the method's response:

- `get-entity-workflows.yaml` → `GetEntityWorkflows` (payload
  `{ entity_collection, entity_id }`; return `{ workflows }`).
- `get-workflow-overview.yaml` → `GetWorkflowOverview` (payload `{ workflow_id }`;
  return `{ workflow, actions }`).
- `get-action-group-overview.yaml` → `GetWorkflowActionGroupOverview` (payload
  `{ workflow_id, group_id }`; return `{ workflow, group, actions }`).

Use the same request shape the write APIs use to invoke a `WorkflowAPI` method
(match `requestType`/method-name wiring used by `start-workflow.yaml` etc. —
inspect it and follow the same idiom). The method returns the whole response
object; the endpoint may return it directly.

**2. `get_action` → `get_workflow_action` request** — **rename** the file
`modules/workflows/requests/get_action.yaml` → `requests/get_workflow_action.yaml`
and its id `get_action` → `get_workflow_action` (design intro / D8 — "a workflow
action, not any action"), and change its body to route to
`workflow-api` / `GetWorkflowAction`, keeping the `action_id` payload
(`_url_query: action_id`). **The response is now a single envelope object**
(task 5), where the aggregation returned an array. The detail-surface
`_request: get_action` reads are updated to `_request: get_workflow_action` in
task 10 (paired with the array→object change).

**3. New workflows events-timeline request** — add a request that calls
`workflow-api` / `GetEventsTimeline` (payload mirrors the events-timeline
component's `reference_field` / `reference_value`). This request is consumed by
the new timeline surface (task 11). Decide its home with task 11 (a request
inside the new component is fine — mirror how `events-timeline.yaml` defines
`get-events` inline). If it is a standalone endpoint, register it in
`module.lowdefy.yaml`'s `api:` list.

**Delete** the now-replaced aggregation bodies: the `MongoDBAggregation`
pipelines in the three overview endpoints and in `get_action.yaml`. The shared
YAML stages they `_ref` (`visible_verbs_filter`, `resolve_action_link`) become
orphaned for these endpoints — they are deleted in task 12 (the events timeline
still references the timeline lookup until task 11).

## Acceptance Criteria

- The three overview endpoints keep their ids, routes, and payloads, and route
  to the engine methods; the detail request is renamed `get_action` →
  `get_workflow_action` (same `action_id` payload) and routes to
  `GetWorkflowAction`.
- Calling each endpoint returns the extended response (title / entity_link /
  group display / form_meta / allowed / link as per tasks 4–5).
- `get_workflow_action` returns the curated envelope object (not an array).
- A timeline request targeting `GetEventsTimeline` exists for task 11 to consume.
- `pnpm ldf:b` (or the repo build command) builds the workflows module without
  unresolved-reference errors.

## Files

- `modules/workflows/api/get-entity-workflows.yaml` — modify — route to `GetEntityWorkflows`.
- `modules/workflows/api/get-workflow-overview.yaml` — modify — route to `GetWorkflowOverview`.
- `modules/workflows/api/get-action-group-overview.yaml` — modify — route to `GetWorkflowActionGroupOverview`.
- `modules/workflows/requests/get_action.yaml` → `requests/get_workflow_action.yaml` — rename (id `get_action` → `get_workflow_action`) + route to `GetWorkflowAction`.
- new timeline request (in the task-11 component, or a new `api/*.yaml` + `module.lowdefy.yaml` registration) — create.

## Notes

- This task changes response shapes; the client surfaces (tasks 8–11) depend on
  it and are sequenced after. Between task 7 and tasks 8–11 the pages render
  against the old shapes — expected, since the client tasks immediately follow.
- Do not change the page-level `CallAPI`/`Request` wiring here — only the
  endpoint/request definitions. Page wiring changes are tasks 8–11.
- The rename + array→object shape change must be reflected in the detail
  surfaces' `_request: get_action.0` reads → `_request: get_workflow_action`
  (task 10).
