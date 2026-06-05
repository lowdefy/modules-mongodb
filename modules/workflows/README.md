# Workflows

Multi-workflow engine that lets apps declare workflow YAML, render entity-scoped action lists, and submit lifecycle transitions through engine-managed handlers. Submissions carry a **signal** that the engine resolves against a per-kind finite-state machine (see [Transition model](#transition-model-signals)) — authors do not hand-write status transitions. Ships shared action pages (`workflow-action-edit`, `workflow-action-view`, `workflow-action-review`), a `workflow-overview` page, a `workflow-group-overview` page, six operational APIs (`start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`), and a resolver-emitted dynamic surface: one page set per form action (`-edit` / `-view` / `-review` / `-error`) and one submit endpoint per form/simple action (`{workflow_type}-{action_type}-submit`), both derived from the app's `workflows_config`. The engine is wired through a `WorkflowAPI` server connection from `@lowdefy/modules-mongodb-plugins`; engine writes are stamped with the events module's `change_stamp`, every handler invocation emits exactly one timeline event, and — when the connection's `changeLog` is configured — every workflow + action mutation is audited to the app's `log-changes` collection.

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | Page wrapper consumed by every shared page |
| [events](../events/README.md) | Provides the `change_stamp` component referenced by the `workflow-api` connection, and the `new-event` Api the engine dispatches the per-invocation log event to |
| [notifications](../notifications/README.md) | Provides the `send-notification` InternalApi the engine dispatches to after each committed event |

The `events` and `notifications` dispatch targets are resolved at app build time via `_module.endpointId` into the `workflow-api` connection's `endpoints` property; the engine consumes the pre-scoped ids verbatim.

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
entity_ref_key: lead_ids # event-references key for the entity — engine events surface on the entity's timeline under this key
starting_actions:
  - { type: qualify, status: action-required } # seed grammar: { type, status }; legal seeds are action-required | blocked
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
| `edit` | Submit → `submit`, Save draft → `progress`, Mark not required → `not_required` (opt-in) |
| `view` | Request changes → `request_changes` (opt-in), Edit → navigation Link |
| `review` | Approve → `approve`, Request changes → `request_changes` |
| `error` | Resolve → `resolve_error` |

The only author-controlled branch is the `submit` split: `submit` resolves to **`in-review`** when the action grants a `review` verb to any app in its `access:` block (someone must approve), and to **`done`** otherwise. The split is action-global — one action doc is shared across every app, so whether a review step exists is a property of the action, not the submitting app. The engine also fires internal signals authors never send directly — `unblock` (from `blocked_by` re-evaluation), `internal_cancel_action` (the cancel sweep), and `internal_mirror_child_*` (tracker subscription).

If a signal doesn't apply to the action's current stage, a user-driven submission **throws** (the page surfaced a button it shouldn't have); engine-internal cascade signals no-op silently instead. A submission is also rejected up front unless the signal's required verb (`submit`/`progress`/`not_required` → `edit`, `approve`/`request_changes` → `review`, `resolve_error` → `error`, `request_changes` on `view` → `view`) is granted to the caller by `access.{app_name}` — the access check runs before any hook fires.

#### Button visibility rules

Each template-shipped button renders only when **all three** conditions hold:

1. **Author opt-out** — `pages.{verb}.buttons.{name}.visible`, default `true`, except for the two opt-in buttons: `not_required` (on `edit`) and `request_changes` (on `view`), which default `false`. Accepts a boolean **or any operator expression** (e.g. `_eq: [{ _state: show_revise }, true]`). Because it AND-combines with the other two gates, an author can only further *restrict* visibility — not show a button that the FSM or role gate would reject.

2. **FSM source-stage** — the action's current stage must be in the signal's source-stage list (`enums/button_signal_sources.yaml`, derived from the engine FSM and guarded by a unit test). This is why a button disappears rather than throwing: the engine rejects user-driven signals with no FSM entry for the current state, and the page hides the button before the user can reach that path.

3. **Per-verb role gate** — `action_allowed.{verb}` for the page's own verb (`edit` page → `action_allowed.edit`, `review` → `action_allowed.review`, `error` → `action_allowed.error`, `view` → `action_allowed.view`). The `action_role_check` component writes this bag on mount by comparing the current user's per-app roles against `access.{app_name}` on the action config.

#### `view` page button bar

The `view` template ships two affordances:

- **Edit-nav Link** — renders when `page_ids.edit` is set (i.e. an edit page was emitted for this action in the current app). Carries `skip_status_redirect: true` so following an in-progress save back to edit doesn't redirect to view. This is navigation, not a signal — it does not call the submit endpoint.
- **`request_changes` button** (opt-in, default hidden) — sends `signal: request_changes`, fires `onRequestChanges`, targets `changes-required`. Enable via `pages.view.buttons.request_changes.visible: true`. Gated on `action_allowed.view`. Intended for the revise-after-`done` path in actions that have no `review` verb — when there is no review page, the view bar is the only surface that can send the action back to `changes-required`.

### Hooks

To run custom logic around a transition, declare a **hook** rather than overriding the transition. Hooks are keyed by **signal**, each with optional `pre` / `post` phases:

```yaml
hooks:
  submit: # signal key: submit | progress | not_required | resolve_error | approve | request_changes
    pre: { routine: [ ... ] } # inline Lowdefy routine; phases: pre | post
```

**Pre-hooks return intent; their writes are out-of-band.** A pre-hook runs after the engine's access check and before any engine write. The engine consumes only its `:return` value as plan input:

```yaml
# pre-hook `:return` shape — all keys optional
actions: # auxiliary signals against OTHER actions
  - { type: provision-access, signal: activate, upsert: true } # upsert spawns a missing keyed target
form_overrides: { ... } # deep-merged into the submission's form data
event_overrides: { ... } # layered onto the dispatched log event
```

- A pre-hook **cannot re-signal the current action** — where the submitted action lands is fixed by the signal the user fired; the engine rejects redirect attempts. Conditional landing ("mark this not-required instead") is modelled as a separate thin action with its own button.
- An `actions[]` entry may carry `upsert: true` to spawn a missing keyed target, and optional `fields` / `metadata` bags to seed data onto the target.
- Any reads/writes the pre-hook performs itself (CallAPI, MongoDB) commit **independently of the engine's atomic commit** — by contract they are out-of-band external coordination and are not rolled back if the submit fails. A pre-hook `:reject` aborts the submit before any engine write.

**Post-hooks fire after the commit.** The hook payload's `context` carries the post-commit workflow + action docs (no re-read needed), and `result` is `{ action_ids, completed_groups, event_id, tracker_fired }`. Because the engine's writes have already landed, a post-hook failure does **not** roll them back — post-hook routines must be idempotent / safe to re-run, since a retried submission fires them again.

## Exports

### Pages

**Shared pages** (static):

| ID | Description | Path |
|---|---|---|
| `workflow-action-edit` | Shared simple-kind action edit page (universal fields + signal buttons). Addressed by `?action_id=<id>` | `/{entryId}/workflow-action-edit` |
| `workflow-action-view` | Shared simple-kind action view page (read-only fields + status timeline + comment timeline) | `/{entryId}/workflow-action-view` |
| `workflow-action-review` | Shared simple-kind action review page (read-only fields + approve / request-changes buttons) | `/{entryId}/workflow-action-review` |
| `workflow-overview` | Workflow detail page (header + action cards with form_data DataView). Addressed by `?workflow_id=<id>` | `/{entryId}/workflow-overview` |
| `workflow-group-overview` | Group detail page (header + progress bar + group-status badge + action cards). Addressed by `?workflow_id=<id>&group_id=<id>` | `/{entryId}/workflow-group-overview` |

The `workflow-` prefix marks the module's fixed page space: `{entry_id}/workflow-*` always addresses module infrastructure, disjoint from the per-type derived pages below (and `workflow` is therefore a reserved workflow type name — the build rejects it).

**Per-action form pages** (resolver-emitted by `makeActionPages`): one page per `(workflow_type, action_type, verb)` tuple, where the verbs are the keys declared in the action's `access.{app_name}` map (supported set: `edit`, `view`, `review`, `error`). Only `kind: form` actions emit pages — simple actions use the shared `workflow-action-*` pages, and tracker actions emit none. Page ID format: `{workflow_type}-{action_type}-{verb}`. Path: `/{entryId}/{workflow_type}-{action_type}-{verb}`. Example: a `qualify` form action in the `onboarding` workflow with `access.demo: { edit: true, view: true }` emits `onboarding-qualify-edit` and `onboarding-qualify-view`.

### Components

- **`action_statuses`** — Action status enum (8 canonical statuses) merged with `vars.action_statuses_display` overrides. UI consumers only; the engine reads the canonical enum directly from the manifest via the `workflow-api` connection.
- **`workflow_lifecycle_stages`** — Workflow lifecycle stage enum (`active`, `completed`, `cancelled`) merged with `vars.workflow_lifecycle_stages_display` overrides.
- **`actions-on-entity`** — Entity-page widget surfacing every workflow attached to one entity with its action list. Takes `entity_id` + `entity_collection` vars.
- **`workflow-header`** — Per-workflow strip with title, lifecycle badge, summary counts, milestone label, workflow-overview link button. Used internally by `actions-on-entity` and `workflow-overview`.
- **`action_role_check`** — Client-side per-verb role-gate action sequence. Composed into a page's `onMount`; writes the four-key bag `_state.action_allowed: { view, edit, review, error }` by evaluating each `access.{app}.{verb}` gate against the user's app roles (Part 34 D8). Page templates read the verb-specific bool (e.g. `_state: action_allowed.edit`). Defence in depth only — the server-side `visible_verbs` query filter and the submit-time gate are authoritative.
- **`entity-workflows-refetch`** — Reusable action sequence (`CallAPI` `get-entity-workflows` → `SetState` `entity_workflows`) that any page mutating workflows on an entity can `_ref` into its event chain to refresh `actions-on-entity` without knowing the endpoint id or state key. Takes `entity_id` + `entity_collection` vars. Canonical consumer: `apps/demo/pages/leads/lead-view.yaml`'s start-onboarding modal.

- **`timeline-action-lookup`** — Aggregation pipeline fragment that enriches events with live action cards (status, message, access-resolved link). Consumed internally by the events module's timeline; also exported so app developers building custom history pipelines can splice it in rather than re-authoring the de-duplication logic.

  **It is a multi-stage fragment — splice it with `_build.array.concat`, not a bare `- _ref:`.** A bare `- _ref:` nests the fragment as a single pipeline element instead of flattening its stages into the surrounding array.

  ```yaml
  pipeline:
    _build.array.concat:
      - - $match: { ... }           # entity + category-chip filtering, app-authored
      - _ref:
          module: workflows
          component: timeline-action-lookup
          vars: { app_name: my-app }
      - - $facet: { ... }           # pagination, app-authored
  ```

  The fragment reads `action.{app_name}.message` and resolves a single navigation link via the priority **edit > review > error > view**. Category-chip filtering (pre-`$match` on event type) and pagination (post-`$facet`) stay app-authored — these are non-goals for the shared fragment. See [Live action cards](../../docs/idioms.md#live-action-cards).

### API Endpoints

**Operational** (static):

| ID | Description |
|---|---|
| `start-workflow` | Instantiate a workflow on an entity; emits a `workflow-started` event. The optional `actions` payload override seeds actions at a declared status — `{ type, status }` grammar, legal seeds `action-required` \| `blocked` (signals are submit-time grammar only and don't apply at start). Optional `metadata` merges onto every seeded action doc; optional `parent_action_id` links the new workflow as a child of an existing tracker action |
| `cancel-workflow` | Push `cancelled` to workflow status; sweep remaining open actions to `not-required` (the internal `internal_cancel_action` signal); emits a `workflow-cancelled` event |
| `close-workflow` | User-initiated normal termination: push `completed`; sweep non-terminal actions honoring `required_after_close`; emits a `workflow-closed` event. Idempotent no-op on an already-completed workflow; rejected on a cancelled one |
| `get-entity-workflows` | Return workflows + actions for one entity. Each action carries a per-user `visible_verbs` bag (`{ view, edit, review, error }`); actions with no visible verb are dropped. Consumed by `actions-on-entity` |
| `get-workflow-overview` | Return one workflow + ordered + verb-filtered actions for the `workflow-overview` page |
| `get-action-group-overview` | Return one workflow + one action group's metadata + ordered + verb-filtered actions in that group |

**Per-action submit endpoints** (resolver-emitted by `makeWorkflowApis`):

- `{workflow_type}-{action_type}-submit` — one per `kind: form` or `kind: simple` action (tracker actions emit none). Bakes the action's signal-keyed `hooks:` / `event:` maps in as build-time literals; routes the submitted payload through `SubmitWorkflowAction` on the `workflow-api` connection. The payload carries `action_id`, `signal`, `current_key`, `fields`, `form`, `form_review`, `comment`, and `metadata` — there is no `force` flag, no interaction key, and no client-supplied status: transition legality is resolved server-side by the FSM.
- `{workflow_type}-{action_type}-{signal}-{phase}` — one per declared inline hook routine (`hooks.{signal}.{phase}.routine` on the action). Phases: `pre`, `post`. Signals: `submit`, `progress`, `not_required`, `resolve_error`, `approve`, `request_changes`. Emitted as `InternalApi` — reachable only via the engine, never by direct HTTP or client CallAPI.
- `{workflow_type}-group-{group_id}-on-complete` — one per declared `action_groups[*].on_complete.routine`. Fired by the group state machine when the group reaches a terminal status.

### Connections

| ID | Type | Purpose |
|---|---|---|
| `workflows-collection` | `MongoDBCollection` | Direct read access to the `workflows` collection |
| `actions-collection` | `MongoDBCollection` | Direct read access to the `actions` collection |
| `workflow-api` | `WorkflowAPI` | Server-side engine connection — load-plan-commit handlers (`SubmitWorkflowAction`, `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`), FSM signal resolution, tracker cascade, event + notification dispatch, optional native `changeLog` audit |

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
- [`loadWorkflowState.js`](../../plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js) — `find({ workflow_id })` in every engine handler's load phase (submit, start, cancel, close, and each tracker-cascade level).

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

`array` — The app's workflow YAML. Each entry is a workflow object with `type`, `entity_collection`, `entity_ref_key` (required — the event-references key for the workflow's entity, e.g. `lead_ids`, so engine events surface on the entity's timeline), `starting_actions`, optional `action_groups`, and `actions`. Schema in [`designs/workflows-module-concept/action-authoring/spec.md`](../../designs/workflows-module-concept/action-authoring/spec.md); validated by `makeWorkflowsConfig` at build time.

### `app_name` (required)

`string` — Host app's deployment name. Three roles: (1) filters per-action access (`access.{app_name}`); (2) keys the default log event's display block; (3) keys the per-app display the engine writes onto each action doc — display surfaces read `action.{app_name}.message` and `action.{app_name}.links` for the current app's slug. See [App name scoping](../../docs/idioms.md#app-name).

### `entities` (required)

`object` — Map keyed by workflow `entity_collection` → `{ page_id, id_query_key, title }`. The module deep-links into host-app entity pages using these entries. Per-key shape is not statically validated by Lowdefy; the part-4 build validator confirms every `entity_collection` referenced in `workflows_config` has a matching key here.

### `user_schema`

`object` — Defaults to `{ roles_path: roles }`. Tells the engine where to read the caller's roles from on the session/user object.

### `action_statuses_display`

`object` — Defaults to `{}`. Per-status display overrides for the shipped `action_statuses` enum. Merged via `_build.object.assign` onto the shipped enum and exposed as the `action_statuses` component for UI consumption only. The engine reads the shipped enum directly — overrides are UI-only and cannot affect engine behaviour (transition legality is owned by the per-kind FSM tables; the enum's `priority` is display-only ordering).

### `workflow_lifecycle_stages_display`

`object` — Defaults to `{}`. Same shape as `action_statuses_display` for the three workflow lifecycle stages (`active`, `completed`, `cancelled`).

## Secrets

| Name | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection URI consumed by every connection |

## Plugins

- `@lowdefy/modules-mongodb-plugins` at `^0.6.0` — ships the `WorkflowAPI` server connection consumed by the `workflow-api` connection above. Declares `mongodb` `^6` as a peer dependency: the host app provides the single driver build, from which the engine constructs its own pooled `MongoClient` for engine-internal write paths (app-side YAML requests keep using the community plugin).

## Notes

- **Prerelease (0.x).** Pin to an exact version or commit SHA in production.
- **Runtime dependencies.** Per-signal pre/post hooks are invoked by the engine. Navigation links are engine-derived from each action's `access:` verbs and emitted pages — authors don't write `link:` blocks. Group `on_complete` fan-out is the remaining unlanded engine piece (Part 11): declared `on_complete` routines are authored but inert until it ships.
- **Event types.** Every engine invocation emits exactly one timeline event: `action-{signal}` for submits, `workflow-started` / `workflow-cancelled` / `workflow-closed` for the lifecycle handlers, and `action-internal-mirror-{state}` per tracker-mirror level. Apps that subscribe to events (notifications, external syncs) should explicitly route or ignore the lifecycle and mirror types.
- **Transactions and atomicity.** On a replica set the engine commits each invocation's workflow + action writes in one transaction; on a standalone `mongod` it falls back to ordered writes guarded by the same compare-and-swap claim (the detected mode is logged at connection init). Event, notification, and change-log dispatches happen after the commit — a dispatch failure never rolls back a committed submit; it surfaces as a `post_commit_dispatch_failed` error after the invocation completes.
- **Concurrency.** Handlers are optimistic: a concurrent write to the same workflow between an invocation's load and commit throws a retryable `concurrent_submit` error with zero writes landed — the caller decides whether to retry (the engine doesn't auto-retry, since that would re-fire pre-hooks). Tracker-cascade levels are the one exception: they auto-retry internally (bounded), having no pre-hook.
- **Form data accumulation.** Each submission's form payload deep-merges onto the workflow's `form_data.{action}` namespace (objects merge; arrays, scalars, and `null` replace whole). Omitting a field leaves its prior value — clearing is explicit (`field: null`), never by omission.
- **Cross-cutting idioms.** See [`docs/idioms.md`](../../docs/idioms.md) anchors `#change-stamps`, `#event-display`, `#slots`, `#app-name`, `#secrets`.
