# Task 8: Wire `updateAction` to the new aggregation pipeline (+ handleSubmit refresh edits)

## Context

`updateAction` (`plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js`) is the single-action stage-transition write. Today's shape is a Mongo update doc — `$set` + `$push`. The new shape is a single-stage aggregation pipeline produced by `buildActionStageUpdate`, wrapping the rendered cell, engine-computed links, accumulated metadata, and the prepended status entry into one `$set`.

Per design D11, both `renderStatusMap` and `computeEngineLinks` run against the **merged action doc** — `{ ...actionDocBeforeWrite, ...callerFields }` — so per-kind link inputs (notably tracker `child_workflow_id`) reflect what this transition is writing. The render context for templates extends the merged doc with merged metadata (per D10).

The new signature is:

```
updateAction(context, { actionId, newStage, fields, actionDisplay = {}, metadata = null, eventId, currentActionId, force })
```

Two new keyed params vs today: `actionDisplay` (per-call cell override, D8) and `metadata` (caller-supplied accumulating bag, D10). Both default safely so engine-internal callers (`fireTrackerSubscription`, `reevaluateBlockedActions`) that don't supply caller display or metadata simply omit them; sticky display fills the gap and `metadata` stays at its prior value.

**Force/fetch unification (D11).** Today `updateAction` skips the pre-write fetch when `force: true` (the fetch only existed to feed the `shouldUpdate` priority gate, which force bypasses). Render-on-write needs the pre-write doc for template context on every call. Pull the `getCurrentAction` fetch out of the current `if (force !== true)` block so it runs unconditionally; `force` continues to control whether `shouldUpdate` runs but no longer affects fetching.

`updateAction` is called by `SubmitWorkflowAction/handleSubmit.js`, `SubmitWorkflowAction/fireTrackerSubscription.js`, and `SubmitWorkflowAction/reevaluateBlockedActions.js` — they all inherit the new write shape automatically.

## Task

1. **`plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js`** — accept the new signature `({ actionId, newStage, fields, actionDisplay = {}, metadata = null, eventId, currentActionId, force })`. Pull the `getCurrentAction` fetch out of the `if (force !== true)` block so the doc is fetched on every call (the fetched doc feeds both the priority gate and the renderer). `force` continues to gate only `shouldUpdate`. Then:
   - Compute `mergedMetadata = { ...(actionDocBeforeWrite.metadata ?? {}), ...(metadata ?? {}) }`.
   - Compute `mergedActionDoc = { ...actionDocBeforeWrite, ...(fields ?? {}) }`.
   - Call `renderStatusMap({ actionConfig, stage: newStage, mergedActionDoc, actionDisplay, mergedMetadata, actionId: actionDocBeforeWrite._id })`.
   - Call `computeEngineLinks(actionConfig, newStage, mergedActionDoc)`.
   - Call `buildActionStageUpdate({ renderedCell, engineLinks, newStage, mergedMetadata, eventId, changeStamp })`.
   - Pass the resulting pipeline to `MongoDBUpdateOne` (Mongo accepts a pipeline as the update doc when wrapped as an array — the existing `MongoDBUpdateOne` request needs the `update:` field to be the pipeline array).
   - `actionConfig` is looked up inside `updateAction` from `context.actionsConfig` by `actionDocBeforeWrite.type` (no new param threaded through callers).

2. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`** — three explicit edits (per design D11 / D14):

   1. In the step-4 per-entry write loop (lines 226-249), pass `actionDisplay: params.action_display` and `metadata: params.metadata` into the `updateAction` call (and into the `createAction` call on the upsert branch) so caller-supplied per-app overrides and the metadata bag reach the renderer.
   2. After the step-5 recompute, refresh `context.action` by picking the submitted action out of `recomputeResult.workflowActions` — `context.action = recomputeResult.workflowActions.find(a => a._id === context.action._id)`. The recompute already re-reads every action in this workflow from Mongo, so the post-write copy is in hand — no extra Mongo round-trip.
   3. After the step-5 recompute, reassign `context.workflow = recomputeResult.workflow` so `workflow.summary` (and any other post-recompute workflow field) is fresh for event-display templates like `"{{ workflow.summary.done }}/{{ workflow.summary.total }}"`.

   Without edit 1, caller `action_display` / `metadata` are silently dropped. Without edits 2-3, `action.metadata`, `action.status[0].stage`, `action.<appName>.message`, and `workflow.summary.*` in event templates resolve to pre-write (or unset) values.

3. **Tests** — extend `updateAction.test.js`:
   - On submit to a stage with a cell, the action doc carries the new rendered `message` per slug.
   - On submit to a stage **without** a cell, previous-stage `message` persists (sticky) — assert by writing a sequence: cell at stage A, no cell at stage B, then read.
   - For built-in kinds, each slug's `link` is recomputed every transition (e.g. stage `done` → `task-view`, even if previous was `task-edit`).
   - For `kind: custom`, the author's rendered `link` flows through; engine doesn't overwrite.
   - On submit to `blocked`, every slug's `link` is `null`; `message` persists from the previous stage (sticky).
   - `metadata` accumulates: subsequent submits with new metadata produce `{ ...previous, ...new }` on the doc.
   - `actionDisplay.{slug}` override path: with `metadata: { x: 1 }` and `actionDisplay: { demo: { message: 'custom {{ x }}' } }`, rendered `demo.message` is `'custom 1'`.
   - `force: true` path still fetches the pre-write doc (assert via a templated cell that references an action-doc field).

## Acceptance Criteria

- `updateAction` accepts the new signature with `actionDisplay` and `metadata` keyed params, with safe defaults.
- `updateAction` fetches the pre-write doc unconditionally; `force` only gates `shouldUpdate`.
- `updateAction` uses the new pipeline. `MongoDBUpdateOne` is called with an array (pipeline) as the update doc.
- `handleSubmit.js` passes `actionDisplay` and `metadata` into `updateAction` / `createAction`, and refreshes `context.action` and `context.workflow` from the recompute result before event dispatch.
- All new test cases pass.
- Existing tests for `updateAction` and `handleSubmit` continue to pass (or are updated where shape changed).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js` — modify.
- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.test.js` — modify (or extend).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify (three edits).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify or extend as needed for the new event-render bindings.

## Notes

If the existing `MongoDBUpdateOne` wiring doesn't already accept a pipeline-shaped `update`, check that the underlying driver / request schema does (Mongo node driver supports pipeline-as-update on `updateOne` directly). Adjust the request payload accordingly.

`fireTrackerSubscription` and `reevaluateBlockedActions` call `updateAction` without supplying `actionDisplay` / `metadata` — the defaults (`{}` / `null`) keep them safe; no edits needed there.
