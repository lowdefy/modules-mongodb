# Task A4: Re-layout the check page template

## Context

Addendum DA1/DA2/DA3/DA4, for the per-workflow check page
(`modules/workflows/templates/check.yaml.njk`, Task 8). Same revision as the form
templates (A3), with two check-specific differences that already hold in the shipped
design:

- The `entity_view.slot` is the **middle** review subject (not a `details_slot`), so
  the RHS is **History only** — `details_slot` is passed empty, and A1's shell renders
  no Details section.
- Header vars and universal-fields data source from **`_state.current_action.*`** (not
  `_state.action.*`), and the universal-fields `state_path` is `current_action.fields`
  (per the primary design's Part 24 reconciliation).

## Task

- **Header chips + edit modal (DA1):** pass `page_actions` from
  `universal-fields-chips.yaml` (A2) with `action_data` from
  `_state.current_action.*`, `show: action_config.universal_fields`, namespaced
  `modal_id`. Mount `universal-fields-modal.yaml` with `state_path:
current_action.fields`, `workflow_type` (the check page's runtime `_state` value, as
  the primary check design uses), `action_id: _state.current_action._id`,
  `allowed_edit` per the derived mode.
- **Description callout (DA2):** prepend `universal-fields-callout.yaml` to the shell's
  `middle` (above the review subject), reading `current_action.description`.
- **Action bar (DA3):** pass the signal buttons (Accept / Reopen / the derived-mode
  verbs) into the shell's flat `actions` slot via `floating-actions`. Check pages carry
  **no `buttons.extra`** (Part 36 scopes extras out of check), so the bar is signal
  verbs only — no grow spacer, no left group; they right-align under the bar's existing
  `justify: end`. No separate slot, no `floating-actions.yaml` change. No full-width sibling.
- **RHS (DA4):** pass `details_slot: []` (RHS = History only). The middle keeps the
  `entity_view.slot` review subject + comment input.

Keep the response-derived `SetState` mode derivation (primary D3), the
`_state.entity_id` normalization, and the comment/signal wiring unchanged.

## Acceptance Criteria

- The check page renders assignees + due chips + `✎` in the title bar (from
  `current_action.*`); `✎` opens the edit modal; Update calls
  `{workflow_type}-update-fields`.
- Description callout renders above the review subject when `current_action.description`
  is set, absent when null.
- Signal buttons render in the floating card inside the middle column; no full-width
  sibling.
- RHS is History only (no Details section); the entity review subject stays in the
  middle.
- Mode derivation, comment, and signals behave exactly as the shipped check page.
- `pnpm ldf:b` compiles; the demo `onboarding-check` page renders the new layout.

## Files

- `modules/workflows/templates/check.yaml.njk` — modify.

## Notes

- The in-context `check-action-modal` / `check-action-surface` are **separate
  components and untouched** (primary D6) — this task is the workspace check page only.
- No-jarring-shift: the title-bar chips, the left panel, and the RHS History stay put
  vs the form pages; only the middle (review subject vs form) and the absence of the
  RHS Details section differ.
