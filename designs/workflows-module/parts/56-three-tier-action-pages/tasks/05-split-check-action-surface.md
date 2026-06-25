# Task 5: Split the check-action surface into shared leaf components

## Context

`modules/workflows/components/check-action-surface.yaml` is today "one body, two
containers" (Part 40 D1): a single `Card` that the in-context
`check-action-modal.yaml` **and** the three retired shared pages all `_ref`. It
stacks, in one card: a workflow-closed banner, the action header (title + status
Tag), the Part 24 universal-fields component, a view-mode status-history `List`,
an optional comment `TiptapInput`, the right-aligned signal-button bar, and the
review-mode Request Changes modal.

Part 56 (D6) keeps the modal's all-in-one body **unchanged**, but the new
workspace check page (Task 8) needs to spread the **same leaves** across three
columns — `entity_view.slot` + comment + signal buttons in the middle,
universal-fields in the RHS, History below. So the surface must **split into
reusable leaf compositions** that both the modal body and the workspace page
compose, guaranteeing the two can't drift.

## Task

Extract the surface's reusable leaves into separate component files under
`modules/workflows/components/` (e.g. a `check-surface/` subdirectory), each
`_ref`-able with the vars it needs. At minimum, extract:

- **Signal-button bar** — the right-aligned `Box` of mode-gated, server-boolean
  signal buttons (`button_edit`, `button_progress`, `button_not_required`,
  `button_submit`, `button_request_changes`, `button_approve`,
  `button_resolve_error`) plus the Request Changes modal they open. Preserve
  every `visible`/`disabled`/payload expression and the `on_complete` var
  threading verbatim.
- **Comment input** — the optional `current_action.comment` `TiptapInput` with
  its mode/stage `visible` gate.
- **Status-history list** — the `status_history_card` `List` (view-mode only),
  including the prunable-state behaviour documented in the surface header.
- **Mode derivation** — keep the canonical derivation expression in one place
  reusable by the modal's open handler and the check page's `SetState` (it is the
  exact `check-action-modal.yaml:98–146` ladder). If YAML can't share an operator
  tree cleanly, document the single canonical copy and have both reference the
  same `_ref` fragment.

Then:

- **Recompose `check-action-surface.yaml` (the modal body) from the extracted
  leaves** so its rendered arrangement is identical to today. The modal keeps its
  own inline title + status `Tag` (it is not a layout page, so it has no header
  chrome).
- Keep the `state_path: current_action.fields` / `current_action.*` contract and
  the `on_complete` var unchanged.

## Acceptance Criteria

- The extracted leaf files exist and are `_ref`-able with explicit vars.
- `check-action-modal.yaml` renders and behaves **exactly as before** — same
  blocks, ids, gates, payloads, and the same single `get_workflow_action`
  fetch + response-derived `SetState`. No behavioural change to the modal.
- `pnpm ldf:b` (from `apps/demo`) compiles cleanly.
- The three shared `workflow-action-*` pages still build (they are retired in
  Task 11, not here) — i.e. `check-action-surface.yaml` keeps its existing
  `_ref` contract so existing referrers don't break mid-stream.

## Files

- `modules/workflows/components/check-action-surface.yaml` — modify — recompose from extracted leaves; arrangement unchanged.
- `modules/workflows/components/check-surface/*.yaml` (or similar) — create — the extracted signal-button bar, comment, status-history list, and the shared mode-derivation fragment.

## Notes

- The point of the split is **shared leaves, not shared layout** (D6): the modal
  body and the workspace page are two *compositions* of the same leaves.
- Do not change `block` ids that the modal/state contract depends on (e.g.
  `current_action.status`, `current_action.comment`,
  `current_action.change_request_comment`) — Lowdefy binds state by block id and
  the prunable-state notes in the surface header are load-bearing.
- This task only refactors + keeps the modal stable; the workspace recomposition
  is Task 8.
