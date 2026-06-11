# Workflows Action Authoring — Spec

YAML surface for workflows and actions. Full rationale in [design.md](designs/workflows-module-concept/action-authoring/design.md); this file carries only the committed decisions.

## File layout (app side)

```
my-app/
  workflow_config/
    workflows.yaml                # array of _ref to workflow definitions
    {workflow-type}/
      {workflow-type}.yaml        # workflow definition
      {action-type}.yaml          # one per action
```

Hook routines live **inline** on the action YAML's `hooks:` block (and group `on_complete:` routines live inline on the workflow YAML's `action_groups[]`). The resolver emits the corresponding Lowdefy Apis at build time — authors do not write separate hook Api files.

## Workflow YAML

```yaml
type: onboarding
title: Onboarding
entity_collection: leads-collection
display_order: 1
action_groups:
  - id: phase-1
    title: Discovery
    on_complete:
      routine:
        - id: notify-ops
          type: CallApi
          # ...further steps...
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
| `not-required`     | 0        | Not Required (terminal for form kind — undone only out-of-band) |
| `error`            | 1        | Alert                                                           |
| `changes-required` | 2        | Changes Required                                                |
| `done`             | 3        | Done                                                            |
| `in-review`        | 4        | In Review                                                       |
| `in-progress`      | 5        | In Progress                                                     |
| `action-required`  | 6        | Action Required                                                 |
| `blocked`          | 7        | Blocked                                                         |

Each entry carries `priority`, `title`, `color`, `borderColor`, `titleColor`, optional `icon`. `priority` is **display-only** — it orders statuses in pickers and visualizations but no longer drives transition legality (transitions are signal-driven via the per-kind FSM; see [state-machine](../state-machine/design.md), engine "Signal-driven FSM transitions").

### Workflow lifecycle stages

`active`, `completed`, `cancelled`. Same display-field shape (no priority — workflow stages aren't FSM-driven; their transitions are `active → completed` / `active → cancelled`).

## Action kinds

Every action declares its kind via a required `kind:` field. `kind` is the **lifecycle-driver discriminator** for an action — it tells the engine what code path produces and transitions this action, and what UI surface (if any) the module emits for it. Workflow actions take one of the values below; a sixth value `kind: task` is reserved for adhoc todos owned by the future tasks module (those docs have `workflow_id: null` and are out of scope for workflow authoring — see [tasks-module-plan](../tasks-module-plan/design.md)).

| `kind:`   | Required companion block | Primary content                                                       |
| --------- | ------------------------ | --------------------------------------------------------------------- |
| `form`    | `form:` block            | Domain-specific form schema; rendered as the edit page's main content |
| `check`   | none                     | Universal fields + comment + signal buttons on shared workflow-action-edit page |
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
- `kind: tracker` requires `tracker:` block with `workflow_type`; optionally carries `start_link: { pageId: string, urlQuery?: object }` — allowed keys exactly `pageId` / `urlQuery`; in `urlQuery` the reserved keys `action_id` / `entity_id` are sentinel-only (if present, value must be exactly `true`); all other `urlQuery` keys must carry strings. Rejects if `form:` is also present.
- `kind: check` rejects both `form:` and `tracker:`.
- `kind: task` is rejected in workflow-config validation — that value is reserved for the future tasks module, whose docs are not authored via `workflows_config`.
- Any other `kind:` value rejects with "unknown action kind."
- `status_map` keys (if present) must be members of `action_statuses`; display config keyed by `app_name`.
- `action_group` (if present) must reference a declared `action_groups[].id` in the same workflow.
- `blocked_by` entries (if present) must resolve to either another `actions[].type` OR an `action_groups[].id` in the same workflow. Mixed lists valid; engine resolves by group-id-first precedence (action-groups spec).
- `access.<app_name>` entries (if present) must be arrays of valid verbs (`view`, `edit`, `review`; unknown verbs flagged at build time, silently ignored at runtime).
- Static `references:` blocks (if present) are checked for reserved-key collisions; runtime references go through the engine's merge-order silencing.
- `hooks.{signal}.{pre,post}` (if present) — keyed by the button-surfaced signal names (`submit`, `progress`, `not_required`, `resolve_error`, `approve`, `request_changes`). Each value must be an **object** carrying an inline `routine:` array (Lowdefy Api routine shape). String values (the legacy form referencing an external Api id) are rejected with a migration message. The resolver emits each hook as an **internal-only Api** (no HTTP entry point; callable only via `context.callApi` from the submit endpoint's routine) — it carries no `auth:` block of its own. There is no hook auth gate: the submit endpoint's access check is the sole gate for the interaction including its hooks ([Part 34 § D11](../../workflows-module/parts/_completed/34-action-access-model/design.md)).

Errors fail the app build with a path to the offending workflow / action.

The kind drives:

1. **Page generation**: form → per-action `edit` / `view` / `review` / `error` pages (per-verb gated by presence of the verb key in `access.{app_name}`; all four verbs are gated identically); check → shared `workflow-action-edit` / `workflow-action-view` / `workflow-action-review`; tracker → no pages (inline display).
2. **Submit API surface**: form → resolver-emitted `{workflow_type}-{action_type}-submit` endpoint (submit-pipeline) called with a `signal` value; check → same endpoint with the same nullary signal buttons (`submit`, `progress`, `not_required`, …) — no status selector, no `current_status` (state-machine "Check kind", review #6); tracker → no caller submission (engine writes via the `internal_mirror_child_*` subscription).
3. **Resolver invocation**: `makeActionsForm` and `makeActionFormConfigs` run only for form actions; `makeWorkflowApis` emits endpoints only for form and check actions.

## Access

Every action declares an `access:` block — **one canonical shape**: a map of `{app_name}` → verb → role-gate. No action-wide role list, no shorthand verb-list form. `notification_roles` lives at the action root, not under `access:`. Full model in [Part 34 — Action access model](../../workflows-module/parts/_completed/34-action-access-model/design.md).

```yaml
access:
  my-team-app:
    view: true                            # any my-team-app user
    edit: [account-manager, account-rep]  # role-gated
    review: [account-manager]             # narrower gate
  my-customer-app:
    view: [customer-lead]
notification_roles:                       # action root, not under access:
  - account-manager
```

### Per-app verb-gate map

`access.{app_name}` keys are verbs from the closed set `view` / `edit` / `review` / `error` (unknown verb keys hard-error at build); values are role gates:

| Gate value    | Meaning                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `true`        | No role gate — any user of this app passes.                                                           |
| `[role, ...]` | User's roles **for this app** (`_user.apps.{app_name}.roles`) must intersect the list (non-empty).   |

- **Missing app key** → no access in that app. **Missing verb key** → no access to that verb. Omission is the canonical "no access"; empty array `[]` is invalid (no `app-name: []` ceremony).
- **Verbs are independent** — granting one never grants another (`edit` does not imply `view`). Lint-warn (not hard-error) when `edit` / `review` / `error` is declared without `view`.
- **Roles are app-scoped by construction** — each gate reads only its own app's roles list, so role names never clash across apps.

Per-verb check for a present gate: `gate === true OR size(setIntersection(_user.apps.{app_name}.roles, gate)) > 0`.

### Where checks run

- **Build-time** (`makeActionPages`): emits a verb page iff the verb key is present in `access.{host_app_name}`. Presence-of-key only; role gates aren't evaluated at build time.
- **Query-time** (`get-entity-workflows`): evaluates each declared verb's gate against the caller's per-app roles and returns `visible_verbs: { view, edit, review, error }` (four bools, `false` for undeclared verbs) per action. All-false → action dropped from the response (preserves "no role intersection → invisible").
- **Submit-time** (the `SubmitWorkflowAction` handler): reads the interaction's accepted verbs (table below), passes when any listed verb's gate in `access.{current_app}` allows the caller's `_user.apps.{current_app}.roles`, rejects with a structured error naming the full accepted set on failure. Authoritative gate; the central `api.roles` glob over the submit endpoint id is the coarse outer fence ([Part 34 § D10–D11](../../workflows-module/parts/_completed/34-action-access-model/design.md)).

### Interaction → accepted verbs

| Interaction       | Accepted verbs (any)     |
| ----------------- | ------------------------ |
| `submit_edit`     | `edit`                   |
| `not_required`    | `edit`                   |
| `resolve_error`   | `error`                  |
| `approve`         | `review`                 |
| `request_changes` | `view`, `edit`, `review` |

`request_changes` passes on any of the three ([Part 49](../../workflows-module/parts/_completed/49-request-changes-verb-gate/design.md)): `review` gates judgement power (`approve`, review-page access); `request_changes` is flag-a-problem — anyone who can see or work on the action may raise it.

`view` has no interaction of its own — it's the read affordance only.

`action_role_check` (ui sub-design) mirrors the query-time check client-side, populating per-verb `_state.action_allowed: { view, edit, review, error }` for conditional rendering. Defence in depth; the server-side query/submit checks are the real gate.

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

| Field                  | Type      | Default | Effect                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required_after_close` | `boolean` | `false` | When `true`, the action remains submittable after the workflow lifecycle reaches `completed` (close path only). Default rejects. **Does not apply to `cancelled`** — cancel is the stronger termination signal (workflow aborted, not concluded) and audit/notes work is semantically meaningless on a cancelled workflow. Matches v0's `CloseWorkflowActions`-only filter posture. |

The `SubmitWorkflowAction` handler enforces this at submit time.

### Fields explicitly dropped from v1

- **`responsibility`** — display-only label, left to app-side UI.
- **`access.notification_roles`** — `notification_roles` is no longer nested under `access:`; it lives at the action root (Access section, D9).
- **action-wide `access.roles`** — gone. Every role gate is per-app per-verb (Access section); there is no global role list on an action.
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

- The `-error` page is gated identically to the other verbs: emitted iff the `error` verb key is present in the action's `access.{app_name}` map. Actions without `error` declared have no `-error` page in that app deployment; an author-driven `error` push (pre-hook / external) still lands on the action, but there's no reachable recovery surface for it in the UI. `pages.error` is purely a chrome-override slot (like `pages.edit`) — the template ships sensible defaults when it's absent.
- The error template ships with a stale-URL guard appended to `onMount`: if `status[0].stage !== 'error'` when the page loads, the template emits a `Link` back to `-view`.
- The error form schema defaults to the action's `form:` block. Apps that need a different recovery schema declare a `form_error:` block parallel to `form:` / `form_review:`; otherwise the submitter's form schema is reused.

### How an action enters `error`

`error` is purely **author-driven** ([engine § Action error transition](../engine/spec.md#action-error-transition), [Part 29 § D2](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#d2-why-pre-hooks-no-longer-get-a-hook_error-field)). Two entry paths (both form and check kind):

- **Pre-hook `error` signal.** A pre-hook (submit-pipeline Decision 4) fires `error` against *another* action via `actions: [{ type, signal: error }]`. The form/check FSM accepts `error` from every non-terminal state → `error`. This replaces the v0 `{ ..., status: 'error' }` return. There is no way to error the *current* action from its own pre-hook — to fail a submission, `:reject` / `throw`. Diagnostic context rides on the events-log entry via `event_overrides.metadata`.
- **External systems.** Backend microservices, scheduled lambdas, or other out-of-band writers push `error` directly. A follow-on injection API is deferred ([Part 29 § Out of scope](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#out-of-scope--deferred)).

Status entries are uniform `{ stage, created, event_id }` — there are no polymorphic `reason` / `error_message` / `error_metadata` fields. Engine sub-step failures **throw**, they do not write an `error` transition. Either path above makes the action's `status_map.error.{app_name}.link` (typically pointing at `{workflow_type}-{action_type}-error?action_id=<id>`) the reachable recovery surface. Recovery is the `resolve_error` signal (form FSM `error → resolve_error → in-review`).

## `form_review` — separate schema for review pages

Actions that declare the `review` verb (in any app's `access` map) may declare a second form block under `form_review:`:

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
hooks: # optional; per-signal pre/post routines (inline), keyed by button-surfaced signal
  submit:
    pre:
      routine:
        - id: validate
          type: MongoDBFindOne
          connectionId: leads-collection
          properties:
            filter: { _id: { _payload: action.references.lead_id } }
        # ...further steps...
access:
  my-team-app:
    view: true
    edit: [account-manager]
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

`makeWorkflowApis` always emits a `{workflow_type}-{action_type}-submit` endpoint for form / check actions; the action's `hooks:` and `event:` blocks are baked in as build-time literals. If the action declares no `hooks:`, the engine runs the default lifecycle (no pre/post extension points). See submit-pipeline Decisions 2 + 4 for the canonical endpoint shape and hook contract.

## Check action

```yaml
type: schedule-followup
kind: check
action_group: follow-up
sort_order: 30
description: Schedule a follow-up call with the lead within a week of qualification.
blocked_by: [send-quote]
access:
  my-team-app:
    view: true
    edit: [account-manager]
status_map:
  blocked:
    my-team-app: { message: Awaiting quote acceptance. }
  action-required:
    my-team-app:
      message: Schedule a follow-up call
      link:
        pageId:
          _module.pageId: { id: workflow-action-edit, module: workflows }
        urlQuery: { action_id: true }
  done:
    my-team-app: { message: Follow-up scheduled. }
```

No `hooks:` declared — engine runs the default lifecycle. The shared `workflow-action-edit` page calls `{workflow_type}-{action_type}-submit` with `signal: submit` (nullary — no status selector, no `current_status`; the FSM resolves `in-review` vs `done` from the action's `review` verb, exactly as for form actions), `fields:`, and a top-level `comment` field (the resolver-emitted API maps it to `event.metadata.comment`).

## Tracker action

```yaml
type: track-installation
kind: tracker
action_group: setup
sort_order: 40
description: Tracks the device-installation workflow on the linked installation ticket.
blocked_by: [schedule-followup]
access:
  my-team-app:
    view: true # everyone sees the row
    edit: [account-manager] # only AMs get the start link (Part 44)
tracker:
  workflow_type: device-installation
  start_link: # optional (Part 44) — navigation target before the child exists
    pageId: ticket-new
    urlQuery:
      action_id: true # → tracker action _id (parent_action_id for start-workflow)
      entity_id: true # → parent entity _id (prefill the child doc's parent ref)
      source: onboarding # static params pass through verbatim
status_map:
  blocked:
    my-team-app: { message: Awaiting follow-up scheduling. }
  action-required:
    my-team-app: { message: Create the installation ticket. }
  in-progress:
    my-team-app: { message: Installation in progress. }
  done:
    my-team-app: { message: Installation completed. }
```

The `tracker:` block carries the child `workflow_type` and, optionally, a `start_link`. The `status_map` is display copy per parent stage; the parent-stage mapping itself is hard-coded by the engine (`active → in-progress`, `completed → done`, `cancelled → not-required`).

`start_link: { pageId, urlQuery? }` declares the navigation target rendered while the tracker is `action-required` with no child started. It is emitted as the tracker's `edit`-verb link — role-gated at read time like every other link. Two reserved `urlQuery` sentinel keys: `action_id: true` → tracker action `_id`; `entity_id: true` → parent workflow's entity `_id`. All other `urlQuery` keys must carry strings (static params passed through verbatim). No other top-level keys besides `pageId` and `urlQuery` are allowed.

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

`kind: form` / `kind: check` / `kind: tracker` are mutually exclusive.

### Recommended shape: `start_link` vs paired trigger + tracker

Two shapes suit different situations (Part 44):

- **App page owns creation → `start_link`** — add `start_link` to the `tracker:` block. One tracker row links to the existing app page; no separate trigger action needed.
- **Inline form owns creation → paired trigger + tracker** — a trigger form action creates the child entity and starts the child workflow with `parent_action_id` set; a separate tracker action mirrors the child's lifecycle.

The module doesn't enforce either split. The README documents the choice: **app page owns creation → `start_link`; inline form owns creation → paired trigger + tracker.**

### Tracking simple entities

Tracker actions only track workflows — there is no entity-only mode. For entities whose lifecycle is a single status field, declare a minimal workflow with one `kind: check` action; the user marks it `done` (or app calls `cancel-workflow`) and the existing tracker subscription flips the parent. Per-app-type cost: one (workflow, action) YAML pair, reused per entity instance. See action-authoring/design.md "Tracking simple entities (minimal workflow shim)" for the worked example.

## Resolver pipeline

Five JS resolvers consume authored YAML at build time:

| Resolver                | Reads                                                   | Emits                                                                                                                                                                                                                                                      | Used in                                                                                                                      |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `makeActionPages`       | `workflows_config`, `app_name`                          | Array of page YAML, one per (workflow_type, action_type, verb) for form actions only                                                                                                                                                                       | `module.lowdefy.yaml` `pages:`                                                                                               |
| `makeWorkflowApis`      | `workflows_config`                                      | Array of `Api` YAML — one `{workflow_type}-{action_type}-submit` per form / check action (bakes in `hooks:` / `event_overrides:` blocks, both keyed by signal, as build-time literals); also emits the resolver-derived internal-only hook Apis (one per declared `hooks.{signal}.{pre | post}` routine) and group `on_complete` Apis; skipped for tracker actions | `module.lowdefy.yaml` `api:` |
| `makeWorkflowsConfig`   | `workflows_config`                                      | Runtime config object consumed by the WorkflowAPI connection. Also the single place all build-time validation of `workflows_config` lives (workflow + action invariants — see "Action kinds" section for the full list).                                   | `module.lowdefy.yaml` connection config                                                                                      |
| `makeActionsForm`       | An action's `form` field + `components/fields/` library | Block tree for the form, with library components substituted by name                                                                                                                                                                                       | Called inside form-action page templates                                                                                     |
| `makeActionFormConfigs` | `workflows_config`                                      | Per-action form metadata map (validation, defaults, types)                                                                                                                                                                                                 | `global.action_form_configs`                                                                                                 |

Resolvers live at `resolvers/{name}.js` in the module package and are invoked via `_ref: { resolver: ..., vars: { ... } }` from the appropriate location in `module.lowdefy.yaml`. Apps don't invoke any of them directly.

### `makeWorkflowApis` generated endpoint

One `{workflow_type}-{action_type}-submit` endpoint per form / check action. The routine is a single call to the `SubmitWorkflowAction` plugin handler with the action's `hooks:` and `event:` blocks baked in as build-time literals. Full shape in [submit-pipeline spec](../submit-pipeline/spec.md) "Per-action `{workflow_type}-{action_type}-submit` Api"; summarized here:

```yaml
- id: {workflow_type}-{action_type}-submit
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
        signal: { _payload: signal }
        current_key: { _payload: current_key }
        form: { _payload: form }
        form_review: { _payload: form_review }
        fields: { _payload: fields }
        # sparse — keys present only for the signals the action declares hooks/overrides for.
        # values are resolver-derived internal-only Api ids
        # ({workflow_type}-{action_type}-{signal}-{pre|post}), not author-supplied.
        hooks:
          submit: { pre: {workflow_type}-{action_type}-submit-pre }
        event_overrides: { submit: { type, display, references, metadata }, ... }
    - :return:
        action_ids: { _step: submit.action_ids }
        completed_groups: { _step: submit.completed_groups }
        event_id: { _step: submit.event_id }
        tracker_fired: { _step: submit.tracker_fired }
        pre_hook_response: { _step: submit.pre_hook_response }
        post_hook_response: { _step: submit.post_hook_response }
```

Tracker actions don't get a generated endpoint; the engine writes their status via the subscription. Hook Apis are resolver-emitted as **internal-only** Apis (no HTTP entry, no `auth:` block); the submit endpoint's access check is the sole gate. No hook auth synthesis, no separate validation pass. See submit-pipeline Decision 4 for the runtime hook invocation contract.

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
