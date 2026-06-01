# Workflows

Multi-workflow engine that lets apps declare workflow YAML, render entity-scoped action lists, and submit lifecycle transitions through engine-managed handlers. Ships shared simple-action pages (`simple-edit`, `simple-view`, `simple-review`), a `workflow-overview` page, a `group-overview` page, six operational APIs (`start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`), and a resolver-emitted dynamic surface: one page set per form action (`-edit` / `-view` / `-review` / `-error`) and one submit endpoint per form/simple action (`update-action-{action_type}`), both derived from the app's `workflows_config`. The engine is wired through a `WorkflowAPI` server connection from `@lowdefy/modules-mongodb-plugins`; engine writes are stamped with the events module's `change_stamp` so every workflow + action mutation is auditable.

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | Page wrapper consumed by every shared page |
| [events](../events/README.md) | Provides the `change_stamp` component referenced by the `workflow-api` connection |

`notifications` is consumed at runtime by the per-action submit endpoint (log-event + override-driven notifications) but is not declared as a module dependency — apps wire it independently.

## How to Use

```yaml
modules:
  - id: workflows
    source: "github:lowdefy/modules-mongodb/modules/workflows@v0.6.0"
    vars:
      workflows_config:
        _ref: workflow_config/workflows.yaml
      app_name:
        _ref:
          path: app_config.yaml
          key: app_name
      user_schema:
        roles_path: roles
      entities:
        leads-collection:
          page_id: lead-view
          id_query_key: _id
          title: Lead
        tickets-collection:
          page_id: ticket-view
          id_query_key: _id
          title: Ticket
```

- **`workflows_config`** — the app's workflow YAML (one entry per workflow type, with actions and `action_groups`). Validated at build time by `makeWorkflowsConfig`.
- **`app_name`** — host app's deployment name. Filters per-action access via `access.{app_name}` and keys the default log event's display block. See [App name scoping](../../docs/idioms.md#app-name).
- **`user_schema`** — where the engine reads the caller's roles from on the session/user object. Defaults to `{ roles_path: roles }`.
- **`entities`** — map keyed by `entity_collection` → `{ page_id, id_query_key, title }`. Used for back-link URLs from `workflow-overview` / `workflow-header` and entity-kind labels. **Every `entity_collection` referenced in `workflows_config` must have a matching key here** — the part-4 build validator fails the build if any are missing.

See `apps/demo/modules/workflows/vars.yaml` for a worked example.

### Worked example — a single form action

Declare a workflow with one form action in the app's `workflow_config/`:

```yaml
# app/workflow_config/lead-pipeline.yaml
type: lead-pipeline
entity_collection: leads-collection
starting_actions:
  - { type: qualify, status: action-required }
action_groups:
  - { id: discovery, title: Discovery }
actions:
  - type: qualify
    kind: form
    action_group: discovery
    access:
      my-app: [edit, view]
      roles: [account-manager]
    form:
      - { key: contact_name, component: text_input, title: Contact name, required: true }
      - { key: notes, component: text_area, title: Qualification notes }
    interactions:
      submit_edit: { status: done }
    status_map:
      action-required:
        my-app:
          message: Qualify the lead.
          link:
            pageId: { _module.pageId: { id: lead-pipeline-qualify-edit, module: workflows } }
            urlQuery: { action_id: true }
      done:
        my-app:
          message: Lead qualified.
```

The build emits:

- Pages at `/{workflows-entry}/lead-pipeline-qualify-edit` and `/{workflows-entry}/lead-pipeline-qualify-view`.
- An endpoint at `/api/{workflows-entry}/update-action-qualify` that pipes the submitted payload through the engine via the `workflow-api` connection.

`actions-on-entity` reads the per-status `link:` block off each action and renders it as a clickable row.

## Exports

### Pages

**Shared pages** (static):

| ID | Description | Path |
|---|---|---|
| `simple-edit` | Shared simple-action edit page (status selector + universal fields + Save). Addressed by `?action_id=<id>` | `/{entryId}/simple-edit` |
| `simple-view` | Shared simple-action view page (read-only fields + status timeline + comment timeline) | `/{entryId}/simple-view` |
| `simple-review` | Shared simple-action review page (read-only fields + approve / request_changes buttons) | `/{entryId}/simple-review` |
| `workflow-overview` | Workflow detail page (header + action cards with form_data DataView). Addressed by `?workflow_id=<id>` | `/{entryId}/workflow-overview` |
| `group-overview` | Group detail page (header + progress bar + group-status badge + action cards). Addressed by `?workflow_id=<id>&group_id=<id>` | `/{entryId}/group-overview` |

**Per-action form pages** (resolver-emitted by `makeActionPages`): one page per `(workflow_type, action_type, verb)` tuple, where `verb` is the intersection of `action.access.{app_name}.verbs` and the supported set `[edit, view, review, error]`. Only `kind: form` actions emit pages — simple and tracker actions emit none. Page ID format: `{workflow_type}-{action_type}-{verb}`. Path: `/{entryId}/{workflow_type}-{action_type}-{verb}`. Example: a `qualify` form action in the `onboarding` workflow with `access.demo.verbs: [edit, view]` emits `onboarding-qualify-edit` and `onboarding-qualify-view`.

### Components

- **`action_statuses`** — Action status enum (8 canonical statuses) merged with `vars.action_statuses_display` overrides. UI consumers only; the engine reads the canonical enum directly from the manifest via the `workflow-api` connection.
- **`workflow_lifecycle_stages`** — Workflow lifecycle stage enum (`active`, `completed`, `cancelled`) merged with `vars.workflow_lifecycle_stages_display` overrides.
- **`actions-on-entity`** — Entity-page widget surfacing every workflow attached to one entity with its action list. Takes `entity_id` + `entity_collection` vars.
- **`workflow-header`** — Per-workflow strip with title, lifecycle badge, summary counts, milestone label, workflow-overview link button. Used internally by `actions-on-entity` and `workflow-overview`.
- **`action_role_check`** — Client-side role-gate action sequence. Composed into a page's `onMount`; writes the boolean to `_state.action_allowed`.
- **`entity-workflows-refetch`** — Reusable action sequence (`CallAPI` `get-entity-workflows` → `SetState` `entity_workflows`) that any page mutating workflows on an entity can `_ref` into its event chain to refresh `actions-on-entity` without knowing the endpoint id or state key. Takes `entity_id` + `entity_collection` vars. Canonical consumer: `apps/demo/pages/leads/lead-view.yaml`'s start-onboarding modal.

### API Endpoints

**Operational** (static):

| ID | Description |
|---|---|
| `start-workflow` | Instantiate a workflow on an entity. Optional `parent_action_id` links as a child of an existing tracker action |
| `cancel-workflow` | Push `cancelled` to workflow status; flip remaining open actions to `not-required` |
| `close-workflow` | User-initiated normal termination: push `completed`; sweep non-terminal actions honoring `required_after_close` |
| `get-entity-workflows` | Return workflows + filtered actions for one entity. Consumed by `actions-on-entity` |
| `get-workflow-overview` | Return one workflow + ordered + filtered actions for the `workflow-overview` page |
| `get-action-group-overview` | Return one workflow + one action group's metadata + ordered + filtered actions in that group |

**Per-action submit endpoints** (resolver-emitted by `makeWorkflowApis`):

- `update-action-{action_type}` — one per `kind: form` or `kind: simple` action (tracker actions emit none). Bakes the action's `hooks:` / `event:` / `interactions:` blocks in as build-time literals; routes the submitted payload through `SubmitWorkflowAction` on the `workflow-api` connection.
- `update-action-{action_type}-{interaction}-{phase}` — one per declared inline hook routine (`hooks.{interaction}.{phase}.routine` on the action). Phases: `pre`, `post`. Interactions: `submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`.
- `workflow-{workflow_type}-group-{group_id}-on-complete` — one per declared `action_groups[*].on_complete.routine`. Fired by the group state machine when the group reaches a terminal status.

### Connections

| ID | Type | Purpose |
|---|---|---|
| `workflows-collection` | `MongoDBCollection` | Direct read access to the `workflows` collection |
| `actions-collection` | `MongoDBCollection` | Direct read access to the `actions` collection |
| `workflow-api` | `WorkflowAPI` | Server-side engine connection — owns transitions, tracker subscription, summary writeback |

### Menus

None in v1. Menu exports land alongside per-app navigation work.

## Vars

### `workflows_config` (required)

`array` — The app's workflow YAML. Each entry is a workflow object with `type`, `entity_collection`, `starting_actions`, optional `action_groups`, and `actions`. Schema in [`designs/workflows-module-concept/action-authoring/spec.md`](../../designs/workflows-module-concept/action-authoring/spec.md); validated by `makeWorkflowsConfig` at build time.

### `app_name` (required)

`string` — Host app's deployment name. Filters per-action access (`access.{app_name}`) and keys the default log event's display block. See [App name scoping](../../docs/idioms.md#app-name).

### `entities` (required)

`object` — Map keyed by workflow `entity_collection` → `{ page_id, id_query_key, title }`. The module deep-links into host-app entity pages using these entries. Per-key shape is not statically validated by Lowdefy; the part-4 build validator confirms every `entity_collection` referenced in `workflows_config` has a matching key here.

### `user_schema`

`object` — Defaults to `{ roles_path: roles }`. Tells the engine where to read the caller's roles from on the session/user object.

### `action_statuses_display`

`object` — Defaults to `{}`. Per-status display overrides for the shipped `action_statuses` enum. Merged via `_build.object.assign` onto the shipped enum and exposed as the `action_statuses` component for UI consumption only. The engine reads the shipped enum directly — overrides cannot affect engine priority logic.

### `workflow_lifecycle_stages_display`

`object` — Defaults to `{}`. Same shape as `action_statuses_display` for the three workflow lifecycle stages (`active`, `completed`, `cancelled`).

## Secrets

| Name | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection URI consumed by every connection |

## Plugins

- `@lowdefy/modules-mongodb-plugins` at `^0.6.0` — ships the `WorkflowAPI` server connection consumed by the `workflow-api` connection above.

## Notes

- **Prerelease (0.x).** Pin to an exact version or commit SHA in production.
- **Runtime dependencies.** Hook invocation, group `on_complete` fan-out, and per-status runtime-field projection (`status_map.{status}.{app_name}` → action root) ship behind separate engine work; until those land, declared hook routines, group callbacks, and `{ pageId, urlQuery }` links are authored but inert.
- **Cross-cutting idioms.** See [`docs/idioms.md`](../../docs/idioms.md) anchors `#change-stamps`, `#event-display`, `#slots`, `#app-name`, `#secrets`.
