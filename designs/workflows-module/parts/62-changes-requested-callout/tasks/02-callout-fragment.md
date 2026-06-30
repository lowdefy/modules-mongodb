# Task 2: Author the changes-requested callout fragment

## Context

Part 62 renders the reviewer's `request_changes` comment as a read-only callout in the action workspace. Per decision D4 it is a **native Lowdefy `Alert`** with `type: warning` — the same block and shape as the `workflow_closed_banner` already in every template's bare-alerts slot. Using a native Alert (rather than custom-styled `Html`) gets HTML sanitization for free: the Alert renders `message`/`description` via `renderHtml` → `HtmlComponent` → `DOMPurify.sanitize`, which is what makes the verbatim-stored (unsanitized) comment HTML safe to render — no `| safe`, no `DangerousHtml`.

Per decision D2 the callout is authored **once** as its own component file and `_ref`'d into each template (avoiding 5-way drift across `view`/`edit`/`review`/`error`/`check`). This task creates that file only; Task 3 wires it in.

The existing sibling `components/action-description.yaml` (from Part 64) is the pattern to mirror — it takes its rendered content as an **operator-valued `content` var** so each surface binds its own state source, and self-hides when the content is null:

```yaml
id: action_description
type: Markdown
visible:
  _ne:
    - _var: content
    - null
properties:
  content:
    _var: content
```

## Task

Create `modules/workflows/components/changes-requested-callout.yaml`: a native `Alert` fragment that takes the changes-requested HTML as a `content` var, renders it as the Alert's `description`, and is visible only when `content` is non-null.

```yaml
# Changes-requested callout (Part 62).
#
# Renders the reviewer's request_changes comment as a read-only, full-width
# Alert in the middle column's bare-alerts slot — below the workflow_closed_banner
# (a hard stop outranks a rework brief) and above the Part-64 content card that
# holds the action-description render. Shown only while the action is in the
# `changes-required` stage AND a comment exists (the `content` var is non-null).
#
# Native Alert (type: warning) — same block + shape as workflow_closed_banner, so
# the workspace's full-width banners read consistently. The Alert sanitizes the
# comment HTML for free (renderHtml -> HtmlComponent -> DOMPurify.sanitize), which
# is what makes the verbatim-stored comment safe to render: NO `| safe`, NO
# DangerousHtml.
#
# Consumed via `_ref: { path, vars }` with an OPERATOR-valued var:
#   - content  the changes_requested HTML string from the GetWorkflowAction
#              envelope (or null) — `_state: action.changes_requested` on form
#              pages, `_state: current_action.changes_requested` on the check page.
id: changes_requested_callout
type: Alert
visible:
  _ne:
    - _var: content
    - null
properties:
  type: warning
  showIcon: true
  message: Changes requested
  description:
    _var: content
```

## Acceptance Criteria

- `modules/workflows/components/changes-requested-callout.yaml` exists as a native `Alert` (`type: warning`, `showIcon: true`).
- `message` is the static label "Changes requested"; `description` is bound to the operator-valued `content` var.
- `visible` is `content != null`.
- The fragment is data-source-agnostic (binds via the `content` var, not a hard-coded state path), matching `action-description.yaml`.
- `pnpm ldf:b` from `apps/demo` still compiles (the unused fragment must not break the build).

## Notes

- Do **not** add any bespoke chrome (no `color`/`borderColor`/`titleColor` from `actionsEnum`) — the design explicitly rejected status-colored chrome in favour of matching the existing `workflow_closed_banner` (D4, "Rejected — status-colored chrome").
- Block id `changes_requested_callout` is fine unscoped — only one renders per page.
