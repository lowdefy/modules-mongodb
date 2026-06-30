---
title: Authoring Grammar
module: workflows
type: reference
concepts:
  [
    authoring,
    actions,
    access,
    hooks,
    trackers,
    starting-actions,
    blocked-by,
    status-map,
  ]
---

# Workflows — Authoring grammar

Reference for the action YAML grammar. Schema source of truth: `resolvers/makeWorkflowsConfig.js` and `designs/workflows-module-concept/action-authoring/spec.md`.

## Workflow definition

```yaml
type: <slug> # required — unique workflow type name; "workflow" is reserved
entity: # required — the workflow's entity wiring
  connection_id: <slug> # required — Lowdefy connection id for the entity (e.g. leads-collection)
  ref_key: <key> # required — event-references key (e.g. lead_ids)
  page_id: <page> # required — host-app page id the back-link navigates to
  id_query_key: <key> # optional — URL query key for the entity id (default _id)
  title: <Label> # required — singular entity-kind label (e.g. Lead)
  data: # optional — inline routine ({ routine: [...] }, like a hook) returning entity data;
    routine: [...] #   reserved `name` key → breadcrumb instance name; other keys host-owned (replaces name_field)
entity_view: # optional — build-time, read-only UI hint; never part of the engine config
  slot: { ... } # a Lowdefy block ref rendering a read-only view of the entity
title: <string> # optional — human-readable title; derived from slug when omitted
starting_actions: # required — seed actions at workflow start
  - { type: <slug>, status: action-required | blocked }
action_groups: # optional — ordered group definitions
  - id: <slug>
    title: <string> # optional
    on_complete: # optional — routine fired when group reaches terminal status
      routine: [...]
actions: # required — action definitions
  - ...
```

## Action fields

### Core fields

| Field          | Required | Description                                                                                            |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `type`         | yes      | Action type slug — unique within the workflow                                                          |
| `kind`         | yes      | `form`, `check`, or `tracker`                                                                          |
| `title`        | no       | Human-readable title; derived from slug when omitted                                                   |
| `action_group` | no       | Group ID this action belongs to                                                                        |
| `description`  | no       | Authored markdown body shown to whoever works the action (see [Description](#description-description)) |
| `access`       | yes      | Per-app, per-verb role gate (see below)                                                                |

### Runtime-read fields (engine reads at runtime)

`type`, `title`, `kind`, `key`, `tracker`, `blocked_by`, `action_group`, `required_after_close`, `allow_not_required`, `access`, `status_map`

### Build-time-only fields (consumed by resolvers)

`form`, `hooks`, `event`, `pages`

## Action kinds

### `kind: form`

Emits per-verb pages (`-edit`, `-view`, `-review`, `-error`) and a submit endpoint per declared verb. Carries a `form:` block list rendered by the form-builder resolver.

```yaml
- type: qualify
  kind: form
  action_group: discovery
  access:
    my-app:
      view: true
      edit: [account-manager]
  form:
    - {
        key: contact_name,
        component: text_input,
        title: Contact name,
        required: true,
      }
    - { key: notes, component: text_area, title: Qualification notes }
  status_map:
    action-required:
      my-app: { message: Qualify the lead. }
    done:
      my-app: { message: Lead qualified. }
```

### `kind: check`

Served by the per-workflow `{workflow_type}-action` page (no per-action-type pages emitted). No `form:` block. Carries a comment field and the universal fields (`assignees`, `due_date`).

```yaml
- type: send-quote
  kind: check
  access:
    my-app:
      view: true
      edit: [account-manager]
```

### `kind: tracker`

Mirrors a child workflow's lifecycle. Never submitted by a user. Emits no pages.

```yaml
- type: track-company-setup
  kind: tracker
  tracker:
    child_workflow_type: company-setup
    start_link: # optional — navigation target before child exists
      pageId: company-new
      urlQuery:
        action_id: true # → tracker action _id
        entity_id: true # → parent workflow's entity _id
```

## Access (`access:`)

Per-app, per-verb map. Verbs: `view`, `edit`, `review`, `error`. Each gate is `true` (any authenticated user) or a non-empty `[roles]` list. Omit a verb to deny it.

```yaml
access:
  my-app:
    view: true
    edit: [account-manager]
    review: [sales-manager]
```

The presence of `review` on **any** app's access flips the `submit` signal to land `in-review` instead of `done` — this is action-global.

`notification_roles` lives at the action root, not under `access:`.

The action-wide `roles:` key and the `access.{app}: [verbs]` shorthand are rejected by the validator.

## Status copy (`status_map:`)

Per-stage display copy only. Shape: `{ message?, status_title? }` per app. No `link:` — the engine derives navigation from `access:` verbs and emitted pages; the validator rejects authored links on built-in kinds.

```yaml
status_map:
  action-required:
    my-app: { message: Qualify the lead. }
  done:
    my-app: { message: Lead qualified. }
```

## Description (`description:`)

Optional authored body shown to whoever works the action — the performer guidance for the action ("what to do here"). A single **markdown** string at the action root; omit it and the surface renders nothing.

```yaml
description: |
  Confirm the lead's contact details and **note any access constraints**
  before quoting. Reference: {{ key }}.
```

- **Markdown** — rendered by the built-in `Markdown` block as a **chrome-less lead-in** at the top of the action's content card (no callout, no eyebrow, no box of its own). Markdown over HTML because it is authored in YAML.
- **Templated, read-time** — supports `{{ var }}` nunjucks against the action instance (e.g. `{{ key }}` on an instanced action). Rendered fresh on every read, so it can never go stale. Autoescaping is on.
- **Authored once, read-only** — set in the action YAML; identical for every instance and not editable per instance. It is **not** `message` (the short per-stage `status_map` copy) and **not** a comment (the per-instance free-text channel); an action can have all three.
- **Which kinds render it** — `form` and `check`. Authoring it on `custom` (owns its working page) or `tracker` (no working surface) is harmless config but not rendered; no validator rejects it there.

## Starting actions (`starting_actions:`)

Seed grammar: `{ type, status }`. Legal seed statuses: `action-required` (immediately actionable) and `blocked` (waiting on something else). Any other status is rejected at build time and at `start-workflow` runtime.

List every standard action — every action that will exist unconditionally. Do not list conditional actions; conditional actions are spawned by pre-hooks with `upsert: true`.

```yaml
starting_actions:
  - { type: qualify, status: action-required }
  - { type: send-quote, status: blocked }
  - { type: schedule-followup, status: blocked }
```

## Blocked by (`blocked_by:`)

Action-level field. A list of action types or group IDs whose terminal status unblocks this action.

```yaml
blocked_by:
  - quoting # group id — unblocks when the group is done
```

**Never name a conditional action type in `blocked_by`.** If a conditional action is never spawned, the entry resolves as unsatisfied forever. Use a group ID instead — group status is derived from whatever member docs actually exist; a never-spawned conditional is simply not counted.

`blocked_by` on a group entry in `action_groups:` is ignored by the engine.

## Allow not required (`allow_not_required:`)

Action-root boolean, valid on `form` and `check` kinds. Default `false`. Opt in to the "Mark Not Required" button. Enforced server-side — the button is never shown and the `not_required` signal is rejected unless the flag is `true`.

```yaml
- type: qualify
  kind: form
  allow_not_required: true
  access: { ... }
```

## Titles

Actions, workflows, and action groups accept an optional `title:`. When omitted, the title is derived from the slug (`type`/`id`) by the title humanizer: splits on `-`/`_`/camelCase, applies Title Case, lowercases minor words mid-string, uppercases acronyms (base set: `PO ID URL API CRM SLA KPI VAT PDF CSV FAQ KYC RFQ`; extended by the `title_acronyms` var). Set `title:` only when the default is wrong.

## Hooks

To run custom logic around a transition, declare a hook keyed by signal. Each hook has optional `pre` and `post` phases.

```yaml
hooks:
  submit:
    pre: { routine: [...] }
  approve:
    post: { routine: [...] }
```

### Pre-hook `:return` shape

```yaml
:return:
  actions:
    - { type: <action_type>, signal: <name> }
    - { action_id: <id>, signal: <name> }
    - { type: <action_type>, key: <key>, signal: <name>, upsert: true }
    - {
        type: <action_type>,
        key: <key>,
        signal: <name>,
        upsert: true,
        fields: { ... },
        metadata: { ... },
      }
  form_overrides: { ... }
  event_overrides: { ... }
```

- All keys are optional.
- `actions[]` emits signals against **other** actions in the current workflow only.
- A pre-hook **cannot re-signal the current action** — where the action lands is fixed by the user-fired signal.
- `upsert: true` authorizes spawning a missing keyed target. Without it, a missing target throws.
- `fields` / `metadata` seed data onto the target (both spawned and existing targets).
- A pre-hook `:reject` aborts the submit before any engine write.
- Pre-hook writes are out-of-band and are not rolled back if the submit fails.

### Post-hook context

The post-hook payload `context` carries the committed workflow + action docs; `result` is `{ action_ids, completed_groups, event_id, tracker_fired }`. Post-hook failures do not roll back engine writes — post-hook routines must be idempotent.

### Signal keys for hooks

`submit`, `progress`, `not_required`, `resolve_error`, `approve`, `request_changes`

## Tracker `tracker:` block

| Field                 | Required | Description                                                     |
| --------------------- | -------- | --------------------------------------------------------------- |
| `child_workflow_type` | yes      | Child workflow type to mirror                                   |
| `start_link`          | no       | Navigation target before child exists — `{ pageId, urlQuery? }` |

### `start_link.urlQuery` reserved keys

| Key               | Resolves to                                |
| ----------------- | ------------------------------------------ |
| `action_id: true` | Tracker action `_id`                       |
| `entity_id: true` | Parent workflow's entity `_id`             |
| Any other key     | Passed through verbatim (must be a string) |

The `edit` verb gates the `start_link` — it appears only for apps that declare `edit` in the tracker's `access`.

## Page overrides (`pages:`)

Per-verb page customization. Supported verbs: `edit`, `view`, `review`, `error`.

```yaml
pages:
  edit:
    title: <string> # override page title
    buttons:
      submit:
        successMessage: <string> # override "Submitted successfully."
        visible: <bool | operator> # AND-combines with server boolean
      not_required:
        visible: <bool | operator>
      progress:
        visible: <bool | operator>
      request_changes: # view page only; default false
        visible: <bool | operator>
```

Button `visible` accepts a boolean or any Lowdefy operator expression. It AND-combines with the server-resolved boolean — authors can only further restrict visibility, never show a button the FSM or role gate would reject.

### Extra buttons (`buttons.extra`)

The `buttons.{signal}` knobs above tune the **template-shipped signal buttons** — the only buttons that drive the workflow engine. For an _additional_, app-specific button in the same floating-actions bar (e.g. "Resend Reminder", "Open Help", "Re-run Ingestion"), add a `buttons.extra:` array. Its entries render in the bar **after** the signal buttons (signals stay rightmost/primary; extras sit to their left), and each is concatenated into the bar verbatim.

`buttons.extra` is available on all four verb pages that render a bar — `edit`, `view`, `review`, `error`. It is **form-action only**: `check` and `tracker` actions emit no verb pages, so an `extra` slot on them is rejected at build time.

Each entry is a **full Lowdefy `Button` block** — `type: Button` with `title`/`type`/`icon` under `properties`, plus its own `events.onClick`:

```yaml
pages:
  edit:
    buttons:
      extra:
        - id: open_help # must be unique; reserved ids (below) are rejected
          type: Button
          properties:
            title: Help
            type: link # primary | default | link | danger
            icon: AiOutlineQuestionCircle # react-icons name (Ant Design set = Ai* prefix)
          visible: <bool | operator> # optional, author-controlled
          events:
            onClick:
              - id: nav_help
                type: Link
                params:
                  url: https://help.example.com
                  newTab: true
```

Extras carry no recognised `signal` and never touch the engine's FSM; their `onClick` is whatever Lowdefy chain the author wires (commonly `CallAPI` to an app endpoint, `CallMethod` to open a modal, or `Link` to navigate). Extras get **no implicit role gating** — gate them yourself with `visible:` / `disabled:` against the server-resolved `_state: action.allowed.{verb}` bool, and enforce server-side checks in any app endpoint they call.

**Reserved ids.** An extra entry's `id` may not collide with a template-shipped signal button. Reservation is global across all verb pages: `button_submit`, `button_progress`, `button_not_required`, `button_approve`, `button_request_changes`, `button_resolve_error`, `button_edit`.

**Button → modal pattern.** To collect input before a side-effect, declare a `Modal` block in the verb's `formFooter:` and open it from the extra button's `onClick` via `CallMethod` — `method: toggleOpen` for a `Modal`, `method: open` for a `ConfirmModal`. The modal overlays at render time regardless of where it's declared, so `formFooter` is just a tidy home; the modal's own `onOk` reads its inputs via `_state:` and calls the app API.

### Form header / footer slots (`formHeader`, `formFooter`)

Each verb page accepts two slots for arbitrary author blocks that render inside the content card, around the form: `formHeader` renders **above the form fields** (below the authored [`description`](#description-description) lead-in), and `formFooter` renders **below the comment field**. Both are **lists of full Lowdefy blocks** and default to `[]` (render nothing).

```yaml
pages:
  edit:
    formHeader:
      - id: po_guidance
        type: Alert
        properties:
          type: info
          showIcon: true
          message: Attach the counter-signed purchase order.
    formFooter:
      # A tidy home for a Modal opened from a buttons.extra button (above).
      - id: po_help_modal
        type: Modal
        properties:
          title: Purchase order requirements
        blocks:
          - id: po_help_body
            type: Markdown
            properties:
              content: A valid purchase order includes the PO number, an authorised signature, and the quoted total.
```

Both slots are available on all four verb pages (`edit`, `view`, `review`, `error`), set independently per verb. Like `buttons.extra`, they are **form-action only** — `check` and `tracker` actions emit no verb pages, so authoring them there is rejected at build time. Blocks render verbatim and carry no implicit gating — gate them yourself with `visible:` if needed.
