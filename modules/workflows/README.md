# Workflows

Multi-workflow engine that lets apps declare workflow YAML, render entity-scoped action lists, and submit lifecycle transitions through engine-managed handlers. Submissions carry a **signal** that the engine resolves against a per-kind finite-state machine (see [Transition model](#transition-model-signals)) — authors do not hand-write status transitions. Ships shared simple-action pages (`simple-edit`, `simple-view`, `simple-review`), a `workflow-overview` page, a `group-overview` page, six operational APIs (`start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`), and a resolver-emitted dynamic surface: one page set per form action (`-edit` / `-view` / `-review` / `-error`) and one submit endpoint per form/simple action (`{workflow_type}-{action_type}-submit`), both derived from the app's `workflows_config`. The engine is wired through a `WorkflowAPI` server connection from `@lowdefy/modules-mongodb-plugins`; engine writes are stamped with the events module's `change_stamp` so every workflow + action mutation is auditable.

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
      my-app:
        view: true
        edit: [account-manager]
    form:
      - { key: contact_name, component: text_input, title: Contact name, required: true }
      - { key: notes, component: text_area, title: Qualification notes }
    status_map:
      action-required:
        my-app: { message: Qualify the lead. }
      done:
        my-app: { message: Lead qualified. }
```

The build emits:

- Pages at `/{workflows-entry}/lead-pipeline-qualify-edit` and `/{workflows-entry}/lead-pipeline-qualify-view` — one per verb declared in `access.my-app`.
- An endpoint at `/api/{workflows-entry}/lead-pipeline-qualify-submit` that pipes the submitted payload — including the resolved signal — through the engine via the `workflow-api` connection.

At runtime the engine resolves each submission as a **signal** against the action's FSM (see [Transition model](#transition-model-signals)). `actions-on-entity` renders each action row with an engine-derived link to the right per-verb page — authors do **not** write `link:` blocks in `status_map` (the validator rejects them; navigation is gated by `access:` verbs instead).

## Authoring actions

Every action declares a `kind:` — `form`, `simple`, or `tracker` — and an `access:` block. The action-level fields the engine reads at runtime are `type`, `kind`, `key`, `tracker`, `blocked_by`, `action_group`, `sort_order`, `required_after_close`, `access`, and `status_map`. Build-time-only fields (`form`, `hooks`, `event`, `pages`) are consumed by the resolvers. Schema source of truth: [`makeWorkflowsConfig.js`](resolvers/makeWorkflowsConfig.js) and [`action-authoring/spec.md`](../../designs/workflows-module-concept/action-authoring/spec.md).

### Access (`access:`)

One canonical shape — a per-app, per-verb map. Verbs are `view`, `edit`, `review`, `error`; each gate is `true` (any authenticated user) or a non-empty `[roles]` list. Omit a verb to deny it.

```yaml
access:
  my-app:
    view: true
    edit: [account-manager]
    review: [sales-manager] # presence of `review` flips the submit signal — see below
```

The action-wide `roles:` key and the `access.{app}: [verbs]` shorthand are **removed** (Part 34 D4) — the validator hard-errors on both. `notification_roles` lives at the action root, not under `access:`.

### Status copy (`status_map:`)

`status_map` supplies per-stage display copy only — `{ message?, status_title? }` per app. It carries **no** `link:` (the engine derives navigation from `access:` verbs and the emitted per-verb pages; the validator rejects authored links on built-in kinds).

```yaml
status_map:
  action-required:
    my-app: { message: Qualify the lead. }
  done:
    my-app: { message: Lead qualified. }
```

### Transition model (signals)

Actions don't declare their own status transitions. Each submission carries a **signal**, and the engine resolves `(current_stage, signal) → new_stage` against a per-kind finite-state machine (`form`, `simple`, `tracker`). The FSM tables are engine-owned and not author-overridable in v1 ([`shared/fsm/tables.js`](../../plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js)).

The buttons each page template ships emit fixed signals:

| Template | Buttons → signals |
|---|---|
| `edit` | Submit → `submit`, Save draft → `progress`, Mark not required → `not_required` |
| `review` | Approve → `approve`, Request changes → `request_changes` |
| `error` | Resolve → `resolve_error` |

The only author-controlled branch is the `submit` split: `submit` resolves to **`in-review`** when the action grants a `review` verb to any app in its `access:` block (someone must approve), and to **`done`** otherwise. The engine also fires internal signals authors never send directly — `unblock` (from `blocked_by` re-evaluation) and `internal_mirror_child_*` (tracker subscription).

To run custom logic around a transition, declare a **hook** rather than overriding the transition:

```yaml
hooks:
  submit_edit: # interaction key: submit_edit | not_required | resolve_error | approve | request_changes
    pre: { routine: [ ... ] } # inline Lowdefy routine; phases: pre | post
```

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
- **`action_role_check`** — Client-side per-verb role-gate action sequence. Composed into a page's `onMount`; writes the four-key bag `_state.action_allowed: { view, edit, review, error }` by evaluating each `access.{app}.{verb}` gate against the user's app roles (Part 34 D8). Page templates read the verb-specific bool (e.g. `_state: action_allowed.edit`). Defence in depth only — the server-side `visible_verbs` query filter and the submit-time gate are authoritative.
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

- `{workflow_type}-{action_type}-submit` — one per `kind: form` or `kind: simple` action (tracker actions emit none). Bakes the action's `hooks:` / `event:` maps in as build-time literals; routes the submitted payload — including the resolved signal — through `SubmitWorkflowAction` on the `workflow-api` connection.
- `{workflow_type}-{action_type}-{interaction}-{phase}` — one per declared inline hook routine (`hooks.{interaction}.{phase}.routine` on the action). Phases: `pre`, `post`. Interactions: `submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`.
- `{workflow_type}-group-{group_id}-on-complete` — one per declared `action_groups[*].on_complete.routine`. Fired by the group state machine when the group reaches a terminal status.

### Connections

| ID | Type | Purpose |
|---|---|---|
| `workflows-collection` | `MongoDBCollection` | Direct read access to the `workflows` collection |
| `actions-collection` | `MongoDBCollection` | Direct read access to the `actions` collection |
| `workflow-api` | `WorkflowAPI` | Server-side engine connection — owns transitions, tracker subscription, summary writeback |

### Menus

None in v1. Menu exports land alongside per-app navigation work.

## Indexes

The module's shipped queries assume two indexes exist on the collections behind the `actions-collection` and `workflows-collection` connections. The module does **not** create them — index creation is a host-app concern (consumer apps declare indexes via the `splice-actions` pattern). Host apps must add the following.

### `actions`

`{ workflow_id: 1 }` — **non-partial.**

Serves every workflow-stream read:

- [`api/get-workflow-overview.yaml`](api/get-workflow-overview.yaml) — `$lookup foreignField: workflow_id`, on every workflow overview load.
- [`api/get-action-group-overview.yaml`](api/get-action-group-overview.yaml) — `$lookup foreignField: workflow_id` (with a sub-pipeline filter on `action_group`), on every group overview load.
- [`api/get-entity-workflows.yaml`](api/get-entity-workflows.yaml) — `$lookup foreignField: workflow_id`, once per workflow on every entity page render.
- [`getActions.js`](../../plugins/modules-mongodb-plugins/src/connections/shared/getActions.js) — `find({ workflow_id })`, invoked by `recomputeWorkflowAfterActionWrite` after every action submit.
- `CancelWorkflow` / `CloseWorkflow` — `find` / `updateMany` scoped by `workflow_id` (admin actions).

Equality on `workflow_id` is the only useful key. The per-workflow `$sort` keys inside the `$lookup` sub-pipelines mix pipeline-computed fields (`groupIndex`, `required_sort`, `sort`) and stored fields (`created.timestamp`, `_id`); none are indexable here, and the per-workflow result set is small (typically <30 actions), so Mongo sorts it in memory.

**Keep it non-partial.** Future `kind: task` adhoc docs in this collection carry `workflow_id: null`. A non-partial index includes those null entries, costs nothing for the workflow-stream queries (they all filter by a concrete workflow `_id`), and stays usable for future tasks-module queries that join on `workflow_id`. Do **not** "optimise" it into a partial index filtered on `workflow_id` existing — that would silently break tasks-module queries that share this index path.

### `workflows`

`{ entity_collection: 1, entity_id: 1 }` — **non-partial.**

Serves the entity workflow list:

- [`api/get-entity-workflows.yaml`](api/get-entity-workflows.yaml) — `$match: { entity_collection, entity_id }` then `$sort: { display_order: 1, created.timestamp: -1 }`, on every entity page render.

The compound index matches the equality prefix exactly. Per-entity workflow counts are small (single-digit rows in shipped apps), so the post-match in-memory sort on `display_order` + `created.timestamp` is cheap; extending the index with `display_order` is a future-proofing knob, not a hot-path need.

### Schema-shape constraint

The `actions` collection must remain free of any collection-level required-field **validator** beyond the always-present `_id`, `kind`, `status`, `change_stamp`. The shipped `connections/actions-collection.yaml` carries no `validator:` block — keep it that way. The future tasks module writes `kind: task` adhoc docs with `workflow_id: null` and no `type`; a Mongo collection validator enforcing workflow-shaped fields would block that write path. Field-level invariants, if ever needed, belong in the write APIs, not a collection validator.

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
- **Runtime dependencies.** Per-signal pre/post hooks are invoked by the engine. Navigation links are engine-derived from each action's `access:` verbs and emitted pages — authors don't write `link:` blocks. Group `on_complete` fan-out is the remaining unlanded engine piece (Part 11): declared `on_complete` routines are authored but inert until it ships.
- **Cross-cutting idioms.** See [`docs/idioms.md`](../../docs/idioms.md) anchors `#change-stamps`, `#event-display`, `#slots`, `#app-name`, `#secrets`.
