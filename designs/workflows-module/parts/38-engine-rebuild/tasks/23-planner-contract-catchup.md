# Task 23: Catch-up — planner contract extensions from review-13

## Context

Review-13 (task 17) was actioned after Band 3 landed and while task 16 was in flight. Three of its resolutions extend the contracts of already-implemented code, and one touches code task 16 may have landed against the pre-amendment spec. Per the catch-up pattern (tasks 21/22), this task reconciles the landed code with the amended specs **before task 17 consumes the new contracts**. The owning specs are tasks 10/11/16 (each carries the amended contract, marked "added by task 23") and task 17 (the consumer); this file is the implementation home only.

## Task

**`shared/phases/planners/planActionTransition.js` — add the `seedStage` mode** (review-13 #1; spec in task 10):

- New optional input, **mutually exclusive with `signal`** — both present throws `WorkflowEngineError` (programming error).
- Insert-only: `action` must be absent (a `seedStage` with a loaded action throws); bypasses the `upsert` gate, which guards the signal path only.
- Skips `resolveSignal`; the declared `seedStage` is the target stage. Every downstream step runs unchanged: full draft build, `access`/`workflow_type` denormalisation, `status_map` render at the seed stage, `computeEngineLinks`, change-log `{ before: null, after: doc }`.
- **No legal-seed validation here** — the planner stays generic; Start owns enforcement (build-time in `makeWorkflowsConfig`, runtime throw in `StartWorkflow` — task 17).

**`shared/phases/planners/planWorkflowRecompute.js` — add the optional `lifecyclePush: { stage, reason }` input** (review-13 #3; spec in task 11):

- When present, **skip the auto-complete check entirely** and push the declared entry instead: `{ stage, event_id, created: now, ...(reason ? { reason } : {}) }`.
- Skip-entirely semantics, not replace-if-firing: Close pushes `completed` even when a `required_after_close` survivor keeps the action set non-terminal.
- Omitted → behaviour unchanged (Submit and tracker levels pass nothing).

**`shared/fsm/tables.js` — flip the tracker `none` row** (Part 45 review 1 #2; previously parked in task 17's Files):

- Add `none: { activate: 'action-required', block: 'blocked' }` to the tracker table, per the updated state-machine.md "Creation" section (pre-hooks can conditionally spawn trackers).
- Correct the table's header comment (`tables.js:100–101` still claims tracker actions are never pre-hook-spawned).
- Flip the `tables.test.js` assertion that the tracker has no `none` row.

**Task 16 reconcile (in flight):** verify the landed `runTrackerCascade` / `planTrackerLevel` forward `fire.payload` into `planActionTransition`'s `payload.fields` (review-13 #4; spec in task 16 — the fire shape gained optional `payload?: { fields }` mid-flight). If task 16 landed without it, add the passthrough + a test (a fire carrying `payload.fields` sets those fields on the parent tracker doc alongside the transition).

## Acceptance Criteria

- `planActionTransition` seeds a full-composition draft from `seedStage` (denormalised `access`/`workflow_type`, rendered `status_map` cell, engine links, change-log delta); `seedStage` + `signal` throws; `seedStage` with an existing `action` throws; signal-path behaviour is byte-for-byte unchanged.
- `planWorkflowRecompute` with `lifecyclePush` pushes exactly the declared entry (never the auto `completed`), including when actions are non-terminal; `reason` lands on the entry; without `lifecyclePush` all existing tests pass unchanged.
- The tracker FSM table resolves `activate`/`block` from `none`; all other tracker rows unchanged.
- `planTrackerLevel` forwards `fire.payload` into `planActionTransition`'s `payload.fields` (if task 16 is landed by the time this runs).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` + `planActionTransition.test.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planWorkflowRecompute.js` + `planWorkflowRecompute.test.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js` + `tables.test.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/runTrackerCascade.js` / `planTrackerLevel.js` + tests — verify / modify (only if task 16 landed without the `payload` passthrough)

## Notes

- Sequence **before task 17** (its Start planner needs `seedStage`; its Cancel/Close need `lifecyclePush`; its tracker-child Start needs the `none` row + `payload` passthrough). Parallel-safe with task 15.
- No behaviour change for any existing caller: all three contract additions are optional inputs / new rows that nothing landed exercises yet.
