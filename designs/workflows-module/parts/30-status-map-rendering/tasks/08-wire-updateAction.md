# Task 8: Wire `updateAction` to the new aggregation pipeline

## Context

`updateAction` (`plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js`) is the single-action stage-transition write. Today's shape is a Mongo update doc — `$set` + `$push`. The new shape is a single-stage aggregation pipeline produced by `buildActionStageUpdate`, wrapping the rendered cell, engine-computed links, accumulated metadata, and the prepended status entry into one `$set`.

Per design D11, both `renderStatusMap` and `computeEngineLinks` run against the **merged action doc** — `{ ...actionDocBeforeWrite, ...callerFields }` — so per-kind link inputs (notably tracker `child_workflow_id`) reflect what this transition is writing. The render context for templates extends the merged doc with merged metadata (per D10).

`updateAction` is called by `SubmitWorkflowAction/handleSubmit.js`, `SubmitWorkflowAction/fireTrackerSubscription.js`, and `SubmitWorkflowAction/reevaluateBlockedActions.js` — they all inherit the new write shape automatically.

## Task

1. **`plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js`** — replace today's `$set` + `$push` update doc with:
   - Compute `mergedMetadata = { ...(actionDocBeforeWrite.metadata ?? {}), ...(payload.metadata ?? {}) }`.
   - Compute `mergedActionDoc = { ...actionDocBeforeWrite, ...(callerFields ?? {}) }` — where `callerFields` is whatever the existing call signature passes for per-transition action-doc updates (e.g. `child_workflow_id` from the tracker parent path).
   - Call `renderStatusMap({ actionConfig, stage: newStage, mergedActionDoc, actionDisplay: payload.action_display, mergedMetadata, actionId: actionDocBeforeWrite._id })`.
   - Call `computeEngineLinks(actionConfig, newStage, mergedActionDoc)`.
   - Call `buildActionStageUpdate({ renderedCell, engineLinks, newStage, mergedMetadata, eventId, changeStamp })`.
   - Pass the resulting pipeline to `MongoDBUpdateOne` (Mongo accepts a pipeline as the update doc when wrapped as an array — the existing `MongoDBUpdateOne` request needs the `update:` field to be the pipeline array).

2. **Tests** — extend `updateAction.test.js`:
   - On submit to a stage with a cell, the action doc carries the new rendered `message` per slug.
   - On submit to a stage **without** a cell, previous-stage `message` persists (sticky) — assert by writing a sequence: cell at stage A, no cell at stage B, then read.
   - For built-in kinds, each slug's `link` is recomputed every transition (e.g. stage `done` → `task-view`, even if previous was `task-edit`).
   - For `kind: custom`, the author's rendered `link` flows through; engine doesn't overwrite.
   - On submit to `blocked`, every slug's `link` is `null`; `message` persists from the previous stage (sticky).
   - `metadata` accumulates: subsequent submits with new metadata produce `{ ...previous, ...new }` on the doc.
   - `payload.action_display.{slug}` override path: with `metadata: { x: 1 }` and `action_display: { demo: { message: 'custom {{ x }}' } }`, rendered `demo.message` is `'custom 1'`.

## Acceptance Criteria

- `updateAction` uses the new pipeline. `MongoDBUpdateOne` is called with an array (pipeline) as the update doc.
- All new test cases pass.
- Existing tests for `updateAction` continue to pass (or are updated where shape changed).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js` — modify.
- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.test.js` — modify (or extend).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — verify metadata flows through; no structural change expected.

## Notes

If the existing `MongoDBUpdateOne` wiring doesn't already accept a pipeline-shaped `update`, check that the underlying driver / request schema does (Mongo node driver supports pipeline-as-update on `updateOne` directly). Adjust the request payload accordingly.
