# Workflows Module Surface — Spec

`module.lowdefy.yaml` manifest and the four module APIs. Full rationale in [design.md](design.md); this file carries only the committed decisions.

## `module.lowdefy.yaml`

```yaml
name: Workflows
version: 0.1.0
description: >
  Multi-workflow engine: parallel workflow instances on one entity, declarative
  blocked_by dependencies, engine-orchestrated submit lifecycle
  (SubmitWorkflowAction handler with per-interaction pre/post hooks) reached
  via resolver-generated per-action endpoints, per-action pages generated at
  build time from app-supplied workflow YAML.

exports:
  pages:
    # Form-action pages — generated per (workflow_type, action_type, verb)
    - id: action-edit # generated when `edit` in app verb list
    - id: action-view # generated when `view` in app verb list
    - id: action-review # generated when `review` in app verb list
    - id: action-error # generated when `error` in app verb list AND action declares `pages.error`
    # Shared task-action pages
    - id: task-edit
    - id: task-view
    - id: task-review
    # Shared read-only workflow overview page (?workflow_id=<id>)
    - id: workflow-overview
  connections:
    - id: workflows-collection
    - id: actions-collection
    - id: workflow-api
  api:
    - id: start-workflow
    - id: cancel-workflow
    - id: get-entity-workflows
    - id: get-workflow-overview
    # Per-action update-action-{action_type} endpoints are resolver-emitted
    # via makeWorkflowApis (submit-pipeline Decision 2); not statically listed.
  components:
    - id: actions-on-entity
    - id: workflow-header
    - id: action_role_check

vars:
  workflows_config:
    type: array
    required: true
    description: >
      The app's workflow YAML — `_ref` to `workflow_config/workflows.yaml`.
      Schema in action-authoring spec "Workflow YAML"; validated by
      `makeWorkflowsConfig` at build time.
  app_name:
    type: string
    required: true
    description: The host app's deployment name; filters `access.{app_name}` per action.
  user_schema:
    type: object
    default: { roles_path: roles }
  action_statuses_display:
    type: object
    default: {}
    description: >
      Per-app display overrides for the eight action statuses. Keyed by status
      name; values are partial display objects (`title`, `color`, `borderColor`,
      `titleColor`, `icon`). Merged over the shipped enum's display fields at
      build time. Unknown keys silently dropped.
  workflow_lifecycle_stages_display:
    type: object
    default: {}
    description: Same shape as action_statuses_display for the three workflow stages.

connections:
  - _ref: connections/workflows-collection.yaml
  - _ref: connections/actions-collection.yaml
  - _ref: connections/workflow-api.yaml

api:
  - _ref: api/start-workflow.yaml
  - _ref: api/cancel-workflow.yaml
  - _ref: api/get-entity-workflows.yaml
  - _ref: api/get-workflow-overview.yaml
  # Per-action submit endpoints (update-action-{action_type}) — emitted by
  # makeWorkflowApis resolver per submit-pipeline Decision 2.
  - _ref:
      resolver: resolvers/makeWorkflowApis.js
      vars:
        workflows: { _module.var: workflows_config }
        app_name: { _module.var: app_name }

components:
  - id: actions-on-entity
    component: { _ref: components/actions-on-entity.yaml }
  - id: workflow-header
    component: { _ref: components/workflow-header.yaml }
  - id: action_role_check
    component: { _ref: components/action_role_check.yaml }

pages:
  - _ref:
      resolver: resolvers/makeActionPages.js
      vars:
        workflows: { _module.var: workflows_config }
        app_name: { _module.var: app_name }
  - _ref: pages/task-edit.yaml
  - _ref: pages/task-view.yaml
  - _ref: pages/task-review.yaml
  - _ref: pages/workflow-overview.yaml

global:
  action_statuses:
    _ref: enums/action_statuses.yaml # merged with vars.action_statuses_display at build time
  workflow_lifecycle_stages:
    _ref: enums/workflow_lifecycle_stages.yaml # merged with vars.workflow_lifecycle_stages_display

plugins:
  - name: "@lowdefy/modules-mongodb-plugins"
    version: "^0.4.0" # bumped from prior; adds WorkflowAPI server connection

dependencies:
  - id: layout
  - id: events
  - id: notifications

secrets:
  - name: MONGODB_URI
```

### Connection-export rationale

Three separate connections are exported by design:

- `workflows-collection` and `actions-collection` are stock `MongoDBCollection` connections giving apps direct read access to the underlying docs (custom views, ad-hoc aggregations, list pages, reporting).
- `workflow-api` is the server-side `WorkflowAPI` connection that owns engine-managed write paths (transitions, tracker subscription, summary writeback). Separate client lifecycles from the `MongoDBCollection` connections.

## APIs

| API                     | Purpose                                                                                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start-workflow`        | Instantiate a workflow on an entity. Optional `parent_action_id` writes parent/child link atomically.                                                                                                                                                                                         |
| `cancel-workflow`       | Push `cancelled` to workflow status; flip remaining open actions to `not-required`.                                                                                                                                                                                                           |
| `get-entity-workflows`  | Return workflows + grouped actions for one entity. Consumed by `actions-on-entity`. Filters by access (per-app verb map + role gate, action-authoring spec "Access"). Returned workflow docs carry persisted `groups[]` array (engine-written).                                               |
| `get-workflow-overview` | Return one workflow doc + its actions ordered for display. Consumed by the shipped `workflow-overview` page. Filters actions by access (same rules as `get-entity-workflows`). Returns one row per action (one per instance for keyed actions), ordered by `display_order` then `sort_order`. |

**Submit endpoints.** Per-action `update-action-{action_type}` endpoints are emitted by the `makeWorkflowApis` resolver — owned by [submit-pipeline](../submit-pipeline/spec.md). The endpoint's routine is a single call to the `SubmitWorkflowAction` plugin handler with the action's `hooks:`, `event:`, and `interactions:` blocks baked in as build-time literals. Template-shipped buttons on per-action pages call the endpoint with an `interaction` value (`submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`); the engine resolves the target status per submit-pipeline Decision 3.

Migrations and admin tools that need `force: true` call the `SubmitWorkflowAction` handler directly via a privileged route gated by app-level access control.

## `start-workflow` payload

```
start-workflow payload:
  workflow_type: string       # required
  entity_type: string         # required
  entity_id: string           # required
  entity_collection: string   # required; MongoDB collection connection id (e.g. "leads-collection")
  parent_action_id: string    # optional; when set, links this workflow as a child of an existing
                              #   tracker action. Engine validates the action is `kind: tracker`
                              #   and has null `child_workflow_id`; writes parent_entity_id /
                              #   parent_entity_collection from the parent action; writes the
                              #   tracker's child_workflow_id / child_entity_id /
                              #   child_entity_collection + in-progress transition.
                              #   All atomic on the shared client.
  references: object          # optional; spread onto workflow doc and every starting action doc
  actions: array              # optional; override / fan-out the workflow's declared starting_actions.
                              #   When provided, replaces the YAML starting_actions for this call.
                              #   Used for keyed-action fan-out at start time (action-authoring D9).
    - type: string            #   action type
      key: string             #   instance key for keyed actions; omit for non-keyed
      status: string          #   initial status
      fields: object          #   optional; universal fields per instance
      references: object      #   optional; per-instance references
```

Returns `{ workflow_id, action_ids }`.

**Starting-action resolution.** When `actions:` is provided, the engine uses it verbatim and ignores the workflow YAML's `starting_actions:`. When omitted, the engine instantiates `starting_actions:` from the YAML. Keyed actions in the YAML's `starting_actions:` without concrete keys raise a build/runtime error — keyed instances must come from the API payload.

## `cancel-workflow` payload

```
cancel-workflow payload:
  workflow_id: string         # required
  reason: string              # optional; written into cancelled status entry's reason field
  references: object          # optional; spread onto workflow doc on the cancelled status push
```

Pushes `{ stage: cancelled, created, reason? }` onto workflow status; flips remaining open actions on the workflow to `not-required`. Tracker actions watching this workflow fire normally via the engine's subscription (cancelled → not-required mapping).

## `get-workflow-overview` payload

```
get-workflow-overview payload:
  workflow_id: string         # required
```

Returns:

```
{
  workflow: {
    _id, workflow_type, entity_type, entity_id, entity_collection,
    status, summary, groups, form_data,
    ...reference fields
  },
  actions: [
    {
      _id, type, kind, key, status, sort_order, action_group,
      assignees, due_date, description,
      status_map,                    # the authored map; UI selects {current_stage}.{app_name}
      tracker,                        # tracker-action fields when kind: tracker
      child_workflow_id, child_entity_id, child_entity_collection,
      ...reference fields
    },
    ...
  ]
}
```

**Access filter.** Actions whose `access.{app_name}` doesn't include `view` (or whose role gate fails for the caller) are excluded from the `actions` array. If the workflow itself has zero visible actions for this caller, the API returns `{ workflow: null, actions: [] }` and the page redirects back.

**Ordering.** Actions are returned in display order: primary sort `action_group` declaration order (workflow's `action_groups[]` index), secondary sort `sort_order` ASC, tertiary tie-break on `actions[]` declaration order. Keyed actions surface as N rows, one per instance, kept together within their parent action's sort slot.

## Submit endpoints

Per-action `update-action-{action_type}` endpoints are resolver-emitted by `makeWorkflowApis`; the endpoint payload + `SubmitWorkflowAction` plugin handler lifecycle (validate → pre-hook → writes → side effects → post-hook), the pre/post hook return contracts, log-event override paths, notifications dispatch, and tracker-fired return signal all live in [submit-pipeline spec](../submit-pipeline/spec.md). Universal action fields (`assignees`, `due_date`, `description`) flow through the per-action endpoint's `fields:` payload block; form / form_review fields land at `form_data.{action_type}[.{key}].{field}` per engine D5 (no reserved sub-keys).

## Risk

- **Submit endpoint surface stability.** v1 ships one resolver-generated endpoint per form / task action (`update-action-{action_type}`) plus four operational APIs. If real apps surface complex submit flows that don't fit the pre/post hook contract, apps extend the pre-hook return shape (additional `actions[]` entries, `event_overrides`, `form_overrides`) or wire post-hook follow-up writes; the module adds extension fields additively. Current shape stays extensible (optional fields default to no-op).
