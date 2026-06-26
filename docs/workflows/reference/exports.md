---
title: Exports
module: workflows
type: reference
concepts: [exports, pages, components, api, connections]
---

# Workflows — Exports

## Pages

### Shared pages (static)

| ID                        | Path                                 | Description                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workflow-action-edit`    | `/{entryId}/workflow-action-edit`    | Shared check-kind action edit page — universal fields + comment + signal button bar (`submit` / `progress` / `not_required`). No status selector. Addressed by `?action_id=<id>`                                   |
| `workflow-action-view`    | `/{entryId}/workflow-action-view`    | Shared check-kind action view page — universal fields + status history + action-filtered events timeline. Carries the `resolve_error` button (rendered only when stage is `error`). Addressed by `?action_id=<id>` |
| `workflow-action-review`  | `/{entryId}/workflow-action-review`  | Shared check-kind action review page — read-only fields + comment + `approve` / `request_changes` signal buttons                                                                                                   |
| `workflow-overview`       | `/{entryId}/workflow-overview`       | Workflow detail page — header + action cards with form_data DataView. Addressed by `?workflow_id=<id>`                                                                                                             |
| `workflow-group-overview` | `/{entryId}/workflow-group-overview` | Group detail page — header + progress bar + group-status badge + action cards. Addressed by `?workflow_id=<id>&group_id=<id>`                                                                                      |

The `workflow-` prefix is reserved module infrastructure: `{entry_id}/workflow-*` addresses these fixed pages, disjoint from per-type derived pages. `workflow` is therefore a reserved workflow type name — the build rejects it.

### Per-action form pages (resolver-emitted)

Emitted by `makeActionPages`: one page per `(workflow_type, action_type, verb)` tuple. Only `kind: form` actions emit pages — check actions use the shared `workflow-action-*` pages, and tracker actions emit none.

| Pattern                                | Path                                              |
| -------------------------------------- | ------------------------------------------------- |
| `{workflow_type}-{action_type}-{verb}` | `/{entryId}/{workflow_type}-{action_type}-{verb}` |

Supported verbs: `edit`, `view`, `review`, `error` — only verbs declared in the action's `access.{app_name}` map are emitted.

Example: a `qualify` form action in the `onboarding` workflow with `access.demo: { edit: true, view: true }` emits `onboarding-qualify-edit` and `onboarding-qualify-view`.

## Components

| ID                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action_statuses`           | Action status enum (8 canonical statuses) merged with `vars.action_statuses_display` overrides. UI consumers only — the engine reads the canonical enum directly.                                                                                                                                                                                                                                                                                                         |
| `workflow_lifecycle_stages` | Workflow lifecycle stage enum (`active`, `completed`, `cancelled`) merged with `vars.workflow_lifecycle_stages_display` overrides.                                                                                                                                                                                                                                                                                                                                        |
| `actions-on-entity`         | Entity-page widget surfacing every workflow attached to one entity with its action list. Takes `entity_id` + `entity_collection` vars. Each action row renders the server-resolved status, message, and single navigation link.                                                                                                                                                                                                                                           |
| `workflow-header`           | Per-workflow strip — title, lifecycle badge, summary counts, milestone label, workflow-overview link button. Used internally by `actions-on-entity` and `workflow-overview`.                                                                                                                                                                                                                                                                                              |
| `entity-workflows-refetch`  | Reusable action sequence (`CallAPI get-entity-workflows` → `SetState entity_workflows`) for refreshing `actions-on-entity` without knowing the endpoint id or state key. Takes `entity_id` + `entity_collection` vars.                                                                                                                                                                                                                                                    |
| `check-action-modal`        | Standalone in-context modal for opening a `kind: check` action without full page navigation. Fixed blockId `check_action_modal`. Open contract: `SetState { check_action_modal: { action_id } }` then `CallMethod { blockId: check_action_modal, method: setOpen, args: [{ open: true }] }`. Bundled automatically by `actions-on-entity`. Optional var: `on_complete`. Drop exactly once per page; never on a page that already defines a `get_workflow_action` request. |
| `check-action-click`        | Shared action sequence for `onActionClick` — kind-branch handler: `check` → open `check_action_modal`; else → `Link` to `action.link`. Baked into `actions-on-entity` by default.                                                                                                                                                                                                                                                                                         |

## API Endpoints

### Operational reads (static)

| ID                          | Description                                                                                                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-entity-workflows`      | Return workflows + grouped action cards for one entity via `GetEntityWorkflows`. Each card carries server-resolved `allowed` bag (`{ view, edit, review, error }`), per-app `message`/`status`, and a single collapsed navigation `link`. Consumed by `actions-on-entity`. |
| `get-workflow-overview`     | Return one workflow + ordered, verb-filtered, link-collapsed actions via `GetWorkflowOverview`. For the `workflow-overview` page.                                                                                                                                          |
| `get-action-group-overview` | Return one workflow + one action group's metadata + ordered, verb-filtered actions in that group via `GetWorkflowActionGroupOverview`.                                                                                                                                     |

### Resolver-emitted endpoints

One set per workflow type / form-or-check action, derived from `workflows_config` by `makeWorkflowApis`.

**Lifecycle** — one per workflow type (including all-tracker workflows). The endpoint id is built from the workflow `type`, so the workflow type is **not** passed in the payload; callers construct the id (e.g. `_module.endpointId: { id: onboarding-start, module: workflows }`).

| Pattern                  | Description                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{workflow_type}-start`  | Instantiate the workflow on an entity. Emits a `workflow-started` event. Payload: `entity_id`, `entity_collection`, optional `parent_action_id` (links the new workflow as a child of an existing tracker action), `actions` override (seeds at `action-required` or `blocked`), `metadata` (merged onto every seeded action), `references`. |
| `{workflow_type}-cancel` | Push `cancelled` to workflow status; sweep remaining open actions to `not-required` via the `internal_cancel_action` signal. Emits `workflow-cancelled`. Payload: `workflow_id`, optional `reason`, `references`.                                                                                                                            |
| `{workflow_type}-close`  | User-initiated normal termination — push `completed`; sweep non-terminal actions honoring `required_after_close`. Emits `workflow-closed`. Idempotent no-op on an already-completed workflow; rejected on a cancelled one. Payload: `workflow_id`, optional `reason`, `references`.                                                          |

**Per-action** — derived from each form/check action and its declared hooks/groups.

| Pattern                                          | Description                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{workflow_type}-{action_type}-submit`           | One per `kind: form` or `kind: check` action (tracker actions emit none). Routes payload through `SubmitWorkflowAction` on the `workflow-api` connection. Payload: `action_id`, `signal`, `current_key`, `fields`, `form`, `form_review`, `comment`, `metadata`. |
| `{workflow_type}-update-fields`                  | One per workflow that declares any form/check action. Dispatched by `action_id` through `UpdateActionFields`. Payload: `action_id`, `fields`, `comment`.                                                                                                         |
| `{workflow_type}-{action_type}-{signal}-{phase}` | One per declared inline hook routine (`hooks.{signal}.{phase}.routine`). Emitted as `InternalApi` — reachable only via the engine. Phases: `pre`, `post`.                                                                                                        |
| `{workflow_type}-group-{group_id}-on-complete`   | One per declared `action_groups[*].on_complete.routine`. Fired by the group state machine when the group reaches a terminal status.                                                                                                                              |

## Connections

| ID                     | Type                | Purpose                                                                                                                                                                                                                                          |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workflows-collection` | `MongoDBCollection` | Direct read access to the `workflows` collection                                                                                                                                                                                                 |
| `actions-collection`   | `MongoDBCollection` | Direct read access to the `actions` collection                                                                                                                                                                                                   |
| `workflow-api`         | `WorkflowAPI`       | Server-side engine connection — load-plan-commit handlers (`SubmitWorkflowAction`, `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`), FSM signal resolution, tracker cascade, event + notification dispatch, optional native `changeLog` audit |

## Menus

None in v1.
