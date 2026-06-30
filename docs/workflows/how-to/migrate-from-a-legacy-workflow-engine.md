---
title: Migrate from a Legacy Workflow Engine
module: workflows
type: how-to
concepts:
  [
    migration,
    signals,
    blocked-by,
    hooks,
    access,
    notifications,
    legacy,
    update-workflow-actions,
  ]
---

# Migrate from a legacy workflow engine

**Goal:** Move an app off a hand-rolled, app-embedded workflow engine (workflow YAML under `apps/shared/workflow_config/`, status transitions written by hand in API routines, pages authored per action) onto the `workflows` module.

**Audience:** Teams that built their own action-list engine — a `workflows.yaml` registry, per-action config with a `status_map`, submit/approve API endpoints that call an `UpdateWorkflowActions` step to set the next status, hand-written `edit`/`view`/`review`/`error` pages, and notification fan-out wired into each routine. If that describes your app, this guide maps every legacy concept onto its module equivalent.

> This is a translation guide, not a code-mod. There is no automated converter — the model differences (especially explicit status writes → signals) require a human pass per workflow. Migrate one workflow end-to-end, verify it, then do the rest.

> **Legacy implementations vary.** The "legacy engine" is a family, not a single spec — across real apps the shapes differ: some start from a category field on the host entity (`ticket_category`, `non_conformance_category`), others seed `starting_actions` and are started programmatically; some carry an `entity:` block (with `key` / `collection` / `redirect_page` / `requests`), others have none; `responsibility` values are app-defined (`client`/`team`/`technician`, `author`/`lead`/`process-owner`, `sales-rep`, …); instanced actions, `shared: true`, and `force: true` appear in some apps and not others. Treat every app-specific field below as **"if your engine has it."** The constants that hold everywhere are the ones that matter most: `action:`-defined actions, a `status_map`, and submit/approve routines that set the next status by hand via `UpdateWorkflowActions`.

## The one shift that drives everything

The legacy engine is **imperative about status**: a submit endpoint runs a routine that explicitly writes `{ type: current-action, status: done }` and `{ type: next-action, status: action-required }` via `UpdateWorkflowActions`. Every transition — including unblocking the next step — is code you wrote.

The module is **declarative**: you fire a **signal** (`submit`, `approve`, …) and the engine resolves the landing status from a per-kind finite-state machine. You never write target statuses. Dependencies are declared once with `blocked_by:`, and the engine fires `unblock` automatically whenever those dependencies become terminal.

```yaml
# LEGACY — submit endpoint routine sets statuses explicitly
- id: update_actions
  type: UpdateWorkflowActions
  connectionId: workflow-api
  properties:
    currentActionId: { _payload: action_id }
    actions:
      - { type: initial-details, status: done }
      - { type: site-check, status: action-required } # hand-wired unblock
```

```yaml
# MODULE — the submit button fires the `submit` signal; the engine lands the
# current action and auto-unblocks dependents declared with blocked_by.
# site-check.yaml:
type: site-check
kind: form
blocked_by: [initial-details] # ← the only thing you declare
```

Internalize this before doing anything else: see [Signals vs status](../concepts/signals-vs-status.md) and [FSM and signals](../reference/fsm-and-signals.md). Most of the migration is **deleting** transition code, not rewriting it.

## Field-and-concept mapping at a glance

| Legacy                                                         | Module                                                                                            | Notes                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `workflows.yaml` registry                                      | `workflows_config` module var (one entry per type)                                                | One YAML, passed as a var; validated at build by `makeWorkflowsConfig`                          |
| workflow `type` / `title`                                      | `type` / `title`                                                                                  | Unchanged                                                                                       |
| category-field auto-start (`ticket_category`, `non_conformance_category`)  | **App-wired** call to the `{type}-start` endpoint                                     | No built-in category trigger — see [How workflows start](#how-workflows-start)                  |
| programmatic / `starting_actions`-seeded start (non-ticket workflows)      | call to the `{type}-start` endpoint                                                   | Near 1:1 — this is already how the module starts every workflow                                 |
| `entity` block (`key` / `collection` / `redirect_page` / `requests`) — _if present_ | `entity.{ connection_id, ref_key, page_id, title, … }`                       | `collection`→`connection_id`, `{key}_ids`→`ref_key`, `redirect_page`→`page_id`; `requests` dropped. Some legacy workflows omit `entity` entirely — see [grammar](../reference/authoring-grammar.md) |
| action-definition field `action:`                             | action `type:`                                                                                    | Renamed on the definition. Legacy _references_ (`starting_actions`, `UpdateWorkflowActions`) already use `type:` — they carry over |
| _(implicit — every action was a form)_                         | `kind:` **(required)**: `form` \| `check` \| `custom` \| `tracker`                                | New required field; see [Action kinds](../concepts/action-kinds.md)                             |
| `sort_order`                                                   | _(removed)_                                                                                        | Order = `action_groups` + `actions` array order; workflow order via `display_order`             |
| `shared: true` _(prp-style apps)_                              | _(removed)_                                                                                        | Multi-app reuse handled by listing multiple apps under `access:`                                |
| `responsibility: <app-defined>`                                | _(removed)_                                                                                        | Values are app-specific. Replaced by per-app `access:` (who may act) + check-action `assignees` (who should) |
| `access: { app: [view, edit, review] }`                        | `access: { app: { view: true, edit: [roles], review: [roles] } }`                                 | Per-verb map; array shorthand is now rejected — see [Access](../concepts/access.md)             |
| `roles:` / `access.roles`                                      | folded into per-verb gates                                                                        | Action-wide `roles:` is rejected by the validator                                               |
| `notification_roles`                                           | `notification_roles` (action root)                                                                | Kept; now drives engine auto-dispatch                                                           |
| `status_map.{stage}.{app}.message`                             | `status_map.{stage}.{app}.message`                                                                | Kept                                                                                            |
| `status_map.{stage}.status_title`                              | `status_map.{stage}.status_title`                                                                  | Kept                                                                                            |
| `status_map.{stage}.{app}.link`                                | _(removed for built-in kinds)_                                                                    | Engine derives navigation; authored links rejected except on `kind: custom`                     |
| `form` / `form_review` / `form_error`                          | `form` / `form_review` _(no `form_error`)_                                                          | Error recovery reuses the edit form on the `-error` page                                        |
| `viewOnly: true` on a field                                    | _(removed)_                                                                                        | The `-view` page is auto-generated read-only                                                    |
| hand-written `pages: { edit, view, review, error }`            | _(generated)_ + `pages.{verb}` overrides                                                            | You stop authoring pages; tune via overrides — see [Pages](#pages-and-events-stop-writing-them) |
| `buttons.additional`                                           | `pages.{verb}.buttons.extra`                                                                       | App-specific buttons; signal buttons are auto-shipped                                           |
| `UpdateWorkflowActions` (explicit status)                      | `blocked_by:` (auto-unblock) + pre-hook `:return.actions` with `signal:`                            | The core rewrite                                                                                |
| `status: not-required` + `force: true`                         | signals `not_required` / `activate`                                                                | No `force:`; see [Signals vs status](../concepts/signals-vs-status.md)                          |
| `upsert: true` + `additional_fields` + `metadata` + `key`      | pre-hook `:return` entry `{ upsert: true, fields, metadata, key }`                                  | `additional_fields` → `fields`                                                                  |
| `_array.map` over devices → N actions                          | instanced actions (`key:`) seeded at start or via pre-hook `upsert`                                | See [Instanced actions](#instanced-actions-per-device-per-line)                                 |
| child-ticket map + manual status mirroring                     | `kind: tracker` + `child_workflow_type` + `start_link`                                            | See [Child workflows → trackers](#child-workflows--tracker-actions)                             |
| manual `MongoDBInsertOne` into `events` per routine            | _(automatic)_ engine log event + `event:` overrides                                                | Delete the manual event writes                                                                  |
| `create_notifications.yaml` in each routine                    | _(automatic)_ engine dispatch to `send-notification`                                              | Delete the manual notification wiring                                                           |

## Step-by-step: migrate one workflow

### 1. Add the module and create the config var

Replace the `workflows.yaml` registry with the module entry in `lowdefy.yaml` and a single `workflows_config`:

```yaml
# lowdefy.yaml
modules:
  - id: workflows
    source: "github:lowdefy/modules-mongodb/modules/workflows@v0.6.0"
    vars:
      workflows_config:
        _ref: workflow_config/workflows.yaml
      app_name:
        _ref: { path: app_config.yaml, key: app_name }
```

The module wires its dependencies (`layout`, `events`, `notifications`, `contacts`, `user-account`) automatically. Add the required indexes from [Indexes](../reference/indexes.md) and the `actions` validator constraint — the engine relies on them.

### 2. Convert the workflow definition

Legacy root file → module workflow entry. The module **always** needs an explicit `entity:` block, and it has a different shape than legacy: it wants the entity's Lowdefy **connection**, the event-**references key**, and the back-link **page**. Where your legacy workflow stands today varies:

- **It has an `entity:` block** (e.g. `{ key, collection, redirect_page, requests }`) — map field-by-field: `collection`→`connection_id`, the `{key}_ids` references key→`ref_key`, `redirect_page`→`page_id`. The injected `requests` list has no equivalent (the module fetches workflow data itself).
- **It has no `entity:` block** (entity wiring was implicit — e.g. a ticket/`*_category` workflow that hard-coded `ticket_ids`) — you author the block fresh, pointing `connection_id` at the host entity's collection and `ref_key` at the references key its events already use.

A category-triggered ticket workflow with no legacy `entity:` block — author one fresh:

```yaml
# LEGACY device-installation.yaml
type: device-installation
title: Device Installation
ticket_category: device_technician_new_installation
starting_actions:
  - { type: initial-details, status: action-required }
  - { type: site-check, status: blocked }
actions:
  - _ref: ./initial-details.yaml
  - _ref: ../devices/devices-upload-quote.yaml
```

```yaml
# MODULE
type: device-installation
title: Device Installation
entity:
  connection_id: tickets-collection # Lowdefy connection for the entity
  ref_key: ticket_ids # event-references key (was the entity_key → {key}_ids)
  page_id: ticket-view # back-link target (was entity.redirect_page)
  title: Ticket # singular entity label for breadcrumbs
action_groups:
  - { id: devices-admin, title: Admin }
  - { id: technician-progress, title: Technician }
starting_actions:
  - { type: initial-details, status: action-required }
  - { type: site-check, status: blocked }
actions:
  - _ref: ./initial-details.yaml
  - _ref: ../devices/devices-upload-quote.yaml
```

A non-ticket workflow (e.g. a billing run) whose legacy entity was already explicit maps field-for-field — note `entity.requests` has no module equivalent (the engine fetches workflow data itself; a read-only entity view is an optional `entity_view.slot`):

```yaml
# LEGACY finance-billing-run.yaml
type: finance-billing-run
title: Finance Billing Run
entity:
  key: billing_run # request-id stem (get_billing_run) and the {key}_ids field
  collection: billing_runs # the entity's Mongo collection
  redirect_page: billing-run-view
  requests:
    - _ref: ../shared/workflow_utils/requests/get_billing_run.yaml
```

```yaml
# MODULE finance-billing-run.yaml
type: finance-billing-run
title: Finance Billing Run
entity:
  connection_id: billing-runs-collection # was entity.collection (Lowdefy connection id)
  ref_key: billing_run_ids # the {key}_ids field becomes the event-references key
  page_id: billing-run-view # was redirect_page
  title: Billing Run
# entity.requests is dropped — the module fetches workflow data via
# get-entity-workflows; add entity_view.slot if you want a read-only entity panel.
```

`action_groups` is now a first-class, ordered list with derived status and an optional `on_complete` routine — see [Groups and blocking](../concepts/groups-and-blocking.md). Legacy `action_group` strings on each action must reference a declared group id.

### 3. Convert each action

Per action: rename `action:`→`type:`, add the required `kind:`, drop `sort_order`/`shared`/`responsibility`, rewrite `access:` to the per-verb shape, and **add `blocked_by:` to replace the hand-wired unblock**.

```yaml
# LEGACY allocation.yaml
action: allocation
action_group: technician-progress
sort_order: 60
responsibility: team
access:
  team-app: [view, edit]
  roles: [device-manager, device-team]
status_map:
  action-required:
    team-app:
      message: Allocate devices.
      link: { pageId: device-installation-allocation-edit, urlQuery: { action_id: true } }
  done:
    status_title: Device Allocation Complete
    team-app: { message: Devices allocated. }
form:
  - { key: form.devices, component: multiple_selector, title: Devices, required: true }
  - { key: form.clocking_number_list, component: file_upload, title: Clocking list, required: true }
```

```yaml
# MODULE allocation.yaml
type: allocation
kind: form
action_group: technician-progress
blocked_by: [site-check] # replaces the routine that set allocation → action-required
access:
  team-app:
    view: true
    edit: [device-manager, device-team]
status_map:
  action-required:
    team-app: { message: Allocate devices. } # no link — engine derives it
  done:
    status_title: Device Allocation Complete
    team-app: { message: Devices allocated. }
form:
  - { key: form.devices, component: multiple_selector, title: Devices, required: true }
  - { key: form.clocking_number_list, component: file_upload, title: Clocking list, required: true }
```

**Choosing `kind:`** — see [Action kinds](../concepts/action-kinds.md):

- Captures domain data via a form → `kind: form` (keep your `form:` block).
- "Did this happen?" with no domain form (just assignee/due-date/comment) → `kind: check`. Many legacy actions whose form was a single yes/no or note collapse to a check.
- The working UI is a page your app already owns (a domain editor, a wizard) → `kind: custom` (you author the `status_map…link`, the only kind that still does).
- Mirrors another workflow on another entity → `kind: tracker`.

### 4. Replace transition routines with `blocked_by` and hooks

This is where most legacy code disappears. Categorize each `UpdateWorkflowActions` entry your old submit/approve endpoints wrote:

| Legacy routine did…                                            | Module replacement                                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `{ current-action, status: done }`                             | _Nothing_ — the `submit` signal lands the current action automatically              |
| `{ next-action, status: action-required }` (static unblock)    | `blocked_by: [current-action]` (or a group id) on the next action                   |
| `{ some-action, status: action-required, force: true }`        | pre-hook returns `{ type: some-action, signal: activate }`                          |
| `{ some-action, status: not-required }`                        | pre-hook returns `{ type: some-action, signal: not_required }`                      |
| conditional unblock inside `_if`                               | pre-hook `:return.actions` built with `_if` (see [Conditional actions](../how-to/conditional-actions.md)) |
| side effects (update entity doc, regenerate a PDF, etc.)       | a `hooks.{signal}.pre` or `.post` routine                                           |

A legacy conditional unblock:

```yaml
# LEGACY — inside the submit endpoint routine
actions:
  _array.concat:
    - _if:
        test: { _payload: form.site_setup_required }
        then: [{ type: site-setup-check, status: action-required, upsert: true }]
        else: []
    - - { type: initial-details, status: done }
```

becomes a pre-hook on the action:

```yaml
# MODULE initial-details.yaml
hooks:
  submit:
    pre:
      routine:
        - :return:
            actions:
              _if:
                test: { _eq: [{ _payload: form.site_setup_required }, true] }
                then: [{ type: site-setup-check, signal: activate, upsert: true }]
                else: []
```

Note `signal:` not `status:`, and that a pre-hook **cannot re-signal the current action** — `initial-details` lands per the user-fired `submit`. See [Write a hook](../how-to/write-a-hook.md) and the `:return` shape in [Authoring grammar](../reference/authoring-grammar.md).

> **`blocked_by` and conditional actions.** Never name a hook-spawned (conditional) action in another action's `blocked_by` — if it's never spawned, the dependent stays blocked forever. Depend on its **group id** instead. See [Groups and blocking](../concepts/groups-and-blocking.md).

### 5. Review, not-required, and error paths

- **Review.** Legacy: a submit routine set `in-review`, and a hand-written review page called an `approve` endpoint. Module: declare the `review:` verb in `access:` — its mere presence flips `submit` to land `in-review`, and the engine ships `approve`/`request_changes` buttons. Keep your `form_review:` fields. Full steps: [Add a review step](../how-to/add-a-review-step.md).
- **Not required.** Legacy: an `onNotRequired` handler + a `not-required` write. Module: set `allow_not_required: true` on the action; the `not_required` button and signal are auto-wired and server-gated.
- **Error.** Legacy: a separate `form_error` array + error page. Module: declare the `error:` verb; the `-error` page reuses the edit form and ships the `resolve_error` button (`error → in-review`). There is no separate `form_error`.

### 6. Delete the pages, events, notification, and event-log wiring

#### Pages and events — stop writing them

The legacy `pages: { edit, view, review, error }` blocks — with their `requests`, `onMount`/`onSubmit`/`onApprove` events, and `buttons` — are **generated** by `makeActionPages` from `kind` + `form` + `access`. Delete them. Form actions get a `-edit`/`-view`/`-review`/`-error` page set (only for declared verbs); check/custom actions are served by the shared `{workflow_type}-action` page. See [Action pages](../concepts/action-pages.md).

What you keep, as `pages.{verb}` overrides only:

```yaml
pages:
  edit:
    title: Allocate Devices # override the generated title
    buttons:
      submit: { successMessage: Devices allocated. }
      extra: # was buttons.additional — app-specific, non-signal buttons
        - id: regenerate_work_order
          type: Button
          properties: { title: Regenerate work order }
          events:
            onClick:
              - { id: regen, type: CallApi, params: { endpointId: regenerate-work-order } }
```

Button `visible` overrides can only **further restrict** the server-resolved gate. A legacy submit-confirmation `modal:` becomes the [button → modal pattern](../reference/authoring-grammar.md#extra-buttons-buttonsextra) (a `Modal` in `formFooter` opened from an extra button).

#### Notifications — delete the per-routine fan-out

Legacy routines ended with an `_ref` to a notifications routine (commonly `create_notifications.yaml`) that posted to an external notifications service (an HTTP/Lambda consumer with per-recipient templates). The engine now dispatches to the notifications module's `send-notification` API **automatically** after every committed transition. You provide:

- `notification_roles` on the action (recipients — kept from legacy).
- The app's notifications `send_routine` var, which reads the event and decides channels.

Delete the per-action notification wiring; keep `notification_roles`. See [Events](../concepts/events.md#notifications-dispatch).

#### Event log — delete the manual writes

Legacy routines wrote a `MongoDBInsertOne` into the log-events collection (`type`, the entity references key — `ticket_ids` / `deal_ids` / …, `action_ids`, `source_action_id`). The engine emits a log event on **every** transition, deriving `references` from `entity.ref_key`. Delete the manual writes. To customize the event `type`/`title`/`metadata`, use the action-root `event:` block keyed by signal — see [Events](../concepts/events.md#overriding-event-metadata). (The event body/`description` is owned by the action comment; you can't author it.)

### 7. Form components

The `form:` schema is largely source-compatible — the same `key`/`component`/`title`/`required`/`visible`/`validate`/`on_change` shape, and most component names carry over (`text_input`, `text_area`, `number`, `tiptap_input`, `date_selector`, `date_range_selector`, `selector`, `multiple_selector`, `radio_selector`, `checkbox_selector`, `button_selector`, `yes_no_selector`, `enum_selector`, `checkbox_switch`, `file_upload`, `file_download`, `location`, `controlled_list`, `section`, `box`, `label`, `label_value`, `title`, `section_title`, `alert`, `html`). See [Form components](../reference/form-components.md).

Watch for:

- **Contact fields.** Legacy `contact_selector_number_required` → `contact` / `multiple_contact` (wrap the contacts module's selector).
- **Domain selectors with no library entry** (e.g. legacy `device_type_selector`, `org_units_selector`). There is no plugin-block `component:` namespace — either contribute a library field component or drop a raw Lowdefy block inline in the `form:` array (the [custom-components escape hatch](../reference/form-components.md#custom-components)).
- **Universal fields.** `assignees`, `due_date`, `description` are rendered by the page chrome — do **not** put them in `form:`.
- **`viewOnly`** is gone; the read-only `-view` page is generated.

### 8. Instanced actions (per-device, per-line)

If your engine spawns N actions of one type per item — by mapping over an array (`_array.map … _function`), or by emitting `upsert: true` entries with a generated `key` (e.g. `key: { _uuid: true }`) plus `additional_fields` / `metadata` — the module models this as **instanced actions** keyed by `key:` (legacy `additional_fields` → module `fields`; `metadata` → `metadata`):

```yaml
# proof-of-installation.yaml
type: proof-of-installation
kind: form
key: $device_id # symbolic placeholder; resolved per instance at spawn
status_map:
  action-required:
    team-app: { message: "Awaiting installation of device {{ physical_id }}." }
```

Spawn instances either in the `start-workflow` payload's `actions:` list, or from a pre-hook returning `{ type: proof-of-installation, key: <id>, signal: activate, upsert: true, fields: {…}, metadata: { physical_id: … } }` (legacy `additional_fields` → `fields`). Form data lands at `form_data.{type}.{key}.{field}` (note the extra `key` segment). A `blocked_by` on an instanced type is satisfied only when **all** instances are terminal. See [Instanced actions](../how-to/instanced-actions.md).

### 9. Child workflows → tracker actions

Legacy spawned a child ticket and tracked it via a parent→child id map, mirroring status by hand. The module provides `kind: tracker`:

```yaml
type: track-site-setup
kind: tracker
tracker:
  child_workflow_type: site-setup
  start_link: # navigation before the child exists
    pageId: ticket-new
    urlQuery: { action_id: true, entity_id: true }
```

The child's `{child-type}-start` endpoint, called with `parent_action_id`, links both sides in one call; the engine then mirrors `active→in-progress`, `completed→done`, `cancelled→not-required` automatically. See [Track a child workflow](../how-to/track-a-child-workflow.md).

### 10. Reports and dashboards

Status dashboards that read the `actions` collection still work — the collection and its statuses persist. Two upgrades worth adopting:

- The workflow doc now carries denormalized `groups: [{ id, status, summary }]` and an overall `summary`, so phase-level dashboards can read the workflow doc directly instead of aggregating actions.
- For per-entity and per-group reads, prefer the static APIs `get-entity-workflows`, `get-workflow-overview`, and `get-action-group-overview` over bespoke aggregations.

## How workflows start

Legacy apps start workflows in **two** ways, and they migrate differently:

1. **Category-field auto-start.** A workflow started automatically when the host entity was created with — or changed to — a workflow-enabled category. The field is domain-named: `ticket_category`, `non_conformance_category`, and so on.
2. **Programmatic / seeded start.** No category trigger — app code passed an `entity` and `workflowType` to the engine (or the workflow simply seeded its `starting_actions` for an already-existing entity).

The module keeps only the second model: starting is always an explicit call to the type-scoped `{type}-start` endpoint (which invokes the engine's `StartWorkflow`). **There is no built-in category trigger.**

```yaml
# App-side: start a workflow on its entity
- id: start_workflow
  type: CallApi
  endpointId:
    _module.endpointId: { id: device-installation-start, module: workflows }
  payload:
    entity: { id: { _step: insert_ticket.insertedId } }
```

**So:**

- **Already-programmatic workflows are a near 1:1 port** — swap your old engine call for the `{type}-start` `CallApi`.
- **Category-triggered workflows need new app-side wiring** to replace the implicit trigger: an event/handler on the host entity's create/update that maps the category to the right `{type}-start` endpoint.

This is a deliberate behavior change — starting is now uniformly app-owned, so every entity starts a workflow the same way, with no special category-field plumbing.

## Things that no longer exist (and why)

- **`sort_order`** — ordering is the declaration order of `action_groups` and `actions`; workflow ordering is `display_order`. No per-action integer to maintain.
- **`shared: true`** — one action YAML serves every app that appears in its `access:` map; multi-app reuse is the [access model](../concepts/access.md), not a flag.
- **`responsibility`** — replaced by `access:` (authorization) plus check-action `assignees` (the soft "who should do this"). Reporting by responsible party becomes reporting by assignee or by access role.
- **`force: true`** — the FSM allows the backward/re-open moves legacy needed `force` for (`done → changes-required`, re-`submit` from `done`, `activate` from anywhere). Fire the signal; the table decides. See [Signals vs status](../concepts/signals-vs-status.md).
- **Hand-written status targets** — there is no consumer surface to set a status directly. If you find yourself wanting one, you want a signal.
- **Authored `status_map…link` (built-in kinds)** — navigation is derived from `access:` verbs and generated pages. Only `kind: custom` keeps an authored link.

## Behavior changes to verify after migrating

- **`not-required` is terminal** for form/check actions (no outgoing transitions). If your legacy flow re-opened "not required" actions, model the recovery as a separate action or an out-of-band admin write.
- **Re-firing a signal is safe** — `unblock` only fires from `blocked`, so re-evaluating `blocked_by` never drags a started action back. Lean on this instead of guarding re-entry by hand.
- **The `review` flip is action-global** — if *any* app declares `review`, *every* app's `submit` lands `in-review`. There's no per-caller review.
- **Pre-hook writes are out-of-band** — a pre-hook's spawns/signals are not rolled back if the submit later fails; post-hooks must be idempotent. See [Hooks](../concepts/hooks.md).

## Verify

Run `pnpm ldf:b` from `apps/demo` (or your app) to confirm the config compiles — `makeWorkflowsConfig` validates the whole `workflows_config` at build time and rejects the legacy shapes (array-shorthand `access`, action-wide `roles:`, authored links on built-in kinds, illegal seed statuses). Work through the build errors; each one points at a legacy idiom that needs the module form.

## See also

- [Mental model](../concepts/mental-model.md) — the three building blocks and what the module ships
- [Signals vs status](../concepts/signals-vs-status.md) — the model shift, in depth
- [FSM and signals](../reference/fsm-and-signals.md) — the signal inventory and per-kind tables
- [Authoring grammar](../reference/authoring-grammar.md) — every field of the new action YAML
- [Access](../concepts/access.md) · [Groups and blocking](../concepts/groups-and-blocking.md) · [Hooks](../concepts/hooks.md) · [Events](../concepts/events.md)
- [Conditional actions](conditional-actions.md) · [Instanced actions](instanced-actions.md) · [Track a child workflow](track-a-child-workflow.md) · [Add a review step](add-a-review-step.md)
