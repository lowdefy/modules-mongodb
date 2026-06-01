# Task 10: Action planners — `planActionTransition` + `planAutoUnblock`

## Context

The plan phase is pure (no I/O): it computes every consequence of a submit against the loaded state plus accumulating planned changes. This task builds the two action-level planners. They consume the FSM (task 2), the render layer (task 3), and the phase types (task 9). They replace the deleted `createAction.js` / `updateAction.js` / `computeAutoUnblocks.js` / `reevaluateBlockedActions.js`.

## Task

**Create `shared/phases/planners/planActionTransition.js`:**

Given `{ action, signal, payload, actionConfig, plannedWorkflowDoc }`, return the planned post-commit action doc + a change-log delta:

- Resolve `signal` → target stage via `resolveSignal` (task 2). For the **user-driven current-action** signal, if `resolveSignal` returns `null` (no FSM entry) → **throw** (D13 (3) / Q2: the user clicked a button that shouldn't have been available — actionable bug). For pre-hook auxiliary and engine cascade signals, a `null` resolution is a **silent no-op** (FSM structural safety).
- Compose the planned action doc: prepend a new `status[]` entry (`{ stage, event_id, created }`), merge `metadata` (metadata wins over action-doc-field collisions), and **set `payload.fields` verbatim** onto the doc.
  - **Field write is a generic passthrough.** This planner is the home of today's `updateAction` `...fields` spread. It is **kind-agnostic** — it does **not** name `assignees` / `due_date` / `description`; it passes the `fields` bag through verbatim, exactly as today. This is the behavior-preserving baseline so no submit (notably `kind: simple`, whose submission content *is* those fields) regresses. (Part 24 layers a kind-based universal-fields rule on top later; Part 38 stays ignorant of it.)
- Lookup `status_map[targetStage]` for the action's kind; render the cell via `renderStatusMap` (task 3) against the planned action doc + merged metadata; spread the rendered cell into the doc.
- Compute the per-verb engine links map via `computeEngineLinks` (task 3) for built-in kinds; spread `<slug>.links: { view, edit, review, error }` into the doc.
- Support both `operation: "insert"` (full draft) and `operation: "update"` (loaded action + planned changes layered on).
- Build the change-log delta (`before` = loaded action doc, `null` for inserts; `after` = planned doc).

**Create `shared/phases/planners/planAutoUnblock.js`:**

- A **fixpoint** loop over the in-progress action plan. An action's `blocked_by` references other actions; when a planned transition makes those references terminal, the dependent action gains an `unblock` signal, resolved through the FSM (`FSM[kind]["blocked"]["unblock"] → action-required`).
- **Unblock-only / monotonic:** the engine never auto-emits `block` on dep regression — once unblocked, an action stays unblocked unless an author re-blocks via a pre-hook. Pre-hook `block` entries arrive via `preHookResult.actions[]` and are planned by `planActionTransition`, **not** here.
- Termination: each action unblocks at most once; `unblock` no-ops from every non-`blocked` state. Iterate until no further unblocks fire (worst case N iterations for N actions; typically 1–2).

## Acceptance Criteria

- `planActionTransition` throws on a `null` FSM resolution for the user current-action signal; no-ops silently for auxiliary/cascade signals.
- `payload.fields` is passed through verbatim, kind-agnostic (no named universal fields).
- Planned action doc has: prepended `status[]` entry, merged metadata (metadata wins), rendered cell spread, per-verb `links` map spread; change-log delta with correct before/after (null before for inserts).
- `planAutoUnblock` terminates (linear: 1 iter; chained: converges; cycles don't deadlock via FSM structural safety), emits `unblock` against the right targets, and **never** auto-emits `block`.
- Tests: `planActionTransition.test.js` (per-kind variants, sticky display, FSM no-op null, change-log delta), `planAutoUnblock.test.js` (fixpoint termination, correct targets, no-block assertion, empty case).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planAutoUnblock.js` — create
- `…/planners/planActionTransition.test.js` — create
- `…/planners/planAutoUnblock.test.js` — create

## Notes

- Q3 (sticky display for slugs leaving `access`): no cleanup — a departed slug keeps its stale `.message`/`.links`; display surfaces don't project it. Document, don't add cleanup logic.
- These planners are pure — a planner importing a Mongo driver is a review smell (D2/D8).
