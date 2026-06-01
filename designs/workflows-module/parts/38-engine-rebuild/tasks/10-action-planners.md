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
- **Upsert spawn — the Submit-time insert trigger (D4 / D13 (2) / state-machine.md `none` row).** A pre-hook `actions[]` entry with `upsert: true` whose `(type, key)` matches no existing doc → build a pseudo-action `{ kind: actionConfig.kind, status: [{ stage: "none" }] }`, resolve the signal via the FSM `none` creation row, and produce `operation: "insert"` with the new doc seeded at the resolved birth stage (`activate` → `action-required`, `block` → `blocked`, `request_changes` → `changes-required`, `error` → `error`). A missing target *without* `upsert: true` → **throw** (D13 (2)). This is the rebuilt home of today's `handleSubmit` upsert branch (`utils/shouldCreate.js` + `createAction`, both deleted); the old `status` seed is gone — the birth stage comes from the signal.
- Build the change-log delta (`before` = loaded action doc, `null` for inserts; `after` = planned doc).

**Create `shared/phases/planners/planAutoUnblock.js`:**

- A **fixpoint** loop over the in-progress action plan. When a planned transition satisfies a blocked action's `blocked_by`, the dependent action gains an `unblock` signal, resolved through the FSM (`FSM[kind]["blocked"]["unblock"] → action-required`).
- **`blocked_by` resolves action types AND group ids** (restores `computeAutoUnblocks` + `reevaluateBlockedActions`, both deleted). Each entry is satisfied iff:
  - (**action type**) *every* doc of that type in the Plan is terminal — the keyed-action rule: a type isn't terminal until all its keyed instances are; or
  - (**group id**, declared in `action_groups[]`) the group's *planned/recomputed* status is `done`.
- **Interleaved with group recompute (D4 / data flow).** Group-id deps must read the *recomputed* group status, not the loaded one. Spec the cascade as an alternating fixpoint: `planWorkflowRecompute` (task 11) recomputes planned groups from the current planned actions → unblock pass fires against blocked actions whose `blocked_by` is now satisfied → repeat until no new unblock fires; a **final** recompute feeds the workflow doc. An `unblock` lands `action-required` (non-terminal) so it can't complete a *new* group, but it changes a group's label (`blocked → in-progress`), so the recompute must also run after the unblocks.
- **Unblock-only / monotonic:** the engine never auto-emits `block` on dep regression — once unblocked, an action stays unblocked unless an author re-blocks via a pre-hook. Pre-hook `block` entries arrive via `preHookResult.actions[]` and are planned by `planActionTransition`, **not** here.
- Termination: each action unblocks at most once; `unblock` no-ops from every non-`blocked` state. Iterate until no further unblocks fire (worst case N iterations for N actions; typically 1–2).

## Acceptance Criteria

- `planActionTransition` throws on a `null` FSM resolution for the user current-action signal; no-ops silently for auxiliary/cascade signals.
- `payload.fields` is passed through verbatim, kind-agnostic (no named universal fields).
- Planned action doc has: prepended `status[]` entry, merged metadata (metadata wins), rendered cell spread, per-verb `links` map spread; change-log delta with correct before/after (null before for inserts).
- `planAutoUnblock` terminates (linear: 1 iter; chained: converges; cycles don't deadlock via FSM structural safety), emits `unblock` against the right targets, and **never** auto-emits `block`.
- `planAutoUnblock` resolves both **action-type** `blocked_by` (all docs of the type terminal) and **group-id** `blocked_by` (planned group status `done`), reading the *recomputed* group status via the interleaved fixpoint.
- Upsert spawn: an `upsert: true` entry with no matching doc produces `operation: "insert"` seeded at the `none`-resolved birth stage; a missing target without `upsert` throws.
- Tests: `planActionTransition.test.js` (per-kind variants, sticky display, FSM no-op null, change-log delta, **upsert spawn → insert at birth stage, and missing-target-without-upsert throws**), `planAutoUnblock.test.js` (fixpoint termination, correct targets, no-block assertion, empty case, **group-gated unblock: completing the last action in a group unblocks an action `blocked_by: [group-id]` in the same submit**, keyed-type all-docs-terminal rule).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planAutoUnblock.js` — create
- `…/planners/planActionTransition.test.js` — create
- `…/planners/planAutoUnblock.test.js` — create

## Notes

- Q3 (sticky display for slugs leaving `access`): no cleanup — a departed slug keeps its stale `.message`/`.links`; display surfaces don't project it. Document, don't add cleanup logic.
- These planners are pure — a planner importing a Mongo driver is a review smell (D2/D8).
