# Workflows Module Surface — Spec

`module.lowdefy.yaml` manifest and the four module APIs. Full rationale in [design.md](design.md); this file carries only the committed decisions.

## `module.lowdefy.yaml`

```yaml
name: Workflows
version: 0.1.0
description: >
  Multi-workflow engine: parallel workflow instances on one entity, declarative
  blocked_by dependencies, submit-action API for advancing actions and chaining
  entity / event / notification writes, per-action pages generated at build
  time from app-supplied workflow YAML.

exports:
  pages:
    # Form-action pages — generated per (workflow_type, action_type, verb)
    - id: action-edit
    - id: action-view
    - id: action-error
    # Shared task-action pages
    - id: task-edit
    - id: task-view
  connections:
    - id: workflows-collection
    - id: actions-collection
    - id: workflow-api
  api:
    - id: start-workflow
    - id: cancel-workflow
    - id: get-entity-workflows
    - id: submit-action
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
  - _ref: api/submit-action.yaml

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

| API                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start-workflow`       | Instantiate a workflow on an entity. Optional `parent_action_id` writes parent/child link atomically.                                                                                                                                                                                                                                                                                                                                                 |
| `cancel-workflow`      | Push `cancelled` to workflow status; flip remaining open actions to `not-required`.                                                                                                                                                                                                                                                                                                                                                                   |
| `get-entity-workflows` | Return workflows + grouped actions for one entity. Consumed by `actions-on-entity`. Filters by access (per-app verb map + role gate, action-authoring spec "Access"). Returned workflow docs carry persisted `groups[]` array (engine-written).                                                                                                                                                                                                       |
| `submit-action`        | Advance an action to a caller-supplied `current_status`; apply unblocks; optional entity write, event log, notifications. Covers submit, approve, and request-changes via the `current_status` field. Re-checks role gate server-side before any writes; rejects on mismatch. `UpdateWorkflowActions` returns `completed_groups`; outer Layer-1 step fans out one `CallApi` per declared `on_complete` (mechanism deferred — see action-groups spec). |

`submit-action` is the user-submit path. Migrations and admin tools that need `force: true` bypass `submit-action` and call `UpdateWorkflowActions` directly via a privileged route gated by app-level access control.

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
```

Returns `{ workflow_id, action_ids }`.

## `cancel-workflow` payload

```
cancel-workflow payload:
  workflow_id: string         # required
  reason: string              # optional; written into cancelled status entry's reason field
  references: object          # optional; spread onto workflow doc on the cancelled status push
```

Pushes `{ stage: cancelled, created, reason? }` onto workflow status; flips remaining open actions on the workflow to `not-required`. Tracker actions watching this workflow fire normally via the engine's subscription (cancelled → not-required mapping).

## `submit-action` payload

```
submit-action payload:
  action_id: string                    # the current action being submitted
  current_type: string                 # the YAML type of the current action
  current_status: string               # optional; defaults to 'done' (form) or user-selected (task)
  fields: object                       # optional; universal action fields
    assignees: array<string>           #   null/omitted leaves unchanged
    due_date: Date                     #   null clears, omitted leaves unchanged
    description: string                #   null clears, omitted leaves unchanged
  unblocks: array                      # optional, default []
    - type: string
      status: string
      keys: array                      # omitted → 1 op key=null; [] → 0 ops (silent footgun); [k] → 1; [k1,k2,...] → N
      upsert: boolean                  # optional, default false
  entity_update: object                # optional; if absent, no entity write
    connection: string                 # connectionId for the entity collection
    _id: string                        # entity id
    update: object                     # MongoDB update object
  event: object                        # optional; if absent, no event log
    type: string
    display: object                    # per-app event display map
    references: object
    metadata: object                   # conventionally includes `comment` when page surfaces one
    notifications: boolean             # opt-in dispatch via notifications module's send-notification
                                       #   (InternalApi hook; routine is app-supplied via send_routine).
                                       #   workflows sends { event_ids: [...] }; silent no-op if no
                                       #   send_routine is wired
```

**Footgun**: `keys: []` silently no-ops the unblock. Gate with `skip` / `_if` on `keys.length` to surface empty form data as validation.

**No `force` field.** `submit-action` is the user-submit path; `force: true` lives on the lower-level `UpdateWorkflowActions` payload accessible only via privileged routes.

**Notifications dispatch is a hook, not a contract.** `notifications.send-notification` is `type: InternalApi` with `routine: _module.var: send_routine` — the routine is entirely supplied by the consuming app on the notifications module entry. The workflows module's `notify` step hard-codes `{ event_ids: [<new event id>] }` as the payload; the app's `send_routine` consumes it (typically reading the event doc by id to resolve recipients from the event's `references`). When no `send_routine` is wired, the dispatch is a silent no-op.

## `submit-action` routine

```yaml
id: submit-action
type: Api
routine:
  - :set_state:
      event_id: { _uuid: true }

  # 1. Advance current action + universal fields + unblocks in one UpdateWorkflowActions call.
  - id: update_actions
    type: UpdateWorkflowActions
    connectionId:
      _module.connectionId: workflow-api
    properties:
      currentActionId: { _payload: action_id } # aliased from payload.action_id
      eventId: { _state: event_id }
      actions:
        _array.concat:
          - - type: { _payload: current_type }
              status: { _if_none: [{ _payload: current_status }, done] }
              fields: { _payload: fields }
          - { _payload: unblocks }

  # 2. Optional entity write
  - id: write_entity
    type: MongoDBUpdateOne
    connectionId: { _payload: entity_update.connection }
    skip:
      _not: { _payload: entity_update }
    properties:
      filter: { _id: { _payload: entity_update._id } }
      update: { _payload: entity_update.update }

  # 3. Optional event log
  - id: new_event
    type: CallApi
    skip:
      _not: { _payload: event }
    properties:
      endpointId:
        _module.endpointId: { id: new-event, module: events }
      payload:
        type: { _payload: event.type }
        display: { _payload: event.display }
        references: { _payload: event.references }
        metadata: { _payload: event.metadata }

  # 4. Optional notifications dispatch (only if event was logged AND notifications opted in)
  - id: notify
    type: CallApi
    skip:
      _or:
        - _not: { _payload: event.notifications }
        - _not: { _payload: event }
    properties:
      endpointId:
        _module.endpointId: { id: send-notification, module: notifications }
      payload:
        event_ids: [{ _step: new_event.eventId }]

  - :return:
      success: true
      action_ids: { _step: update_actions }
      event_id: { _state: event_id }
```

## Composition error semantics

Mid-step failure leaves earlier writes durable and later steps unrun. No transaction, no rollback. Recovery is **user-retry** — caller resubmits, the routine re-runs from the top, idempotency guards converge to the same end state.

| Step             | Retry-safe?       | Notes                                                                                                                                     |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `update_actions` | ✓                 | Engine priority rule + same-stage workflow guard no-op repeated pushes; fan-out + upsert is idempotent per key.                           |
| `write_entity`   | depends on caller | Idempotent with `$set` / `$ifNull` / `$setOnInsert`. Not idempotent with `$push` / `$inc` / `$addToSet`. README documents the constraint. |
| `new_event`      | ✗                 | Events module generates fresh `_id` per call; retry inserts a duplicate event. Accepted as known cost.                                    |
| `notify`         | ✗                 | Same as `new_event` — duplicate notifications on retry. Accepted.                                                                         |

Stable-`event_id` flow is a purely-additive future change: events module would grow caller-supplied id support; submit-action passes the same id on retry.

## Risk

- **`submit-action` API surface stability.** If real apps surface complex submit flows beyond the four built-in steps, apps wrap their own routine around the `CallApi submit-action` step. Patterns across apps drive additive extensions to the payload; current shape stays extensible (optional fields default to no-op).
