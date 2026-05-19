# Workflows Action Authoring — Spec

YAML surface for workflows and actions. Full rationale in [design.md](design.md); this file carries only the committed decisions.

## File layout (app side)

```
my-app/
  workflow_config/
    workflows.yaml                # array of _ref to workflow definitions
    {workflow-type}/
      {workflow-type}.yaml        # workflow definition
      {action-type}.yaml          # one per action
      api/
        {action-type}-submit-hook.yaml   # optional, form actions only
```

## Workflow YAML

```yaml
type: onboarding
title: Onboarding
entity_collection: leads-collection
display_order: 1
action_groups:
  - id: phase-1
    title: Discovery
    on_complete: workflow_config/onboarding/api/phase-1-complete.yaml
  - id: phase-2
    title: Quote
  - id: phase-3
    title: Installation
starting_actions:
  - { type: qualify, status: action-required }
  - { type: send-quote, status: blocked }
  - { type: schedule-followup, status: blocked }
  - { type: track-installation, status: blocked }
actions:
  - _ref: workflow_config/onboarding/qualify.yaml
  - _ref: workflow_config/onboarding/send-quote.yaml
  - _ref: workflow_config/onboarding/schedule-followup.yaml
  - _ref: workflow_config/onboarding/track-installation.yaml
```

`action_groups:` is the ordered group declaration; every action's `action_group` field references a declared `id`. `blocked_by:` entries may reference action types OR group IDs in one mixed list. Full semantics in [action-groups spec](../action-groups/spec.md).

## Status enum

The module ships `enums/action_statuses.yaml` (exposed as `global.action_statuses`) and `enums/workflow_lifecycle_stages.yaml` (exposed as `global.workflow_lifecycle_stages`). Status set is fixed; display attributes are app-overridable via `vars.action_statuses_display` and `vars.workflow_lifecycle_stages_display` (module-surface spec).

### Action statuses

| Key                | Priority | Default title                                                   |
| ------------------ | -------- | --------------------------------------------------------------- |
| `not-required`     | 0        | Not Required (universal terminal — only `force: true` moves it) |
| `error`            | 1        | Alert                                                           |
| `changes-required` | 2        | Changes Required                                                |
| `done`             | 3        | Done                                                            |
| `in-review`        | 4        | In Review                                                       |
| `in-progress`      | 5        | In Progress                                                     |
| `action-required`  | 6        | Action Required                                                 |
| `blocked`          | 7        | Blocked                                                         |

Each entry carries `priority`, `title`, `color`, `borderColor`, `titleColor`, optional `icon`.

### Workflow lifecycle stages

`active`, `completed`, `cancelled`. Same display-field shape (no priority — workflow stages don't follow the priority rule).

## Action kinds

Every action declares its kind via a required `kind:` field:

| `kind:`   | Required companion block | Primary content                                                       |
| --------- | ------------------------ | --------------------------------------------------------------------- |
| `form`    | `form:` block            | Domain-specific form schema; rendered as the edit page's main content |
| `task`    | none                     | Generic status selector + comment field on shared task-edit page      |
| `tracker` | `tracker:` block         | Display-only inline; mirrors a child workflow                         |

**Build-time validation** (in `makeWorkflowsConfig` — single place all workflow-config validation lives):

Per workflow:

- `type`, `entity_collection`, `display_order` required.
- `starting_actions` required; each entry `{ type, status }` resolves to one of the workflow's `actions[].type` values, with `status` a key in `action_statuses`.
- `actions` required, non-empty.
- Action `type` values within a workflow must be unique.
- `action_groups` optional (required if any action declares `action_group`). Each entry has unique `id`, `title`, optional `on_complete` path.
- No `action_groups[].id` may collide with any `actions[].type` in the same workflow.

Per action:

- `type`, `kind` required.
- `kind: form` requires non-empty `form:` block; rejects if `tracker:` is also present.
- `kind: tracker` requires `tracker:` block with `workflow_type`; rejects if `form:` is also present.
- `kind: task` rejects both `form:` and `tracker:`.
- Any other `kind:` value rejects with "unknown action kind."
- `status_map` keys (if present) must be members of `action_statuses`; display config keyed by `app_name`.
- `action_group` (if present) must reference a declared `action_groups[].id` in the same workflow.
- `blocked_by` entries (if present) must resolve to either another `actions[].type` OR an `action_groups[].id` in the same workflow. Mixed lists valid; engine resolves by group-id-first precedence (action-groups spec).
- `access.<app_name>` entries (if present) must be arrays of valid verbs (`view`, `edit`, `review`; unknown verbs flagged at build time, silently ignored at runtime).
- Static `references:` blocks (if present) are checked for reserved-key collisions; runtime references go through the engine's merge-order silencing.
- `hooks.{interaction}.{pre,post}` (if present) — each referenced hook API must declare `auth.roles ⊇ action.access.roles` and must not declare `auth.public: true`. See submit-pipeline "Hook auth gate." Fails the build with a path to the offending hook + action when the relationship doesn't hold.

Errors fail the app build with a path to the offending workflow / action.

The kind drives:

1. **Page generation**: form → per-action `edit` / `view` / `review` / `error` pages (per-verb gated by `access.{app_name}` verb list; all four verbs are gated identically); task → shared `task-edit` / `task-view` / `task-review`; tracker → no pages (inline display).
2. **Submit API surface**: form → resolver-emitted `update-action-{action_type}` endpoint (submit-pipeline) called with an `interaction` value; task → same endpoint with `interaction: submit_edit` and caller-supplied `current_status` (status selector on `task-edit`); tracker → no caller submission (engine writes via subscription).
3. **Resolver invocation**: `makeActionsForm` and `makeActionFormConfigs` run only for form actions; `makeWorkflowApis` emits endpoints only for form actions.

## Access

Two-part `access:` block on every action — verb maps per app deployment, plus a role gate that applies across apps.

```yaml
access:
  my-team-app: [view, edit, review]
  my-customer-app: [view]
  roles: [account-manager, ops-lead]
```

### Per-app verb maps

Keys are app deployment names (matching `vars.app_name` per module composition). Values are verb lists controlling UI affordances in that app:

| Verb     | Effect                                                                                                                                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view`   | Shows action in `actions-on-entity`; renders read-only detail pages (form `-view`, task `task-view`).                                                                                                                                                                                                                                 |
| `edit`   | Renders submit form (form `-edit`, task `task-edit`). Implies `view`.                                                                                                                                                                                                                                                                 |
| `review` | Renders a dedicated review page (form: per-action `-review`; task: shared `task-review`). Approve and Request Changes are template-shipped buttons calling `update-action-{action_type}` with `interaction: approve` and `interaction: request_changes`; engine resolves target status (`done` / `changes-required`). Implies `view`. |

Apps without a key for a given app deployment hide the action entirely there. `makeActionPages` reads the host app's `app_name` and filters page emission accordingly (form actions only emit `-edit` when `edit` is listed, etc.). Vocabulary is module-defined and extensible in v1.x; unknown verbs are silently ignored.

### Role gate

`access.roles` controls **who** can interact, regardless of app. Empty/missing means no role gate. Non-empty means the user's roles must intersect this list.

Roles resolve from `_user: roles` — the user's effective roles for the current app, sourced from `apps.{app_name}.roles` on the `user_contacts` doc.

Check: `(access.roles is empty) OR (size(setIntersection(user.roles, access.roles)) > 0)`.

### Where checks run

- **Build-time** (`makeActionPages`): per-app verb filter on page emission.
- **Query-time** (`get-entity-workflows`): per-app verb filter + role gate. Both must pass for the action to appear.
- **Submit-time** (the `SubmitWorkflowAction` handler): role-gate re-check before any writes. Rejects with structured error on mismatch (e.g. role revoked between page render and submit).

`action_role_check` (ui sub-design) is a thin client-side wrapper over the same query-time check, used by entity pages to conditionally render verb buttons.

Composition is AND: per-app verb filter, then role gate. A user with `account-manager` role visiting from an app without an `access.<that-app>` key sees nothing — app-scoping is intentional.

## Universal action fields

Every action doc carries three optional content fields, settable per-instance via the edit page:

| Field         | Type       | Default |
| ------------- | ---------- | ------- |
| `assignees`   | `string[]` | `[]`    |
| `due_date`    | `Date?`    | `null`  |
| `description` | `string?`  | `null`  |

Updates flow through the per-action endpoint's `fields:` payload block. `null` clears, omitted leaves unchanged. Atomic with the status transition (same Mongo `$set`).

Reserved on `references` payloads — apps can't claim these field names.

### Display-positioning fields

| Field          | Type     | Default | Effect                                                                                                            |
| -------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `action_group` | `string` | `null`  | Group ID; must reference a declared `action_groups[].id`. Drives entity-page grouping and group-status rollup.    |
| `sort_order`   | `number` | `null`  | Display order within an `action_group` (or workflow when no group). Lower comes first; ties broken by decl order. |

Engine treats these as opaque display metadata; UI consumes them.

### Terminal-behaviour field

| Field                  | Type      | Default | Effect                                                                                                                        |
| ---------------------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `required_after_close` | `boolean` | `false` | When `true`, the action remains submittable after the workflow lifecycle reaches `completed` or `cancelled`. Default rejects. |

The `SubmitWorkflowAction` handler enforces this at submit time.

### Fields explicitly dropped from v1

- **`responsibility`** — display-only label, left to app-side UI.
- **`access.notification_roles`** — moved to notifications config.
- **action-level `roles`** — only `access.roles` remains as the role gate.
- **`workflow.ticket_category`** — categorization lives on the entity if needed.

## `status_map` — per-status display copy + links

Every action declares a `status_map:` block keyed first by status, then by `app_name`. Each `{ status, app_name }` cell carries `message:` and optional `link:`:

```yaml
status_map:
  action-required:
    my-team-app:
      message: Provide initial details.
      link:
        pageId: my-team-app-initial-details-edit
        title: Initial Details
        urlQuery: { action_id: true }
    my-customer-app:
      message: Awaiting initial details.
  done:
    my-team-app:
      message: Initial details completed.
      link:
        pageId: my-team-app-initial-details-view
        title: View Initial Details
        urlQuery: { action_id: true }
```

**Templating.** `message` supports `{{ var }}` Nunjucks-style interpolation, rendered at read time against the action-instance context (action fields + the `key` value when the action is instanced). Status-map cells without `link:` render as static text in `actions-on-entity`; cells with `link:` render as clickable cards.

**Shape mirrors `event_display`.** Same nesting/merge family as the events module ([docs/idioms.md "Event display"](../../../../docs/idioms.md#event-display)); workflows nest as `status_map.{stage}.{app_name}`.

Tracker actions use `status_map` for display copy only; the engine hard-codes child-stage → parent-status mapping.

## Page event vocabulary

Per-page `events` use four fixed handler names. The module-emitted page template wires each to a matching button/lifecycle hook:

| Handler            | Pages that use it                 | Fires on              |
| ------------------ | --------------------------------- | --------------------- |
| `onMount`          | `edit`, `view`, `review`, `error` | Page load             |
| `onSubmit`         | `edit`, `error`                   | Submit click          |
| `onApprove`        | `review`                          | Approve click         |
| `onRequestChanges` | `review`                          | Request-changes click |

Per-page YAML:

```yaml
pages:
  edit:
    title: Capture Initial Details
    requests: [...]
    events:
      onMount: [...]
      onSubmit: [...]
    formHeader: [...]
    formFooter: [...]
  view:
    title: Initial Details
    events:
      onMount: [...]
  review:
    title: Review Initial Details
    events:
      onMount: [...]
      onApprove: [...]
      onRequestChanges: [...]
    modals:
      request_changes:
        client_change: false
  error:
    title: Recover Initial Details
    requests: [...]
    events:
      onMount: [...] # built-in redirect-to-view guard appended by template
      onSubmit: [...] # recovery submit routine
    formHeader: [...] # typically a failure-context banner
    formFooter: [...]
    buttons: # optional override of the default Submit button
      submit:
        title: Retry Submit
        modal:
          title: Confirm Resubmission
          content: This will re-attempt the submission. Continue?
```

- `requests:` — Lowdefy request refs the page loads.
- `formHeader:` / `formFooter:` — block lists slotted above/below the rendered form.
- `modals.{name}.{field}:` — config knobs on built-in module modals (review-page `request_changes` modal).
- `pages.error.buttons.submit:` — optional override of the default error-page primary button (title + optional confirm-modal config).

These fields ride into the generated page YAML via the page-emission resolver (ui sub-design).

### `error` page emission rules

- The `-error` page is gated identically to the other verbs: emitted iff `error` is in the action's `access.{app_name}` verb list. Actions without `error` in the list have no `-error` page in that app deployment; the engine's `error` transition still records context on the action doc, but there's no reachable recovery surface for it in the UI. `pages.error` is purely a chrome-override slot (like `pages.edit`) — the template ships sensible defaults when it's absent.
- The error template ships with a stale-URL guard appended to `onMount`: if `status[0].stage !== 'error'` when the page loads, the template emits a `Link` back to `-view`.
- The error form schema defaults to the action's `form:` block. Apps that need a different recovery schema declare a `form_error:` block parallel to `form:` / `form_review:`; otherwise the submitter's form schema is reused.

### How an action enters `error`

- Engine writes `{ stage: error, created, reason, error_message, error_metadata? }` to the action's status array when a submit hook or built-in side-effect step raises an unrecoverable failure mid-submit. All error context lives on this status entry — `form_data` is not touched on the error transition.
- A pre-hook (submit-pipeline Decision 4) returns `hook_error: <message>` to abort the submit for app-validated business-rule failures. Engine writes `{ stage: error, reason: 'pre-hook', error_message: <message>, error_metadata? }` to the action's status array.

Either path makes the action's `status_map.error.{app_name}.link` (typically pointing at `{workflow_type}-{action_type}-error?action_id=<id>`) the reachable recovery surface.

## `form_review` — separate schema for review pages

Actions whose access includes `review` may declare a second form block under `form_review:`:

```yaml
form:
  - { component: file_upload, key: form.installation_files, required: true }
form_review:
  - key: form.device_online
    component: yes_no_selector
    title: Is the device online?
    required: true
    validate:
      - {
          message: Device must be online.,
          status: error,
          pass: { _eq: [{ _state: form.device_online }, true] },
        }
```

Review page renders `form:` values read-only above and `form_review:` writable below. Storage: `form_data.{action_type}.{field}` on the workflow doc — the same flat tree as `form:` values, no `.review` sub-key (engine sub-design "Form data layout"). Authors pick non-colliding field names between `form:` and `form_review:`.

## Instanced actions (`key:`)

Actions with `key:` exist as N instances per workflow, one action doc per `(workflow_id, type, key)` triple:

```yaml
type: proof-of-installation
kind: form
key: $device_id # symbolic — concrete values supplied at spawn time
sort_order: 140
form:
  - { component: file_upload, key: form.installation_files, required: true }
status_map:
  action-required:
    my-team-app:
      message: Awaiting installation of device {{ physical_id }}.
```

**Identity.** With `key:`, action identity is `(workflow_id, type, key)`. Without, it's `(workflow_id, type)` (single instance).

**Form data path.** `form_data.{action_type}.{key}.{field}`.

**Spawning.** Two paths:

- **At workflow start.** `start-workflow` `actions:` may include `{ type, key, status }` entries; engine writes one action doc per entry.
- **Mid-workflow.** A pre-hook return's `actions[]` array (submit-pipeline Decision 4) can append `{ type, key, status, upsert: true }` to spawn new instances. Existing instances unaffected.

**`blocked_by` semantics.**

- Non-instanced action `blocked_by: [proof-of-installation]` unblocks when **all** instances reach a terminal status (`done` / `not-required`).
- Instanced ↔ instanced same-key references allowed.
- Instanced ↔ instanced cross-key references rejected at build (fan-in requires an explicit fan-in action).

**Constraints.**

- `key:` and `tracker:` mutually exclusive (tracker requires 1:1 cardinality).
- Author chooses `key:` for "another row of the same form per child" / tracker for "child has its own lifecycle."

## Form action

```yaml
type: qualify
kind: form
action_group: discovery
sort_order: 10
description: Confirm the lead's contact details and capture qualification notes.
hooks: # optional; per-interaction pre/post hook APIs (submit-pipeline Decision 4)
  submit_edit:
    pre: lead-onboarding-qualify-pre-submit
access:
  my-team-app: [view, edit]
  roles: [account-manager]
form:
  - { component: text_input, key: contact_name, required: true }
  - { component: text_area, key: notes }
status_map:
  action-required:
    my-team-app:
      message: Qualify the lead
      link:
        pageId:
          _module.pageId: { id: onboarding-qualify-edit, module: workflows }
        urlQuery: { action_id: true }
  done:
    my-team-app: { message: Lead qualified }
```

`makeWorkflowApis` always emits a `update-action-{action_type}` endpoint for form / task actions; the action's `hooks:`, `event:`, and `interactions:` blocks are baked in as build-time literals. If the action declares no `hooks:`, the engine runs the default lifecycle (no pre/post extension points). See submit-pipeline Decisions 2 + 4 for the canonical endpoint shape and hook contract.

## Task action

```yaml
type: schedule-followup
kind: task
action_group: follow-up
sort_order: 30
description: Schedule a follow-up call with the lead within a week of qualification.
blocked_by: [send-quote]
access:
  my-team-app: [view, edit]
  roles: [account-manager]
status_map:
  blocked:
    my-team-app: { message: Awaiting quote acceptance. }
  action-required:
    my-team-app:
      message: Schedule a follow-up call
      link:
        pageId:
          _module.pageId: { id: task-edit, module: workflows }
        urlQuery: { action_id: true }
  done:
    my-team-app: { message: Follow-up scheduled. }
```

No `hooks:` declared — engine runs the default lifecycle. The shared `task-edit` page calls `update-action-{action_type}` with `interaction: submit_edit`, `current_status: <user-selected>` (the page surfaces a status selector), `fields:`, and `event.metadata.comment`.

## Tracker action

```yaml
type: track-installation
kind: tracker
action_group: setup
sort_order: 40
description: Tracks the device-installation workflow on the linked installation ticket.
blocked_by: [schedule-followup]
access:
  my-team-app: [view] # display-only, no edit page
  roles: [account-manager]
tracker:
  workflow_type: device-installation
status_map:
  blocked:
    my-team-app: { message: Awaiting follow-up scheduling. }
  in-progress:
    my-team-app: { message: Installation in progress. }
  done:
    my-team-app: { message: Installation completed. }
```

The `tracker:` block carries one field — the child `workflow_type`. The status_map is display copy per parent stage; the parent-stage mapping itself is hard-coded by the engine (`active → in-progress`, `completed → done`, `cancelled → not-required`).

### Parent ↔ child link at runtime

Bidirectional link established by `start-workflow`:

- Tracker action: `child_workflow_id` + `child_entity_id` + `child_entity_collection`. All null until linked.
- Child workflow doc: `parent_action_id` + `parent_entity_id` + `parent_entity_collection`. Null for top-level workflows.

App code that creates the child entity calls `start-workflow` with `parent_action_id` set. The engine writes both sides in one server-side handler — child workflow doc with back-references, child's N starting action docs, parent tracker's `child_workflow_id` (the new workflow's `_id`) / `child_entity_id` / `child_entity_collection` + `in-progress` transition.

```yaml
# Trigger action's submit hook:
- id: create_ticket
  type: MongoDBInsertOne
  connectionId: tickets-collection
  properties: { ... }

- id: start_child_workflow
  type: CallApi
  endpointId:
    _module.endpointId: { id: start-workflow, module: workflows }
  payload:
    workflow_type: device-installation
    entity_id: { _step: create_ticket.insertedId }
    entity_collection: tickets-collection
    parent_action_id: { _state: parent_action_id }
```

One `CallApi`; no follow-up submit to write the link.

### One-to-one constraint

Each child workflow has at most one `parent_action_id`; each tracker action has at most one `child_workflow_id`. Apps needing the same physical event to drive multiple parents either spawn separate child workflows per parent or read shared entity state independently.

`kind: form` / `kind: task` / `kind: tracker` are mutually exclusive.

### Recommended shape: paired trigger + tracker actions

A trigger form action creates the child entity and starts the child workflow with `parent_action_id` set; a separate tracker action mirrors the child's lifecycle. The module doesn't enforce this split but the README documents it as the recommended shape.

### Tracking simple entities

Tracker actions only track workflows — there is no entity-only mode. For entities whose lifecycle is a single status field, declare a minimal workflow with one `kind: task` action; the user marks it `done` (or app calls `cancel-workflow`) and the existing tracker subscription flips the parent. Per-app-type cost: one (workflow, action) YAML pair, reused per entity instance. See action-authoring/design.md "Tracking simple entities (minimal workflow shim)" for the worked example.

## Resolver pipeline

Five JS resolvers consume authored YAML at build time:

| Resolver                | Reads                                                   | Emits                                                                                                                                                                                                                                         | Used in                                  |
| ----------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `makeActionPages`       | `workflows_config`, `app_name`                          | Array of page YAML, one per (workflow_type, action_type, verb) for form actions only                                                                                                                                                          | `module.lowdefy.yaml` `pages:`           |
| `makeWorkflowApis`      | `workflows_config`, `app_name`                          | Array of `Api` YAML — one `update-action-{action_type}` per form / task action (bakes in `hooks:` / `event:` / `interactions:` blocks as build-time literals; validates `hook.auth.roles ⊇ action.access.roles`); skipped for tracker actions | `module.lowdefy.yaml` `api:`             |
| `makeWorkflowsConfig`   | `workflows_config`                                      | Runtime config object consumed by the WorkflowAPI connection. Also the single place all build-time validation of `workflows_config` lives (workflow + action invariants — see "Action kinds" section for the full list).                      | `module.lowdefy.yaml` connection config  |
| `makeActionsForm`       | An action's `form` field + `components/fields/` library | Block tree for the form, with library components substituted by name                                                                                                                                                                          | Called inside form-action page templates |
| `makeActionFormConfigs` | `workflows_config`                                      | Per-action form metadata map (validation, defaults, types)                                                                                                                                                                                    | `global.action_form_configs`             |

Resolvers live at `resolvers/{name}.js` in the module package and are invoked via `_ref: { resolver: ..., vars: { ... } }` from the appropriate location in `module.lowdefy.yaml`. Apps don't invoke any of them directly.

### `makeWorkflowApis` generated endpoint

One `update-action-{action_type}` endpoint per form / task action. The routine is a single call to the `SubmitWorkflowAction` plugin handler with the action's `hooks:`, `event:`, and `interactions:` blocks baked in as build-time literals. Full shape in [submit-pipeline spec](../submit-pipeline/spec.md) "Per-action `update-action-{action_type}` Api"; summarized here:

```yaml
- id: update-action-{action_type}
  type: Api
  routine:
    - id: submit
      type: SubmitWorkflowAction
      connectionId:
        _module.connectionId: workflow-api
      properties:
        action_id: { _payload: action_id }
        action_type: <action_type>
        workflow_type: <workflow_type>
        interaction: { _payload: interaction }
        current_key: { _payload: current_key }
        form: { _payload: form }
        form_review: { _payload: form_review }
        fields: { _payload: fields }
        hooks:
          {
            submit_edit: { pre, post },
            not_required: { pre, post },
            resolve_error: { pre, post },
            approve: { pre, post },
            request_changes: { pre, post },
          }
        event_overrides: { submit_edit: { type, display, metadata }, ... }
        interactions: { submit_edit: { status: <override-or-null> }, ... }
    - :return:
        action_ids: { _step: submit.action_ids }
        completed_groups: { _step: submit.completed_groups }
        event_id: { _step: submit.event_id }
        tracker_fired: { _step: submit.tracker_fired }
        pre_hook_response: { _step: submit.pre_hook_response }
        post_hook_response: { _step: submit.post_hook_response }
```

Tracker actions don't get a generated endpoint; the engine writes their status via the subscription. Build-time validation: `hook.auth.roles ⊇ action.access.roles` (and `hook.auth.public !== true`) for every hook API referenced from `hooks.{interaction}.{pre,post}` — see submit-pipeline Decision 4.

## Form components library

Internal library at `components/fields/` in the module package. Apps reference components by `component:` name in `form:` blocks; the resolver substitutes the component's config (with author-supplied vars merged) into the page block tree at build time. Apps never `_ref` library entries directly.

### v1 components (27 total — full v0 parity)

| Category  | Component             | Purpose                       |
| --------- | --------------------- | ----------------------------- |
| Text      | `text_input`          | Single-line text              |
|           | `text_area`           | Multi-line text               |
|           | `tiptap_input`        | Rich-text editor              |
| Numeric   | `number`              | Numeric input                 |
| Date      | `date_selector`       | Single date picker            |
|           | `date_range_selector` | Start + end date picker       |
| Choice    | `selector`            | Single-select dropdown        |
|           | `multiple_selector`   | Multi-select dropdown         |
|           | `radio_selector`      | Radio group                   |
|           | `checkbox_selector`   | Multi-select checkbox group   |
|           | `button_selector`     | Button-group selector         |
|           | `checkbox_switch`     | Toggle switch                 |
|           | `yes_no_selector`     | Yes/no toggle                 |
|           | `enum_selector`       | Selector sourced from an enum |
| Files     | `file_upload`         | S3 put via policy             |
|           | `file_download`       | File-list S3 get via policy   |
| Location  | `location`            | Address + coordinates         |
| Display   | `label`               | Read-only label               |
|           | `label_value`         | Key-value pair                |
|           | `title`               | Section header                |
|           | `section_title`       | Sub-section header            |
|           | `alert`               | Alert banner                  |
|           | `html`                | Raw HTML                      |
| Structure | `box`                 | Conditional/grouped container |
|           | `section`             | Grouped section with title    |
|           | `controlled_list`     | Dynamic list of sub-forms     |
| Actions   | `button`              | Inline button                 |

### Component file shape

Each component is a YAML file with `vars` (author-facing parameter schema) and `config` (the block-tree fragment to emit):

```yaml
# components/fields/controlled_list.yaml
vars:
  key: { type: string, required: true }
  title: { type: string, required: false }
  required: { type: boolean, default: false }
  hideAddButton: { type: boolean, default: false }
  hideRemoveButton: { type: boolean, default: false }
  form: { type: array, required: true }

config:
  id: { _var: key }
  type: ControlledList
  required: { _var: required }
  properties:
    title: { _var: title }
    hideAddButton: { _var: hideAddButton }
    hideRemoveButton: { _var: hideRemoveButton }
  blocks:
    _var: form
```

### Authoring example

```yaml
form:
  - component: controlled_list
    key: form.devices
    title: Devices
    required: true
    hideAddButton: true
    form:
      - component: label_value
        key: form.devices.$._id
        title: Honeycomb Number
      - component: date_range_selector
        key: form.devices.$.warranty
        title: Warranty
        required: true
```

### Override + extension

Apps that need a domain-specific component ship it as a regular Lowdefy custom component in their plugin and reference it in `form:` blocks via `component: <plugin-name>:device_selector`. The resolver passes through any `component:` name it doesn't recognize as a library component, so app custom components compose alongside library components naturally.

## Open question

**`makeActionsForm` recursion across module boundaries.** The resolver recursively invokes itself to build nested form sections (e.g. `controlled_list` whose rows carry their own sub-form). Lowdefy's `_ref: { resolver }` from inside a Nunjucks template inside a module is unverified. Before relying on recursion, run a minimal spike: a template inside a module that calls `_ref: { resolver: <relative-path> }` and confirms the resolver runs and the path resolves. If it fails, the form builder becomes a flat (non-recursive) emitter; apps that need nested form sections supply a per-action template override.
