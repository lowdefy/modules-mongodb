# Task 8: Wire sub-steps 4a / 4b / 4c into `handleSubmit.js`; extend step 5; populate `completed_groups`

## Context

This is the load-bearing handler extension. [Shipped `handleSubmit.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) executes part 6's lifecycle through step 6 with the part-7 seam markers in place:

- **Step 4** (line ~168): per-entry write loop runs and updates `workflowActionsByType` in memory.
- **Step 5** (line ~228): summary recompute + `MongoDBUpdateOne` with `$set: { summary }`.
- **PART 7 EXTENSION marker** (lines ~250–252): notes that part 7 adds `groups[]` to the same `$set`.
- **Step 6** (line ~254): form_data write.
- **Final return** (line ~328): `completed_groups: []` placeholder per the part-7 contract.

Part 7's design slots three new sub-steps between step 4 and step 5:

| Sub-step | Work                                                                                                         | Helper                              |
| -------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 4a       | Recompute the full `groups[]` array from post-step-4 actions + declared groups                               | `recomputeGroups` (task 3)          |
| 4b       | Post-write walk: push `action-required` on every blocked action whose deps are now satisfied                 | `reevaluateBlockedActions` (task 7) |
| 4c       | Auto-complete check: if every action terminal, stage a `pushWorkflowStatus('completed')` for step 5's `$set` | `pushWorkflowStatus` (task 4)       |

Step 5 then writes `summary`, `groups[]`, and the (optional) `status` push in one Mongo `$set`. And the return shape's `completed_groups: []` placeholder gets swapped for the real entries — one per group that transitioned from non-`done` to `done` in this call.

## Task

Modify `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`.

1. **Imports.** Add at the top:

   ```js
   import recomputeGroups from "./recomputeGroups.js";
   import reevaluateBlockedActions from "./reevaluateBlockedActions.js";
   ```

   (No `pushWorkflowStatus` import — the auto-complete decision is computed inline and bundled into step 5's `$set`. See section 5.)

2. **Capture pre-write `groups[]`.** Step 1's validate already loads the workflow doc to check the terminal-workflow gate. Hold onto `workflow.groups` (the pre-submit array) at that point so 4a's diff can identify groups that transitioned to `done`. If the workflow doc isn't already held in a variable, capture it.

3. **Sub-step 4a — recompute `groups[]`.** After step 4's write loop completes (around line 226, before step 5's summary recompute), insert:

   ```js
   // Sub-step 4a — recompute groups[].
   const declaredGroups = workflowConfig.action_groups ?? [];
   const groupsAfter = recomputeGroups({
     declaredGroups,
     actions: workflowActions, // in-memory post-step-4 list, updated by step 4's loop
   });
   ```

   Confirm `workflowActions` reflects the post-write state. Step 4 already updates it in place at line ~205 ("Update the in-memory cache so step 5's summary recompute reads ..."). Re-use the same array.

4. **Sub-step 4b — re-evaluate blocked actions.** Immediately after 4a:

   ```js
   // Sub-step 4b — push action-required on newly-unblocked blocked actions.
   const reEvaluatedIds = await reevaluateBlockedActions(context, {
     workflowActions,
     actionsConfig: context.actionsConfig,
     groups: groupsAfter,
     declaredGroups,
     eventId,
   });
   ```

   After this call, `workflowActions` may need refreshing — `updateAction` writes to Mongo but doesn't necessarily mutate the in-memory array. Two options:

   - **Refetch.** Issue one `MongoDBFind` to reload actions post-walk. Simple, one extra round-trip per submit.
   - **Mutate in-memory.** Walk `reEvaluatedIds` and update each action's `status` in `workflowActions` to match what `updateAction` would have written. Faster, but couples this task to `updateAction`'s push shape.

   **Lean: refetch.** One Mongo round-trip is cheap relative to the per-entry `updateAction` calls already issued by step 4 and 4b. Avoids in-memory/DB divergence bugs.

   ```js
   if (reEvaluatedIds.length > 0) {
     workflowActions = await context.mongoDBConnection("actions").MongoDBFind({
       query: { workflow_id: payload.workflow_id },
       options: {
         /* same projection step 4 uses */
       },
     });
   }
   ```

5. **Sub-step 4c — stage auto-complete check.** After 4b:

   ```js
   // Sub-step 4c — auto-complete check (stage for step 5's $set).
   const TERMINAL = ["done", "not-required"];
   const allTerminal = workflowActions.every((a) =>
     TERMINAL.includes(a.status?.[0]?.stage),
   );
   const currentStage = workflow.status?.[0]?.stage;
   const shouldPushCompleted =
     allTerminal &&
     currentStage !== "completed" &&
     currentStage !== "cancelled";

   // The actual push lands inside step 5's $set, NOT via pushWorkflowStatus's
   // own MongoDBUpdateOne call — bundling avoids a second round-trip.
   ```

   Per the design's auto-complete section: "staged and bundled into step 5's `$set` ... in one Mongo call." Don't call `pushWorkflowStatus(...)` here to issue an immediate write — compute the same-stage decision inline and bundle the push into step 5's `MongoDBUpdateOne` (section 7 below).

   The same-stage logic mirrors `pushWorkflowStatus.js` (task 4) exactly — but uses the in-memory `workflow.status[0].stage` rather than reading from Mongo. The helper's `currentStage` parameter exists precisely for this case; here we duplicate the guard inline rather than invoking the helper for its side effect.

6. **Compute `completed_groups`.** Diff `groupsBefore` (from the workflow doc captured in step 1) against `groupsAfter`:

   ```js
   const groupsBefore = workflow.groups ?? [];
   const beforeById = new Map(groupsBefore.map((g) => [g.id, g]));
   const completedGroups = [];
   for (const after of groupsAfter) {
     const before = beforeById.get(after.id);
     if (after.status === "done" && before?.status !== "done") {
       const cfg = declaredGroups.find((g) => g.id === after.id);
       completedGroups.push({
         workflow_id: payload.workflow_id,
         id: after.id,
         on_complete: cfg?.on_complete ?? null,
       });
     }
   }
   ```

   Per [design.md § completed_groups return shape](../design.md#completed_groups-return-shape): one entry per group that transitioned from non-`done` to `done` in this call, with the `on_complete` Api id from the workflow YAML (or null).

7. **Extend step 5's `$set` block** (around line 229–246). Today it issues:

   ```js
   await context.mongoDBConnection("workflows").MongoDBUpdateOne({
     filter: { _id: payload.workflow_id },
     update: {
       $set: {
         summary,
         updated: context.changeStamp,
       },
     },
   });
   ```

   Extend to:

   ```js
   const setBlock = {
     summary,
     groups: groupsAfter,
     updated: context.changeStamp,
   };

   const pushBlock = shouldPushCompleted
     ? {
         status: {
           $position: 0,
           $each: [
             {
               stage: "completed",
               event_id: eventId,
               created: context.changeStamp,
             },
           ],
         },
       }
     : null;

   await context.mongoDBConnection("workflows").MongoDBUpdateOne({
     filter: { _id: payload.workflow_id },
     update: pushBlock
       ? { $set: setBlock, $push: pushBlock }
       : { $set: setBlock },
   });
   ```

   One Mongo call writes summary + groups + the (optional) completed status push. Matches the design's "one Mongo update" commitment.

   **Remove the `// PART 7 EXTENSION:` marker comment** — the extension has landed.

8. **Update the return shape.** The final return at line ~328 currently has `completed_groups: []`. Replace with the computed `completedGroups`:

   ```js
   return {
     action_ids: writtenActionIds,
     completed_groups: completedGroups,
     event_id: eventId,
     tracker_fired: null,
     pre_hook_response: null,
     post_hook_response: null,
   };
   ```

9. **Error-transition path.** Around line 307, the mid-write try/catch returns a partial result with `completed_groups: []`. Per [engine spec § Action error transition](../../../../workflows-module-concept/engine/spec.md#action-error-transition), error transitions "skip remaining auto-complete / tracker-subscription / group-rollup work." Leave the error-path `completed_groups: []` as-is — it correctly signals "no groups completed in this call." The diff above only fires on the success path.

## Acceptance Criteria

- `handleSubmit.js` imports `recomputeGroups` and `reevaluateBlockedActions`. The auto-complete decision uses an inline same-stage check (no call to `pushWorkflowStatus`); the push lands inside step 5's bundled `$set`.
- Sub-step 4a runs after step 4's write loop, computes `groupsAfter` from `workflowActions` and `declaredGroups`.
- Sub-step 4b runs after 4a, awaits `reevaluateBlockedActions`, refetches `workflowActions` when entries were pushed.
- Sub-step 4c stages the auto-complete decision (in-memory same-stage check; no separate Mongo write).
- Step 5's `$set` includes `summary`, `groups`, and `updated`. When 4c stages a completed push, the same `MongoDBUpdateOne` adds `$push: { status: ... }`.
- `completed_groups` in the return shape is computed by diffing `groupsBefore` (from step 1's loaded workflow doc) against `groupsAfter`, with `on_complete` resolved from the workflow YAML.
- The `// PART 7 EXTENSION:` seam marker is removed.
- The error-transition partial-return path keeps `completed_groups: []`.
- All existing part-6 unit tests in `handleSubmit.test.js` still pass (the contract change to step 5 is additive — `summary` is still written; `form_data` write unchanged).
- New tests in `handleSubmit.test.js`:
  - Submitting the last non-terminal action in a group transitions that group to `done`; the return shape includes one `completed_groups` entry with the right `workflow_id` / `id` / `on_complete`.
  - The workflow doc's `groups[]` field reflects the post-submit state (declaration order, full array).
  - When a group has `on_complete: <api-id>` declared, the `completed_groups` entry carries that id; when not declared, `on_complete: null`.
  - Auto-complete: a submit that takes every action to terminal pushes `{ stage: 'completed' }` onto the workflow's `status[]`. Same-stage guard: a retry doesn't double-push.
  - `blocked_by` re-evaluation: an action with `blocked_by: [some-group]` flips from `blocked` to `action-required` exactly when the group enters `done` — verify by submitting an action that completes the group, then asserting the downstream action's new status.
  - Mixed `blocked_by` (action types + group ids): downstream action stays blocked until both kinds resolve.
  - One Mongo write per workflow doc per submit (verify via spy on `MongoDBUpdateOne` against the workflows collection in step 5 — exactly one call after step 4's loop).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — wire sub-steps 4a, 4b, 4c; extend step 5's `$set`; populate `completed_groups`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — add the integration cases above.

## Notes

- This task depends on tasks 3, 4, 6, 7 having landed. Task 6 (extended `computeAutoUnblocks` to accept `groups` / `declaredGroups`) requires updating the existing `computeAutoUnblocks` call site in step 3 — that change might land in task 6 itself or here. Be explicit at implementation time: if task 6 already updated the call site, just verify; otherwise pass the new args at the call site here.
- The refetch in 4b is a perf concession. v2 could mutate `workflowActions` in place inside the walk to avoid the round-trip. For v1, the explicit refetch is easier to reason about and easier to test.
- The "stage in-memory, bundle into step 5's `$set`" pattern keeps the workflow-doc write count at exactly one per success path. If a future caller needs `pushWorkflowStatus` to write immediately (e.g. part 10's tracker subscription, which writes a parent workflow's status mid-handler), the helper supports both modes — this task just picks the bundled mode for the auto-complete use case.
- `workflow` (the in-memory workflow doc from step 1) is the source of pre-submit `groups[]`. If step 1 doesn't currently hold it in a variable, refactor step 1 to keep the loaded doc rather than re-fetching here. The terminal-workflow gate already needs `workflow.status[0].stage`, so step 1 must be loading it.
