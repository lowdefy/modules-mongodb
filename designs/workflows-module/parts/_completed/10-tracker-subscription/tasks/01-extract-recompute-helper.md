# Task 1: Extract `shared/recomputeWorkflowAfterActionWrite.js` from `handleSubmit`

## Context

Part 10's tracker subscription, when it fires on a parent workflow, needs to run the same post-action-write recompute that `handleSubmit` runs after step 4 — sub-steps 4a (recompute groups), 4b (re-evaluate `blocked_by` for blocked actions), 4c (auto-complete check), and step 5 (bundled `summary` + `groups[]` + optional `completed` `$push` on the workflow doc). The current implementation in [handleSubmit.js:245–339](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) is inlined; the body of those sub-steps reads cached state from the caller's `context` object (`context.workflow`, `context.workflowActions`, `context.actionConfig`, `context.actionsConfig`).

For the tracker recursion path to reuse that work on a **different** workflow (the parent), the helper has to read fresh state per `workflowId` — the originating handler's caches are stale across workflows. This task extracts the body behind a one-line call without changing observable behaviour for the existing `handleSubmit` path.

The completed-groups diff at [handleSubmit.js:327–339](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) (which fills in `completedGroups` for the part 11 fan-out) reads `groupsBefore` and `groupsAfter` from the recompute. To keep the seam clean, the helper returns a result object that surfaces both — the caller does the `completed_groups` diff for the user-facing return; the tracker-recursion caller (task 2) reads the `shouldPushCompleted` flag to decide whether to recurse.

## Task

### 1. Create `plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.js`.

Signature:

```js
/**
 * Run the post-action-write recompute for one workflow: sub-step 4a (recompute
 * groups), 4b (re-evaluate blocked_by), 4c (auto-complete check), and step 5
 * (bundled summary + groups + optional `completed` $push on the workflow doc).
 *
 * Reads fresh state per `workflowId` — the workflow doc and its actions are
 * loaded inside the helper. Callers must NOT pass cached docs; the helper is
 * built specifically so the tracker-recursion path (part 10) can run it on a
 * different workflow than the originating handler's cache reflects.
 *
 * Consumers:
 *   - `handleSubmit` (after step 4 writes action transitions)
 *   - `fireTrackerSubscription` (after the parent-tracker write, on the parent
 *     workflow)
 *
 * @param {Object} context — engine handler context (`mongoDBConnection`,
 *   `changeStamp`, `eventId`, `workflowsConfig`, `actionsEnum`).
 * @param {Object} options
 * @param {string} options.workflowId — the workflow whose actions just changed.
 * @returns {Promise<{
 *   workflow: Object,                       // the loaded workflow doc (pre-write)
 *   workflowActions: Array,                 // the loaded actions array (post-write,
 *                                           //   includes the just-written transition)
 *   groupsBefore: Array,                    // groups[] as it was on the workflow doc
 *   groupsAfter: Array,                     // groups[] after recompute (what got written)
 *   reEvaluatedActionIds: string[],         // action ids the 4b walk pushed action-required on
 *   shouldPushCompleted: boolean,           // true when 4c's predicate fired and the
 *                                           //   completed $push landed in step 5's $set
 *   summary: { done: number, not_required: number, total: number },
 * }>}
 */
async function recomputeWorkflowAfterActionWrite(context, { workflowId }) {
  // ...
}

export default recomputeWorkflowAfterActionWrite;
```

### 2. Helper body — port the inline logic from `handleSubmit.js:245–322`.

Sequence:

1. **Load fresh workflow doc.** `context.mongoDBConnection('workflows').MongoDBFindOne({ query: { _id: workflowId } })`. Throw if not found.
2. **Resolve the workflow config.** `const workflowConfig = (context.workflowsConfig ?? []).find(w => w.type === workflow.workflow_type)`. Throw if not found (matches `handleSubmit`'s step 1 posture).
3. **Load fresh actions.** Use the shipped `getActions` helper from [shared/getActions.js](../../../../plugins/modules-mongodb-plugins/src/connections/shared/getActions.js): `const workflowActions = await getActions(context.mongoDBConnection, workflow._id)`.
4. **Sub-step 4a — recompute groups.** Import `recomputeGroups` from [SubmitWorkflowAction/recomputeGroups.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js):
   ```js
   const declaredGroups = workflowConfig.action_groups ?? [];
   const groupsBefore = workflow.groups ?? [];
   let groupsAfter = recomputeGroups({ declaredGroups, actions: workflowActions });
   ```
5. **Sub-step 4b — re-evaluate blocked_by walk.** Import `reevaluateBlockedActions` from [SubmitWorkflowAction/reevaluateBlockedActions.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/reevaluateBlockedActions.js). The walk needs `actionsConfig` (the workflow's actions array from config) on `context`. Set it before calling, mirroring how `handleSubmit` does at [handleSubmit.js:100](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js): `context.actionsConfig = workflowConfig.actions ?? []`. Then:
   ```js
   const reEvaluatedIds = await reevaluateBlockedActions(context, {
     workflowActions,
     actionsConfig: context.actionsConfig,
     groups: groupsAfter,
     declaredGroups,
     eventId: context.eventId,
   });
   ```
   If `reEvaluatedIds.length > 0`, refetch actions and recompute groups again (mirrors [handleSubmit.js:261–272](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)):
   ```js
   if (reEvaluatedIds.length > 0) {
     const refreshed = await getActions(context.mongoDBConnection, workflow._id);
     workflowActions.splice(0, workflowActions.length, ...refreshed);
     groupsAfter = recomputeGroups({ declaredGroups, actions: workflowActions });
   }
   ```
6. **Sub-step 4c — auto-complete predicate.** Same logic as [handleSubmit.js:274–285](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js):
   ```js
   const TERMINAL = ["done", "not-required"];
   const allTerminal =
     workflowActions.length > 0 &&
     workflowActions.every((a) => TERMINAL.includes(a.status?.[0]?.stage));
   const currentWorkflowStage = workflow.status?.[0]?.stage;
   const shouldPushCompleted =
     allTerminal &&
     currentWorkflowStage !== "completed" &&
     currentWorkflowStage !== "cancelled";
   ```
7. **Step 5 — bundled `$set` + optional `$push`.** Same shape as [handleSubmit.js:287–321](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js):
   ```js
   const summary = {
     done: workflowActions.filter((d) => d.status?.[0]?.stage === "done").length,
     not_required: workflowActions.filter((d) => d.status?.[0]?.stage === "not-required").length,
     total: workflowActions.length,
   };
   const setBlock = { summary, groups: groupsAfter, updated: context.changeStamp };
   const update = shouldPushCompleted
     ? {
         $set: setBlock,
         $push: {
           status: {
             $position: 0,
             $each: [{ stage: "completed", event_id: context.eventId, created: context.changeStamp }],
           },
         },
       }
     : { $set: setBlock };
   await context.mongoDBConnection("workflows").MongoDBUpdateOne({
     filter: { _id: workflow._id },
     update,
   });
   ```
   Wrap in `try/catch` and rethrow with `err.step = err.step ?? "recompute-summary"` to preserve the existing error-step propagation that `handleSubmit`'s outer `try` block reads.

8. **Return the result object** with the fields named in the JSDoc above.

### 3. Refactor `handleSubmit.js` to call the helper.

In [handleSubmit.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), replace lines 245–322 (sub-step 4a through step 5's `MongoDBUpdateOne`) with one call:

```js
const recomputeResult = await recomputeWorkflowAfterActionWrite(context, {
  workflowId: context.workflow._id,
});
```

Then update the downstream code that currently reads `groupsBefore`, `groupsAfter`, and `declaredGroups` (the completed-groups diff at lines 327–339) to read from `recomputeResult` instead:

```js
const beforeById = new Map(recomputeResult.groupsBefore.map((g) => [g.id, g]));
for (const after of recomputeResult.groupsAfter) {
  const before = beforeById.get(after.id);
  if (after.status === "done" && before?.status !== "done") {
    const cfg = (workflowConfig.action_groups ?? []).find((g) => g.id === after.id);
    completedGroups.push({
      workflow_id: context.workflow._id,
      id: after.id,
      on_complete: cfg?.on_complete ?? null,
    });
  }
}
```

Keep `workflowConfig` in scope at the diff site — it's already bound earlier in `handleSubmit` (line 92). The helper reads its own copy internally; the caller re-reads the same config to compute the diff.

Add the import at the top of `handleSubmit.js`:

```js
import recomputeWorkflowAfterActionWrite from "../../shared/recomputeWorkflowAfterActionWrite.js";
```

### 4. Do NOT touch the rest of `handleSubmit`.

- Step 6 (form_data write) stays inlined — different workflow doc write, not part of the helper.
- Steps 7–11 (log event, notifications, group fan-out, tracker subscription, post-hook) are untouched.
- The error-path early return at lines 401–409 keeps `tracker_fired: null` literally — the tracker wiring is task 3's job.

## Acceptance Criteria

- File exists at `plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.js`.
- `handleSubmit.js` imports it; sub-steps 4a/4b/4c/5 are gone from `handleSubmit.js` (replaced by the one-line call).
- The `completed_groups` diff after the helper call reads `groupsBefore` / `groupsAfter` from the helper's return object, not from local vars.
- **Behaviour parity:** every existing `handleSubmit.test.js` case passes unchanged. No new assertion edits required.
- **Helper unit test** at `plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.test.js` using `inMemoryMongo`:
  - Workflow with one non-terminal action + one terminal action → returns `shouldPushCompleted: false`; writes `summary` and `groups` but no `$push`.
  - Workflow with all actions terminal → returns `shouldPushCompleted: true`; writes the `completed` push at index 0 of `status[]`.
  - Workflow already at `completed` stage with all terminal → `shouldPushCompleted: false` (terminal guard); only `$set`, no `$push`.
  - Workflow already at `cancelled` stage with all terminal → `shouldPushCompleted: false`; only `$set`.
  - `reevaluateBlockedActions` walk pushed N action-required entries → `reEvaluatedActionIds.length === N`; second-pass `groupsAfter` reflects the post-walk state.
  - `groupsBefore` matches the workflow doc's `groups[]` before the call; `groupsAfter` matches what got written.
  - Workflow not found → throws.
  - Workflow's `workflow_type` not in `workflowsConfig` → throws.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.js` — create — helper extraction.
- `plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.test.js` — create — colocated unit tests using `inMemoryMongo`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — replace inline sub-steps 4a/4b/4c/5 with one helper call; thread the result through the completed-groups diff.

## Notes

- The helper does **not** wrap in the outer try/catch for the error-transition path — that's `handleSubmit`'s outer scope. The helper rethrows on Mongo errors; `handleSubmit`'s `try { ... } catch (err) { ... force-push error transition ... }` block (which currently spans lines 175–409) still catches them via the same step-tag propagation pattern.
- Mutating `workflowActions` in place via `splice` (step 5b refetch path) keeps a single array reference so a downstream read in the helper sees the refreshed list. Cosmetic — could also rebind, but the splice mirrors the in-place pattern the shipped handler uses on `context.workflowActions`.
- The helper reads `context.actionsConfig` after setting it from the freshly-loaded `workflowConfig`. This mutates the caller's context object — same posture `handleSubmit`'s step 1 takes. When the tracker subscription invokes the helper on a different workflow (task 2), this overwrite is what allows the parent's recompute to use the parent's actions config rather than the child's.
- **No new dependencies.** Both `recomputeGroups` and `reevaluateBlockedActions` already live in the engine; the helper imports them across the `shared/ → WorkflowAPI/` boundary (same as `shared/updateAction.js` already imports from `WorkflowAPI/SubmitWorkflowAction/utils/`).
