# Task 4: `shared/pushWorkflowStatus.js` — workflow-status push with same-stage guard

## Context

The auto-complete check (sub-step 4c) needs to push `{ stage: 'completed' }` onto the workflow's `status[]` array — but workflow status uses a different idempotency guard than action status. From [engine spec § Idempotency](../../../../workflows-module-concept/engine/spec.md#idempotency):

> **Workflow status pushes** have no priority ordering. Guarded by a same-stage no-op check at the top of `pushWorkflowStatus` — reads `status[0].stage`, returns early if it equals the new stage. Prevents duplicate `$push` and double-firing tracker subscription on retry.

Workflow lifecycle is a 3-value enum (`active` / `completed` / `cancelled`) with no priorities — see [`modules/workflows/enums/workflow_lifecycle_stages.yaml`](../../../../modules/workflows/enums/workflow_lifecycle_stages.yaml). The priority rule that governs action transitions doesn't apply here.

This helper lives in `src/connections/shared/` (alongside `updateAction.js`, `createAction.js`) because it's consumed by multiple handlers — task 8 wires it into the submit-pipeline's auto-complete; future callers (the part-10 tracker subscription, part-23 close-workflow handler) will also use it. `CancelWorkflow` currently inlines its own status push at `CancelWorkflow.js:43–57` — out of scope to migrate it here, but the new helper is shape-compatible.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.js`.

Signature:

```js
/**
 * Push a workflow-lifecycle status entry onto the workflow's `status[]` array.
 *
 * Guarded by a same-stage no-op check: reads the current `status[0].stage`
 * (either from the in-memory workflow doc passed in, or via a one-shot find)
 * and returns early on equality. This is the canonical idempotency guard for
 * workflow-lifecycle pushes — distinct from the action-status priority rule
 * (workflow lifecycle is a 3-value enum with no priorities).
 *
 * Used by: auto-complete check (this part, task 8), future tracker
 * subscription (part 10), future CloseWorkflow handler (part 23).
 *
 * @param {Object} context — engine handler context (has `mongoDBConnection`,
 *   `changeStamp`).
 * @param {Object} options
 * @param {string} options.workflowId
 * @param {'completed' | 'cancelled' | 'active'} options.newStage — the
 *   workflow-lifecycle stage to push.
 * @param {string | null} [options.eventId] — optional event id to thread
 *   into the status entry.
 * @param {string | null} [options.currentStage] — caller-supplied stage if the
 *   workflow doc is already in memory. When omitted, the helper reads it via
 *   a one-shot `MongoDBFindOne`.
 * @returns {Promise<{ pushed: boolean, stage: string }>} — `pushed: true` when
 *   the push lands, `false` when the same-stage guard skipped.
 */
async function pushWorkflowStatus(
  context,
  { workflowId, newStage, eventId = null, currentStage = null },
) {
  // ...
}

export default pushWorkflowStatus;
```

Behaviour:

1. **Resolve the current stage.** If `currentStage` was passed in, use it. Otherwise:

   ```js
   const doc = await context.mongoDBConnection('workflows').MongoDBFindOne({
     query: { _id: workflowId },
     options: { projection: { 'status.0.stage': 1 } },
   });
   const resolvedCurrent = doc?.status?.[0]?.stage ?? null;
   ```

2. **Same-stage no-op guard.** If the resolved current stage equals `newStage`, return `{ pushed: false, stage: newStage }` without writing.

3. **Push.** Otherwise issue:

   ```js
   await context.mongoDBConnection('workflows').MongoDBUpdateOne({
     filter: { _id: workflowId },
     update: {
       $set: { updated: context.changeStamp },
       $push: {
         status: {
           $position: 0,
           $each: [
             { stage: newStage, event_id: eventId, created: context.changeStamp },
           ],
         },
       },
     },
   });
   return { pushed: true, stage: newStage };
   ```

   Mirrors the existing patterns in `CancelWorkflow.js:43–57` (push at position 0) and `shared/updateAction.js` (the action-side push helper). The change stamp comes off `context.changeStamp` — same convention as every other shared write helper.

4. **No priority check.** The function does not read `connection.actionsEnum` and does not call `shouldUpdate.js`. Action-side priority semantics don't apply to workflow lifecycle.

## Acceptance Criteria

- File exists at `plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.js`.
- Default export matches the signature above.
- Same-stage guard: when `currentStage === newStage` (or when the in-DB stage equals `newStage` for the find-then-write path), returns `{ pushed: false, stage }` without issuing a Mongo write.
- Push path: issues one `MongoDBUpdateOne` with `$set: { updated }` and `$push: { status: { $position: 0, $each: [{ stage, event_id, created }] } }`.
- `event_id` defaults to `null` when not passed.
- Pulls `changeStamp` off `context.changeStamp` (matches `updateAction.js` / `createAction.js` / `CancelWorkflow.js` conventions).
- Colocated `pushWorkflowStatus.test.js` uses the shipped `inMemoryMongo.js` helper from [part 6 task 1](../../06-submit-action-writes/tasks/01-jest-harness-setup.md):
  - Push onto a workflow with `status[0].stage = 'active'` → write lands; `{ pushed: true, stage: 'completed' }`; the new entry is at index 0; the previous `active` entry is at index 1.
  - Push `'completed'` onto a workflow already at `'completed'` → no write; `{ pushed: false, stage: 'completed' }`.
  - Push with caller-supplied `currentStage` → no Mongo find issued (the helper trusts the caller).
  - Push with no `currentStage` and missing workflow → null current; the push lands (`null !== 'completed'`). (Edge case — this can't happen via shipping code, but the guard should be deterministic.)
  - `event_id` propagates into the pushed entry.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.js` — create — workflow-status push helper.
- `plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.test.js` — create — `inMemoryMongo`-backed cases above.

## Notes

- The `currentStage` parameter is a small optimisation: when the caller (task 8's `handleSubmit` extension) already has the workflow doc in memory from step 1's validate, it can skip the one-shot find. When the helper stands alone (future callers in parts 10 / 23), the find path keeps it self-contained.
- This helper does NOT recompute or write `groups[]` or `summary`. Those are step 5's work. The helper only owns the `status[]` push.
- Engine spec at [engine/spec.md:259](../../../../workflows-module-concept/engine/spec.md) sketches a `pushWorkflowStatus(context, workflowId, newStage, eventId)` shape — this implementation uses a single-options-object style consistent with `updateAction.js`'s shape (passes `{ actionId, newStage, fields, eventId, force }`). Functionally identical; matches the established shared/ pattern.
- `CancelWorkflow.js:43–57` does its own inline `$push` of `{ stage: 'cancelled', created, ...(reason ? { reason } : {}) }`. The `reason` field is cancellation-specific (not part of the generic helper). Migrating CancelWorkflow to use this helper is out of scope for v1 — the inline push works, and the same-stage guard isn't load-bearing for cancel (CancelWorkflow runs once from a known `active` state).
