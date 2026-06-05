# Task 4: README — `### Per-page chrome` subsection

## Context

`modules/workflows/README.md` has **no documentation of the per-page chrome slots today** — `pages.{verb}.title`, `requests`, `formHeader`, `formFooter`, the `buttons.{signal}.*` config knobs, and `events.{onMount,onSubmit}` are all undocumented. Part 36 takes on documenting the pre-existing slots alongside the new `buttons.extra`, since a `buttons.extra` doc would dangle without the surrounding slot reference.

The README's current structure under `## How to Use` ends with `### Worked example — a single form action` (line ~48). The new subsection is a sibling of that worked example.

This is deliberate scope inflation relative to "just document the new slot" — the design requires it and asks that the PR description call it out so it isn't reviewed as silent expansion.

## Task

Add a `### Per-page chrome` subsection to `modules/workflows/README.md` under `## How to Use`, after `### Worked example — a single form action`. Content:

1. **Intro**: form-action verb pages (`edit`, `view`, `review`, `error`) accept a per-verb `pages.{verb}:` block of chrome overrides; the templates ship sensible defaults when it's absent.
2. **Slot reference** (table or definition list) covering every `pages.{verb}.*` slot the shipped templates read:
   - `title` — page title override.
   - `requests` — additional page requests.
   - `formHeader` / `formFooter` — block lists rendered above/below the form card.
   - `events.onMount` / `events.onSubmit` — author action chains the template fires at the corresponding lifecycle points.
   - `buttons.{signal}.{title,disabled,visible,modal}` — config knobs on the template-shipped signal buttons, with the **approve modal** as the worked example. The `.modal.{title,content}` knob exists on `submit` / `not_required` (edit), `approve` (review), and `resolve_error` (error); `request_changes` carries `.visible` / `.disabled` only — its comment modal is mandatory and non-configurable.
   - `buttons.extra` — **new**: array of author-composed `Button` blocks appended to the floating bar after the signal buttons. Document the entry shape (`id`, `title`, `type`, optional `icon`, optional `visible`/`disabled` operators, `events.onClick` action array), that extras render left of the signal buttons (`row-reverse` bar), that reserved template-shipped button ids (`button_submit`, `button_progress`, `button_not_required`, `button_approve`, `button_request_changes`, `button_resolve_error`, `button_edit`) are rejected at build time on every verb page (global reservation), and that the slot is offered on `edit` / `review` / `error` only (not `view`).
3. **Button → modal pattern** (one paragraph): declare a `Modal` (or `ConfirmModal`) block inside `pages.{verb}.formFooter:` — modals overlay at render time, so declaration position is just a tidy home — and open it from the extra button's `onClick` via `CallMethod` `{ blockId: <modal_id>, method: toggleOpen }` for a `Modal` (`method: open` is `ConfirmModal`-only); the modal's `onOk` reads its inputs from `_state:` and typically calls an app API.
4. **Gating idioms** (brief): stage-gated `visible:` via `_array.includes` on `_state: action.status.0.stage`; role-gated `disabled:` via `_ne` on the verb-specific bool `_state: action_allowed.{verb}` (`action_allowed` is an object `{ view, edit, review, error }`) — both standard operators, no template support needed. Note extras get **no** implicit role gating — an ungated extra renders fully clickable for users without the verb role, and app endpoints called from extras must enforce their own server-side checks.

Include one compact YAML example — a trimmed version of the design's "YAML shape" (a `resend_reminder` modal-opener plus an `open_help` link button is ideal; shorten as needed).

Keep template/heading conventions consistent with the rest of the README (per-module README fixed template per CLAUDE.md).

## Acceptance Criteria

- The README documents all pre-existing chrome slots plus `buttons.extra` in one subsection, with anchors/structure consistent with the file's existing style.
- The reserved-id list in the README matches `RESERVED_BUTTON_IDS` in `makeWorkflowsConfig.js` (task 1).
- The modal pattern paragraph matches the shipped mechanics (no `modals:` slot, no inline `modal:` field on extras).
- PR description explicitly notes the four pre-existing slots are newly documented (scope inflation callout).

## Files

- `modules/workflows/README.md` — modify — add `### Per-page chrome` subsection under "How to Use".

## Notes

- If Part 39 hasn't landed yet, the signal-button names in the README (e.g. `buttons.submit`, the `progress` Save Draft button) describe the post-39 state this part is designed against — coordinate so the README isn't describing buttons the templates don't ship yet. If sequencing forces this task to land first, note the Part 39 dependency inline or hold this task until Part 39's template tasks merge.
