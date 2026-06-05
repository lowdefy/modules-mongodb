# Task 23: Catch-up — planner contract extensions from review-13

## Context

Review-13 (task 17) was actioned after Band 3 landed and while task 16 was in flight. Three of its resolutions extend the contracts of already-implemented code, and one touches code task 16 landed (`a5c321b`) against the pre-amendment spec — without the fire `payload` passthrough. Per the catch-up pattern (tasks 21/22), this task reconciles the landed code with the amended specs **before task 17 consumes the new contracts**. The owning specs are tasks 10/11/16 (tasks 10/11 mark the amended contract "added by task 23"; task 16's payload lines attribute to task 17) and task 17 (the consumer); this file is the implementation home only.

## Task

**`shared/phases/planners/planActionTransition.js` — add the `seedStage` mode** (review-13 #1; spec in task 10):

- New optional input, **mutually exclusive with `signal`** — both present throws `WorkflowEngineError` with `code: 'invalid_seed'` (programming error).
- Insert-only: `action` must be absent (a `seedStage` with a loaded action throws `invalid_seed`); bypasses the `upsert` gate, which guards the signal path only.
- Skips `resolveSignal`; the declared `seedStage` is the target stage. Every downstream step runs unchanged: full draft build, `access`/`workflow_type` denormalisation, `status_map` render at the seed stage, `computeEngineLinks`, change-log `{ before: null, after: doc }`.
- **No legal-seed validation here** — the planner stays generic; Start owns enforcement (build-time in `makeWorkflowsConfig`, runtime throw in `StartWorkflow` — task 17).

**`shared/phases/planners/planWorkflowRecompute.js` — add the optional `lifecyclePush: { stage, reason }` input** (review-13 #3; spec in task 11):

- When present, **skip the auto-complete check entirely** and push the declared entry instead: `{ stage, event_id, created: now, ...(reason ? { reason } : {}) }`.
- Skip-entirely semantics, not replace-if-firing: Close pushes `completed` even when a `required_after_close` survivor keeps the action set non-terminal.
- Omitted → behaviour unchanged (Submit and tracker levels pass nothing).

**`shared/fsm/tables.js` — flip the tracker `none` row** (Part 45 review 1 #2; previously parked in task 17's Files):

- Add `none: { activate: 'action-required', block: 'blocked' }` to the tracker table, per the updated state-machine.md "Creation" section (pre-hooks can conditionally spawn trackers).
- Correct the table's header comment (`tables.js:100–101` still claims tracker actions are never pre-hook-spawned).
- Flip the landed tests that pin the no-`none`-row behaviour — three edits in `tables.test.js`: add the `none` row to `EXPECTED_TRACKER`, add `activate`/`block` to `TRACKER_SIGNALS` (the exhaustive grid then also verifies they resolve **only** from `none` — state-machine.md:167), and flip the direct no-`none`-row assertion.
- Replace the `planActionTransition.test.js` "tracker spawn is a structural no-op" test (it asserts a `block` upsert-spawn of a tracker resolves `null` — the flip reverses this) with the coverage the new row needs: tracker spawn → insert at the birth stage (`blocked` for `block`, `action-required` for `activate`), `tracker: { workflow_type }` populated from the config. Update the test's stale comment (same wording as the `tables.js` header).

**Task 16 reconcile:** task 16 landed (`a5c321b`) without the fire `payload` passthrough — `planTrackerLevel` passed a hardcoded `payload: {}` into `planActionTransition` and the cascade loop forwarded only `parentActionId` + `signal` (review-13 #4; spec in task 16 — the fire shape gained optional `payload?: { fields }` mid-flight). Add `payload` to the fire dequeue → `planTrackerLevel` args → `planActionTransition` call: pass the fire's `payload` bag through **whole** as `planActionTransition`'s `payload` (its `fields` key lands as `payload.fields` — do not re-wrap it in `{ fields: … }`). Add `payload?: { fields }` to the `Plan.trackerFires` typedef (`shared/phases/types.js`). Plus a test: a fire carrying `payload.fields` sets those fields on the parent tracker doc alongside the transition.

## Acceptance Criteria

- `planActionTransition` seeds a full-composition draft from `seedStage` (denormalised `access`/`workflow_type`, rendered `status_map` cell, engine links, change-log delta); `seedStage` + `signal` throws `invalid_seed`; `seedStage` with an existing `action` throws `invalid_seed`; signal-path behaviour is byte-for-byte unchanged.
- `planWorkflowRecompute` with `lifecyclePush` pushes exactly the declared entry (never the auto `completed`), including when actions are non-terminal; `reason` lands on the entry; without `lifecyclePush` all existing tests pass unchanged.
- The tracker FSM table resolves `activate`/`block` from `none`; all other tracker rows unchanged.
- `planTrackerLevel` passes the fire's `payload` bag through whole as `planActionTransition`'s `payload` (a fire carrying `payload.fields` sets those fields on the parent tracker doc — no double-nesting).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` + `planActionTransition.test.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planWorkflowRecompute.js` + `planWorkflowRecompute.test.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js` + `tables.test.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/runTrackerCascade.js` / `planTrackerLevel.js` + tests — modify (add the fire `payload` passthrough)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/types.js` — modify (add `payload?: { fields }` to the `trackerFires` typedef)

## Notes

- Sequence **before task 17** (its Start planner needs `seedStage`; its Cancel/Close need `lifecyclePush`; its tracker-child Start needs the `none` row + `payload` passthrough).
- No behaviour change for any existing caller: all three contract additions are optional inputs / new rows that nothing landed exercises yet.
