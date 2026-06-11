# Workflows

Multi-workflow engine that lets apps declare workflow YAML, render entity-scoped action lists, and submit lifecycle transitions through engine-managed handlers. Submissions carry a **signal** that the engine resolves against a per-kind finite-state machine (see [Transition model](#transition-model-signals)) — authors do not hand-write status transitions. Ships shared action pages (`workflow-action-edit`, `workflow-action-view`, `workflow-action-review`), a `workflow-overview` page, a `workflow-group-overview` page, six operational APIs (`start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`), and a resolver-emitted dynamic surface: one page set per form action (`-edit` / `-view` / `-review` / `-error`) and one submit endpoint per form/check action (`{workflow_type}-{action_type}-submit`), both derived from the app's `workflows_config`. The engine is wired through a `WorkflowAPI` server connection from `@lowdefy/modules-mongodb-plugins`; engine writes are stamped with the events module's `change_stamp`, every handler invocation emits exactly one timeline event, and — when the connection's `changeLog` is configured — every workflow + action mutation is audited to the app's `log-changes` collection.

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

Every action declares a `kind:` — `form`, `check`, or `tracker` — and an `access:` block. The action-level fields the engine reads at runtime are `type`, `kind`, `key`, `tracker`, `blocked_by`, `action_group`, `sort_order`, `required_after_close`, `allow_not_required`, `access`, and `status_map`. Build-time-only fields (`form`, `hooks`, `event`, `pages`) are consumed by the resolvers. Schema source of truth: [`makeWorkflowsConfig.js`](resolvers/makeWorkflowsConfig.js) and [`action-authoring/spec.md`](../../designs/workflows-module-concept/action-authoring/spec.md).

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

Actions don't declare their own status transitions. Each submission carries a **signal**, and the engine resolves `(current_stage, signal) → new_stage` against a per-kind finite-state machine (`form`, `check`, `tracker`). The FSM tables are engine-owned and not author-overridable in v1 ([`shared/fsm/tables.js`](../../plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js)).

The buttons each page template ships emit fixed signals:

| Template | Buttons → signals |
|---|---|
| `edit` | Submit → `submit`, Save draft → `progress`, Mark not required → `not_required` (opt-in via `allow_not_required`) |
| `view` | Request changes → `request_changes` (opt-in), Edit → navigation Link |
| `review` | Approve → `approve`, Request changes → `request_changes` |
| `error` | Resolve → `resolve_error` |

The only author-controlled branch is the `submit` split: `submit` resolves to **`in-review`** when the action grants a `review` verb to any app in its `access:` block (someone must approve), and to **`done`** otherwise. The split is action-global — one action doc is shared across every app, so whether a review step exists is a property of the action, not the submitting app. The engine also fires internal signals authors never send directly — `unblock` (from `blocked_by` re-evaluation), `internal_cancel_action` (the cancel sweep), and `internal_mirror_child_*` (tracker subscription).

If a signal doesn't apply to the action's current stage, a user-driven submission **throws** (the page surfaced a button it shouldn't have); engine-internal cascade signals no-op silently instead. A submission is also rejected up front unless the signal's required verb (`submit`/`progress`/`not_required` → `edit`, `approve`/`request_changes` → `review`, `resolve_error` → `error`) is granted to the caller by `access.{app_name}` — the access check runs before any hook fires.

#### Button visibility rules

Button visibility is **resolved server-side**. On mount each action detail page calls the `GetWorkflowAction` engine method, which collapses the policy into a per-signal boolean map — `action.buttons: { submit, progress, not_required, approve, request_changes, resolve_error }` — and the page renders the booleans dumb. For each signal the server boolean is true only when **all** of the following hold:

1. **FSM source-stage** — the action's current stage is in the signal's source-stage list (`BUTTON_SIGNAL_SOURCES` in [`resolveActionAccess.js`](../../plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.js), a faithful inversion of the engine FSM restricted to the six user-facing signals and guarded by a unit test). This is why a button disappears rather than throwing: the engine rejects user-driven signals with no FSM entry for the current stage, and the page hides the button before the user can reach that path.

2. **Per-verb role gate** — `allowed.{verb}` for the signal's required verb, computed server-side from `access.{app_name}` against the caller's roles. The same `allowed` bag rides the `GetWorkflowAction` response, and the response is denied outright when `allowed.view` is false.

3. **`allow_not_required`** (the `not_required` signal only) — the action-root boolean must be `true`. See below.

On top of the server booleans, form pages keep a client-side **author opt-out**: `pages.{verb}.buttons.{name}.visible`, default `true` for every edit-page button (including `not_required`), and default `false` for the one remaining opt-in, `request_changes` on `view`. It accepts a boolean **or any operator expression** (e.g. `_eq: [{ _state: show_revise }, true]`) and AND-combines with the server boolean — an author can only further *restrict* visibility, never show a button the FSM, role gate, or `allow_not_required` would reject.

#### Mark not required (`allow_not_required:`)

`allow_not_required` is an action-root boolean, valid on **every kind** (form + check), **default `false`** — "mark not required" is never on by default. It is read from live config and enforced server-side twice: `GetWorkflowAction` resolves `buttons.not_required` to `false` unless the flag is `true` (the button never renders without the opt-in), and the engine's submit load phase rejects a `not_required` signal with `access_denied` unless the action opts in — a hand-crafted submission can't bypass the hidden button.

```yaml
- type: qualify
  kind: form
  allow_not_required: true # opt in to the "Mark Not Required" button
  access: { ... }
```

**Migration note.** Before Part 46 the not-required button was page-config opt-in (`pages.edit.buttons.not_required.visible`, default `false`). That page-config flag is now a default-`true` opt-out like every other edit-page button, and the opt-in moved to the action root: form actions that previously surfaced the button via `pages.edit.buttons.not_required.visible: true` must add `allow_not_required: true` (the stale `visible: true` is harmless but no longer sufficient).

#### `view` page button bar

The `view` template ships two affordances:

- **Edit-nav Link** — renders when `page_ids.edit` is set (i.e. an edit page was emitted for this action in the current app). Carries `skip_status_redirect: true` so following an in-progress save back to edit doesn't redirect to view. This is navigation, not a signal — it does not call the submit endpoint.
- **`request_changes` button** (opt-in, default hidden) — sends `signal: request_changes`, fires `onRequestChanges`, targets `changes-required`. Enable via `pages.view.buttons.request_changes.visible: true`; also gated on the server-resolved `action.buttons.request_changes` (which requires the `review` verb). Intended for the revise-after-`done` path — when no review page surfaces it, the view bar is the only place that can send the action back to `changes-required`.

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

### Tracker actions (`tracker:`)

A tracker action mirrors a child workflow's lifecycle — its stage follows the child (`active → in-progress`, `completed → done`, `cancelled → not-required`). It is never submitted by a user; the engine writes it via the internal tracker subscription.

The `tracker:` block carries two fields:

| Field | Required | Description |
|---|---|---|
| `workflow_type` | yes | The child workflow type this action mirrors |
| `start_link` | no | Navigation target rendered before the child exists — `{ pageId, urlQuery? }` |

**When to use `start_link`.** Before a child workflow is started, the tracker row is `action-required` with nothing to click. `start_link` points to the app page where the child gets created. Choose the shape based on where creation lives:

- **App page owns creation → `start_link`** — the tracker row links directly to the creation page; no separate trigger action needed.
- **Inline form owns creation → paired trigger + tracker** — a `kind: form` (or `kind: check`) trigger action creates the child and calls `start-workflow` from its submit hook; the tracker mirrors the result. This remains the right shape when there is no app page for the child.

**`start_link` shape.**

```yaml
tracker:
  workflow_type: device-installation
  start_link:
    pageId: ticket-new # app page id, used verbatim
    urlQuery:
      action_id: true   # → tracker action _id (pass as parent_action_id to start-workflow)
      entity_id: true   # → parent workflow's entity _id (prefill the child doc's parent ref)
      source: onboarding # static params pass through verbatim
```

Two reserved `urlQuery` keys substitute runtime values: `action_id: true` resolves to the tracker action's `_id`; `entity_id: true` resolves to the tracker action's `entity_id` (the parent workflow's entity). Any other key must carry a string, passed through verbatim. Both are optional.

**`edit` verb gates the link.** `start_link` is emitted as the tracker's `edit`-verb link — it appears only for slugs that declare `edit` in `access.{slug}`, role-filtered at read time like every other link. Trackers that declare only `view` remain display-only. The link is live while the tracker is `action-required` with no child started; once `start-workflow` runs, it is replaced by a `view` link to the child's `workflow-overview`.

**Destination page contract.** The page that `start_link` points to is responsible for creating the child entity (if needed) and calling `start-workflow`. `action_id` in the URL is the `parent_action_id`:

```yaml
- id: start_child_workflow
  type: CallAPI
  params:
    endpointId:
      _module.endpointId: { id: start-workflow, module: workflows }
    payload:
      workflow_type: device-installation
      entity_id:
        _step: create_ticket.insertedId
      entity_collection: tickets-collection
      parent_action_id:
        _url_query: action_id
```

Clicking the link changes no workflow state. Abandoning the page abandons nothing — the tracker stays `action-required` and the link remains.

**Known limitation.** A cancelled child leaves the tracker `not-required` with its child link still set, so the start link does not reappear — accepted for v1 (see the [Part 44 design](../../designs/workflows-module/parts/_completed/44-tracker-start-link/design.md) for recovery paths).

### Starting actions (`starting_actions:`)

`starting_actions` is the workflow's scope declaration. It seeds one action doc per entry when the workflow is started, and it tells every user what the full set of standard actions is the moment the workflow appears.

**List every standard action.** Include every action that will exist unconditionally — entry actions at `action-required`, downstream actions at `blocked`. The workflow then renders its complete scope on load, not just the first unlocked step.

```yaml
starting_actions:
  - { type: qualify, status: action-required }       # entry — immediately actionable
  - { type: send-quote, status: blocked }            # standard downstream
  - { type: schedule-followup, status: blocked }     # standard downstream
  - { type: upload-po, status: blocked }             # standard downstream
  - { type: track-company-setup, status: blocked }   # standard downstream
  # site-visit is absent — conditional; spawned by the qualify pre-submit hook
  # with { type: site-visit, signal: activate, upsert: true } when needed.
```

Legal seed statuses are `action-required` and `blocked` only — `makeWorkflowsConfig` rejects any other value at build time, and `StartWorkflow` enforces the same rule on the `start-workflow` payload's `actions:` override at runtime. These are the only two states that make sense at creation: an action either needs attention now or is waiting on something else. Any other status implies a transition that should have gone through the FSM.

**Do not list conditional actions.** An action whose existence depends on runtime user input is not a standard action — it may or may not ever exist. List only the actions that always exist; conditional actions are spawned by pre-submit hooks with `upsert: true` when the condition is met. An action neither listed nor hook-spawned never exists.

The demo's `apps/demo/modules/workflows/workflow_config/onboarding/` is the worked example: `qualify`, `send-quote`, `schedule-followup`, `upload-po`, and `track-company-setup` are listed; `site-visit` is conditional (spawned by the `qualify` pre-submit hook when the user flags a site visit is needed) and correctly absent.

### Conditional actions and `blocked_by`

**Conditional actions must never appear as `blocked_by` targets.** A `blocked_by` entry naming an action type resolves by checking whether that type has reached a terminal status (`done` or `not-required`). If no doc of that type exists — because a conditional action was never spawned — the entry resolves as *unsatisfied* forever, and the action waiting on it is permanently blocked.

This is not a recoverable state: the engine reads `blocked_by` only on actions (never on groups), so there is no automatic way to unblock an action gated on a type that never existed. The conditional action that was never spawned will simply never satisfy the check.

**Use the group target instead.** An action that should wait on a group of work — which may or may not include conditional actions — names the group ID in `blocked_by`. Group status is derived from whatever member docs actually exist: a never-spawned conditional simply isn't counted in the group's progress. An action blocked by a group unblocks when the group reaches `done`.

```yaml
# WRONG — blocks forever if site-visit is never spawned
blocked_by:
  - site-visit  # conditional type; may not exist

# RIGHT — block on the quoting group, which includes site-visit as a member
blocked_by:
  - quoting  # group id; unblocks when the group is done regardless of which
             # actions in the group were ever spawned
```

Note: `blocked_by` is an action-level field. A `blocked_by` key on a group entry in `action_groups:` is ignored by the engine.

## Exports

### Pages

**Shared pages** (static):

| ID | Description | Path |
|---|---|---|
| `workflow-action-edit` | Shared check-kind action edit page (universal fields + signal buttons). Addressed by `?action_id=<id>` | `/{entryId}/workflow-action-edit` |
| `workflow-action-view` | Shared check-kind action view page (read-only fields + status timeline + comment timeline) | `/{entryId}/workflow-action-view` |
| `workflow-action-review` | Shared check-kind action review page (read-only fields + approve / request-changes buttons) | `/{entryId}/workflow-action-review` |
| `workflow-overview` | Workflow detail page (header + action cards with form_data DataView). Addressed by `?workflow_id=<id>` | `/{entryId}/workflow-overview` |
| `workflow-group-overview` | Group detail page (header + progress bar + group-status badge + action cards). Addressed by `?workflow_id=<id>&group_id=<id>` | `/{entryId}/workflow-group-overview` |

The `workflow-` prefix marks the module's fixed page space: `{entry_id}/workflow-*` always addresses module infrastructure, disjoint from the per-type derived pages below (and `workflow` is therefore a reserved workflow type name — the build rejects it).

**Per-action form pages** (resolver-emitted by `makeActionPages`): one page per `(workflow_type, action_type, verb)` tuple, where the verbs are the keys declared in the action's `access.{app_name}` map (supported set: `edit`, `view`, `review`, `error`). Only `kind: form` actions emit pages — check actions use the shared `workflow-action-*` pages, and tracker actions emit none. Page ID format: `{workflow_type}-{action_type}-{verb}`. Path: `/{entryId}/{workflow_type}-{action_type}-{verb}`. Example: a `qualify` form action in the `onboarding` workflow with `access.demo: { edit: true, view: true }` emits `onboarding-qualify-edit` and `onboarding-qualify-view`.

### Components

- **`action_statuses`** — Action status enum (8 canonical statuses) merged with `vars.action_statuses_display` overrides. UI consumers only; the engine reads the canonical enum directly from the manifest via the `workflow-api` connection.
- **`workflow_lifecycle_stages`** — Workflow lifecycle stage enum (`active`, `completed`, `cancelled`) merged with `vars.workflow_lifecycle_stages_display` overrides.
- **`actions-on-entity`** — Entity-page widget surfacing every workflow attached to one entity with its action list. Takes `entity_id` + `entity_collection` vars. Each action row renders the server-resolved status, message, and single navigation link from the `get-entity-workflows` response.
- **`workflow-header`** — Per-workflow strip with title, lifecycle badge, summary counts, milestone label, workflow-overview link button. Used internally by `actions-on-entity` and `workflow-overview`.
- **`entity-workflows-refetch`** — Reusable action sequence (`CallAPI` `get-entity-workflows` → `SetState` `entity_workflows`) that any page mutating workflows on an entity can `_ref` into its event chain to refresh `actions-on-entity` without knowing the endpoint id or state key. Takes `entity_id` + `entity_collection` vars.
- **`workflows-events-timeline`** — Action-enriched events timeline panel backed by the `GetEventsTimeline` engine method: events for one entity with cross-stream live action cards (status, message, access-resolved link), verb-filtered and link-collapsed server-side. Drop into a sidebar tile:

  ```yaml
  - _ref:
      module: workflows
      component: workflows-events-timeline
      vars:
        reference_field: lead_ids
        reference_value:
          _state: lead_id
  ```

  Required vars: `reference_field` (the event-references key to match, e.g. `lead_ids`) and `reference_value`. Optional vars: `reverse`, `contact_page_url`, `disable_contact_link`, `compact`, `s3GetPolicyRequestId`. Event-type display comes from the events module's `event_types` export; action-card status display from this module's `action_statuses` component. This replaces the events module's former inline action-card lookup — the generic [events timeline](../events/README.md) is events-only; use this surface wherever action cards are wanted. See [Live action cards](../../docs/idioms.md#live-action-cards).

### API Endpoints

**Operational** (static):

| ID | Description |
|---|---|
| `start-workflow` | Instantiate a workflow on an entity; emits a `workflow-started` event. The optional `actions` payload override seeds actions at a declared status — `{ type, status }` grammar, legal seeds `action-required` \| `blocked` (signals are submit-time grammar only and don't apply at start). Optional `metadata` merges onto every seeded action doc; optional `parent_action_id` links the new workflow as a child of an existing tracker action |
| `cancel-workflow` | Push `cancelled` to workflow status; sweep remaining open actions to `not-required` (the internal `internal_cancel_action` signal); emits a `workflow-cancelled` event |
| `close-workflow` | User-initiated normal termination: push `completed`; sweep non-terminal actions honoring `required_after_close`; emits a `workflow-closed` event. Idempotent no-op on an already-completed workflow; rejected on a cancelled one |
| `get-entity-workflows` | Return workflows + grouped action cards for one entity via the `GetEntityWorkflows` engine method. Each card carries the server-resolved `allowed` bag (`{ view, edit, review, error }`), per-app `message`/`status`, and a single collapsed navigation `link`; actions with no visible verb are dropped. Consumed by `actions-on-entity` |
| `get-workflow-overview` | Return one workflow + ordered, verb-filtered, link-collapsed actions via the `GetWorkflowOverview` engine method, for the `workflow-overview` page |
| `get-action-group-overview` | Return one workflow + one action group's metadata + ordered, verb-filtered actions in that group via the `GetWorkflowActionGroupOverview` engine method |

**Per-action submit endpoints** (resolver-emitted by `makeWorkflowApis`):

- `{workflow_type}-{action_type}-submit` — one per `kind: form` or `kind: check` action (tracker actions emit none). Bakes the action's signal-keyed `hooks:` / `event:` maps in as build-time literals; routes the submitted payload through `SubmitWorkflowAction` on the `workflow-api` connection. The payload carries `action_id`, `signal`, `current_key`, `fields`, `form`, `form_review`, `comment`, and `metadata` — there is no `force` flag, no interaction key, and no client-supplied status: transition legality is resolved server-side by the FSM.
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
- **Server-resolved reads (Part 46).** All read-side rendering data is resolved server-side by five `WorkflowAPI` read methods — `GetEntityWorkflows`, `GetWorkflowOverview`, `GetWorkflowActionGroupOverview`, `GetWorkflowAction`, and `GetEventsTimeline` — which read the validated config off the `workflow-api` connection and collapse access (`allowed`), navigation (`link`), and button visibility (`buttons`) into plain values the client renders dumb. There is no client-side access or visibility computation, and no runtime `_module.var: workflows_config` reads — the config var feeds only the build-time resolvers (`makeWorkflowsConfig` / `validated_workflows_config`, `makeWorkflowApis`, `makeActionPages`).
- **Runtime dependencies.** Per-signal pre/post hooks are invoked by the engine. Navigation links are engine-derived from each action's `access:` verbs and emitted pages — authors don't write `link:` blocks. Group `on_complete` fan-out is the remaining unlanded engine piece (Part 11): declared `on_complete` routines are authored but inert until it ships.
- **Event types.** Every engine invocation emits exactly one timeline event: `action-{signal}` for submits, `workflow-started` / `workflow-cancelled` / `workflow-closed` for the lifecycle handlers, and `action-internal-mirror-{state}` per tracker-mirror level. Apps that subscribe to events (notifications, external syncs) should explicitly route or ignore the lifecycle and mirror types.
- **Transactions and atomicity.** On a replica set the engine commits each invocation's workflow + action writes in one transaction; on a standalone `mongod` it falls back to ordered writes guarded by the same compare-and-swap claim (the detected mode is logged at connection init). Event, notification, and change-log dispatches happen after the commit — a dispatch failure never rolls back a committed submit; it surfaces as a `post_commit_dispatch_failed` error after the invocation completes.
- **Concurrency.** Handlers are optimistic: a concurrent write to the same workflow between an invocation's load and commit throws a retryable `concurrent_submit` error with zero writes landed — the caller decides whether to retry (the engine doesn't auto-retry, since that would re-fire pre-hooks). Tracker-cascade levels are the one exception: they auto-retry internally (bounded), having no pre-hook.
- **Form data accumulation.** Each submission's form payload deep-merges onto the workflow's `form_data.{action}` namespace (objects merge; arrays, scalars, and `null` replace whole). Omitting a field leaves its prior value — clearing is explicit (`field: null`), never by omission.
- **Cross-cutting idioms.** See [`docs/idioms.md`](../../docs/idioms.md) anchors `#change-stamps`, `#event-display`, `#slots`, `#app-name`, `#secrets`.
