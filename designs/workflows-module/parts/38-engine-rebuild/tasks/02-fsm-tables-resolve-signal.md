# Task 2: FSM tables + `resolveSignal`

## Context

The rebuild replaces the priority-rule + `force: true` transition model with per-kind finite-state-machine tables driven by **signals**. The concept-level source of truth is `designs/workflows-module-concept/state-machine/design.md` — read it before writing the tables. The action kinds are `form` / `simple` / `tracker` (after Part 35 renamed `task`→`simple`).

Signals come from three sources, all resolved identically: user signals (`payload.signal`), pre-hook auxiliary signals (`preHookResult.actions[]`), and engine cascade signals (`unblock`, `internal_mirror_child_*`, `internal_cancel_action`). The engine never auto-emits `block` — cascades are monotonic (unblock-only); `block` is a pre-hook-only auxiliary signal.

This is a pure, foundational module consumed by every planner.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/shared/fsm/`:

- `tables.js` — exports `FSM_TABLES` keyed by kind. Define **two distinct tables**, `form` and `tracker`, transcribed exactly from state-machine.md. Then **alias** `simple` to the form table: `FSM_TABLES.simple = FSM_TABLES.form` — never a hand-maintained copy (state-machine.md states simple is "Identical to the form-kind table"). Aliasing makes the identity mechanical so a future edit to `form` can't silently diverge from `simple`.
  - Each table maps `currentStage → signal → entry`, where an entry is either a string (direct target stage), a function `({ action, actionConfig }) => stage` (for the `submit` in-review/done split — see below), or absent (no-op signal for that state).
- `resolveSignal.js` — exports `resolveSignal({ action, signal, actionConfig })`:
  ```js
  function resolveSignal({ action, signal, actionConfig }) {
    const table = FSM_TABLES[action.kind];
    const currentStage = action.status[0].stage;
    const entry = table[currentStage]?.[signal];
    if (entry === undefined) return null;        // no-op signal — non-listening state
    if (typeof entry === "string") return entry; // direct target
    return entry({ action, actionConfig });      // function cell
  }
  ```
  Note: `resolveSignal` takes **no current-app argument**. The `submit` → in-review/done split is an **action-global** property: the function cell chooses `in-review` vs `done` via `hasReview(actionConfig)` — whether *any* app block in the action's `access` declares a `review` verb:
  ```js
  const hasReview = (actionConfig) =>
    Object.values(actionConfig.access ?? {})
      .some((appBlock) => appBlock != null && "review" in appBlock);
  ```
  One action doc is shared across every app (all read the same `status[0].stage`), so review-stage existence is a property of the action, not the submitter.
- `tables.test.js` — **exhaustive** coverage: one assertion per `(kind, currentStage, signal)` tuple in `form` and `tracker`, against state-machine.md's expected values. Plus an assertion that `FSM_TABLES.simple === FSM_TABLES.form` (the alias identity — do **not** re-test every simple cell). Specifically guard that `unblock` is a no-op from every non-`blocked` state (catches the re-fire bug: `unblock` from `blocked` → `action-required`, which must not itself accept `unblock`).

## Acceptance Criteria

- `FSM_TABLES.simple === FSM_TABLES.form` is true (object identity), asserted in tests.
- Every cell in `form` and `tracker` matches state-machine.md exactly.
- `resolveSignal` returns `null` for any signal with no table entry in the current stage.
- `hasReview` reads app-global from `actionConfig.access`, taking no submitting-app input.
- `unblock` no-ops from `action-required`, `in-review`, `done`, etc.; transitions only from `blocked`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/fsm/resolveSignal.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.test.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/fsm/resolveSignal.test.js` — create

## Notes

- state-machine.md is authoritative for the exact stages and signals; transcribe, don't invent. If a cell in the design's D4 examples disagrees with state-machine.md, state-machine.md wins (it is cited as the authority per the design's prerequisite note).
- The eight-status enum is fixed; do not add custom statuses (Non-goals).
- FSM tables are engine-locked in v1 — no author-overridable tables (Non-goals).
