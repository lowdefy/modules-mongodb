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
entity_type: lead
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

- `type`, `entity_type`, `display_order` required.
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

Errors fail the app build with a path to the offending workflow / action.

The kind drives:

1. **Page generation**: form → per-action `edit` / `view` / `review` / `error` pages (per-verb gated by `access.{app_name}` verb list; `-error` always emitted); task → shared `task-edit` / `task-view` / `task-review`; tracker → no pages (inline display).
2. **Submit API surface**: form → `submit-action` with form payload; task → `submit-action` with user-selected `current_status`; tracker → no caller submission (engine writes via subscription).
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

| Verb     | Effect                                                                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view`   | Shows action in `actions-on-entity`; renders read-only detail pages (form `-view`, task `task-view`).                                                                                                                  |
| `edit`   | Renders submit form (form `-edit`, task `task-edit`). Implies `view`.                                                                                                                                                  |
| `review` | Renders a dedicated review page (form: per-action `-review`; task: shared `task-review`). Approve → `submit-action` with `current_status: done`; Request Changes → `current_status: changes-required`. Implies `view`. |

Apps without a key for a given app deployment hide the action entirely there. `makeActionPages` reads the host app's `app_name` and filters page emission accordingly (form actions only emit `-edit` when `edit` is listed, etc.). Vocabulary is module-defined and extensible in v1.x; unknown verbs are silently ignored.

### Role gate

`access.roles` controls **who** can interact, regardless of app. Empty/missing means no role gate. Non-empty means the user's roles must intersect this list.

Roles resolve from `_user: roles` — the user's effective roles for the current app, sourced from `apps.{app_name}.roles` on the `user_contacts` doc.

Check: `(access.roles is empty) OR (size(setIntersection(user.roles, access.roles)) > 0)`.

### Where checks run

- **Build-time** (`makeActionPages`): per-app verb filter on page emission.
- **Query-time** (`get-entity-workflows`): per-app verb filter + role gate. Both must pass for the action to appear.
- **Submit-time** (`submit-action`): role-gate re-check before any writes. Rejects with structured error on mismatch (e.g. role revoked between page render and submit).

`action_role_check` (ui sub-design) is a thin client-side wrapper over the same query-time check, used by entity pages to conditionally render verb buttons.

Composition is AND: per-app verb filter, then role gate. A user with `account-manager` role visiting from an app without an `access.<that-app>` key sees nothing — app-scoping is intentional.

## Universal action fields

Every action doc carries three optional fields, settable per-instance via the edit page:

| Field         | Type       | Default |
| ------------- | ---------- | ------- |
| `assignees`   | `string[]` | `[]`    |
| `due_date`    | `Date?`    | `null`  |
| `description` | `string?`  | `null`  |

Updates flow through `submit-action`'s `fields:` payload block. `null` clears, omitted leaves unchanged. Atomic with the status transition (same Mongo `$set`).

Reserved on `references` payloads — apps can't claim these field names.

## Form action

```yaml
type: qualify
kind: form
action_group: discovery
sort_order: 10
description: Confirm the lead's contact details and capture qualification notes.
submit_hook: workflow_config/onboarding/api/qualify-submit-hook.yaml # optional
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

If `submit_hook:` is set, the generated endpoint `_ref`s the hook. If absent, the generated endpoint is a thin default that calls `submit-action` with `current_status: done`.

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

No `submit_hook`. The shared `task-edit` page builds the `submit-action` payload directly: `{ action_id, current_type, current_status, fields, event: { type, metadata: { comment } } }`.

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
    entity_type: ticket
    entity_id: { _step: create_ticket.insertedId }
    entity_collection: tickets-collection
    parent_action_id: { _state: parent_action_id }
```

One `CallApi`; no follow-up `submit-action` to write the link.

### One-to-one constraint

Each child workflow has at most one `parent_action_id`; each tracker action has at most one `child_workflow_id`. Apps needing the same physical event to drive multiple parents either spawn separate child workflows per parent or read shared entity state independently.

`kind: form` / `kind: task` / `kind: tracker` are mutually exclusive.

### Recommended shape: paired trigger + tracker actions

A trigger form action creates the child entity and starts the child workflow with `parent_action_id` set; a separate tracker action mirrors the child's lifecycle. The module doesn't enforce this split but the README documents it as the recommended shape.

### Tracking simple entities

Tracker actions only track workflows — there is no entity-only mode. For entities whose lifecycle is a single status field, declare a minimal workflow with one `kind: task` action; the user marks it `done` (or app calls `cancel-workflow`) and the existing tracker subscription flips the parent. Per-app-type cost: one (workflow, action) YAML pair, reused per entity instance. See action-authoring/design.md "Tracking simple entities (minimal workflow shim)" for the worked example.

## Resolver pipeline

Five JS resolvers consume authored YAML at build time:

| Resolver                | Reads                                                   | Emits                                                                                                                                                                                                                    | Used in                                  |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `makeActionPages`       | `workflows_config`, `app_name`                          | Array of page YAML, one per (workflow_type, action_type, verb) for form actions only                                                                                                                                     | `module.lowdefy.yaml` `pages:`           |
| `makeWorkflowApis`      | `workflows_config`, `app_name`                          | Array of `Api` YAML, one per form action; skipped for task and tracker actions                                                                                                                                           | `module.lowdefy.yaml` `api:`             |
| `makeWorkflowsConfig`   | `workflows_config`                                      | Runtime config object consumed by the WorkflowAPI connection. Also the single place all build-time validation of `workflows_config` lives (workflow + action invariants — see "Action kinds" section for the full list). | `module.lowdefy.yaml` connection config  |
| `makeActionsForm`       | An action's `form` field + `components/fields/` library | Block tree for the form, with library components substituted by name                                                                                                                                                     | Called inside form-action page templates |
| `makeActionFormConfigs` | `workflows_config`                                      | Per-action form metadata map (validation, defaults, types)                                                                                                                                                               | `global.action_form_configs`             |

Resolvers live at `resolvers/{name}.js` in the module package and are invoked via `_ref: { resolver: ..., vars: { ... } }` from the appropriate location in `module.lowdefy.yaml`. Apps don't invoke any of them directly.

### `makeWorkflowApis` generated endpoint

One per form action. With `submit_hook` declared:

```yaml
- id: "{workflow_type}-{action_type}-submit"
  type: Api
  routine:
    _ref:
      path: "{action.submit_hook}"
```

Without `submit_hook`:

```yaml
- id: "{workflow_type}-{action_type}-submit"
  type: Api
  routine:
    - id: submit
      type: CallApi
      properties:
        endpointId:
          _module.endpointId: { id: submit-action, module: workflows }
        payload:
          action_id: { _payload: action_id }
          current_type: { _var: action_type }
    - :return:
        action_ids: { _step: submit.action_ids }
```

Task actions don't get a generated endpoint; the shared `task-edit` page calls `submit-action` directly. Tracker actions don't get an endpoint; the engine writes their status via the subscription.

## Form components library

Internal library at `components/fields/` in the module package. Apps reference components by `component:` name in `form:` blocks; the resolver substitutes the component's config (with author-supplied vars merged) into the page block tree at build time. Apps never `_ref` library entries directly.

### v1 components

| Component             | Purpose                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `text_input`          | Single-line text — wrapper over `TextInput`                            |
| `text_area`           | Multi-line text — wrapper over `TextArea`                              |
| `label`               | Read-only single-line label (with `viewOnly: true` for derived values) |
| `label_value`         | Read-only key-value pair display                                       |
| `date_range_selector` | Two-date picker for start + end                                        |
| `controlled_list`     | Dynamic list of sub-forms (fan-out scenarios)                          |

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
