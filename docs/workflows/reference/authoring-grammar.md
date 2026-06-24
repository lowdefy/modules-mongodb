---
title: Authoring Grammar
module: workflows
type: reference
concepts: [authoring, actions, access, hooks, trackers, starting-actions, blocked-by, status-map]
---

# Workflows — Authoring grammar

Reference for the action YAML grammar. Schema source of truth: `resolvers/makeWorkflowsConfig.js` and `designs/workflows-module-concept/action-authoring/spec.md`.

## Workflow definition

```yaml
type: <slug>                  # required — unique workflow type name; "workflow" is reserved
entity_collection: <slug>     # required — MongoDB collection name for the workflow's entities
entity_ref_key: <key>         # required — event-references key for the entity (e.g. lead_ids)
title: <string>               # optional — human-readable title; derived from slug when omitted
starting_actions:             # required — seed actions at workflow start
  - { type: <slug>, status: action-required | blocked }
action_groups:                # optional — ordered group definitions
  - id: <slug>
    title: <string>           # optional
    on_complete:              # optional — routine fired when group reaches terminal status
      routine: [ ... ]
actions:                      # required — action definitions
  - ...
```

## Action fields

### Core fields

| Field | Required | Description |
|---|---|---|
| `type` | yes | Action type slug — unique within the workflow |
| `kind` | yes | `form`, `check`, or `tracker` |
| `title` | no | Human-readable title; derived from slug when omitted |
| `action_group` | no | Group ID this action belongs to |
| `access` | yes | Per-app, per-verb role gate (see below) |

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
    - { key: contact_name, component: text_input, title: Contact name, required: true }
    - { key: notes, component: text_area, title: Qualification notes }
  status_map:
    action-required:
      my-app: { message: Qualify the lead. }
    done:
      my-app: { message: Lead qualified. }
```

### `kind: check`

Uses the shared `workflow-action-*` pages (no per-action pages emitted). No `form:` block. Carries a comment field and the universal fields (`assignees`, `due_date`, `description`).

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
    workflow_type: company-setup
    start_link:                         # optional — navigation target before child exists
      pageId: company-new
      urlQuery:
        action_id: true                 # → tracker action _id
        entity_id: true                 # → parent workflow's entity _id
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
  - quoting  # group id — unblocks when the group is done
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
    pre: { routine: [ ... ] }
  approve:
    post: { routine: [ ... ] }
```

### Pre-hook `:return` shape

```yaml
:return:
  actions:
    - { type: <action_type>, signal: <name> }
    - { action_id: <id>, signal: <name> }
    - { type: <action_type>, key: <key>, signal: <name>, upsert: true }
    - { type: <action_type>, key: <key>, signal: <name>, upsert: true, fields: { ... }, metadata: { ... } }
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

| Field | Required | Description |
|---|---|---|
| `workflow_type` | yes | Child workflow type to mirror |
| `start_link` | no | Navigation target before child exists — `{ pageId, urlQuery? }` |

### `start_link.urlQuery` reserved keys

| Key | Resolves to |
|---|---|
| `action_id: true` | Tracker action `_id` |
| `entity_id: true` | Parent workflow's entity `_id` |
| Any other key | Passed through verbatim (must be a string) |

The `edit` verb gates the `start_link` — it appears only for apps that declare `edit` in the tracker's `access`.

## Page overrides (`pages:`)

Per-verb page customization. Supported verbs: `edit`, `view`, `review`, `error`.

```yaml
pages:
  edit:
    title: <string>                     # override page title
    buttons:
      submit:
        successMessage: <string>        # override "Submitted successfully."
        visible: <bool | operator>      # AND-combines with server boolean
      not_required:
        visible: <bool | operator>
      progress:
        visible: <bool | operator>
      request_changes:                  # view page only; default false
        visible: <bool | operator>
```

Button `visible` accepts a boolean or any Lowdefy operator expression. It AND-combines with the server-resolved boolean — authors can only further restrict visibility, never show a button the FSM or role gate would reject.
