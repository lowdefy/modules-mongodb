# Task 9: Extend `CancelWorkflow.js` — fold `groups[]` recompute into the existing summary recompute

## Context

[Shipped `CancelWorkflow.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) (part 5) already:

1. Pushes `{ stage: 'cancelled', ... }` onto the workflow's `status[]`.
2. Flips every non-terminal action to `not-required` with `force: true`.
3. Re-reads all actions with projection `{ 'status.0.stage': 1 }` (line 86–92).
4. Computes `summary` counts in memory.
5. Writes `summary` via one `MongoDBUpdateOne` (line 100–108).

Part 7 folds `groups[]` recompute into that existing pass — no new round-trip. The design is explicit:

> Extend the projection to include `action_group`, compute `groups[]` from the same in-memory action list (every group lands at `done` per the empty-group convention — every action is terminal post-cancel), and `$set` both `summary` and `groups` in the same `MongoDBUpdateOne`.

And:

> `CancelWorkflow` does **not** compute or return `completed_groups`. Per concept, `on_complete` hooks do not fire on cancel; the handler's return shape stays `{ action_ids, event_id: null, tracker_fired: null }` and part 11's fan-out reads `completed_groups` only from `SubmitWorkflowAction`'s return.

The "every group lands at `done`" claim follows from `deriveGroupStatus`: every action is terminal (`done` or `not-required`) post-cancel, so every non-empty group's status derives to `done`; empty groups are `done` by convention. The recompute is therefore correct without any cancellation-specific logic.

## Task

Modify `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js`.

1. **Import `recomputeGroups`.**

   ```js
   import recomputeGroups from '../SubmitWorkflowAction/recomputeGroups.js';
   ```

   Cross-folder import (same pattern as task 5's `StartWorkflow` extension). `recomputeGroups` lives in `SubmitWorkflowAction/` because that's where the group state machine code lives.

2. **Extend the projection.** At line 90, change:

   ```js
   options: {
     projection: { 'status.0.stage': 1 },
   },
   ```

   to:

   ```js
   options: {
     projection: { 'status.0.stage': 1, action_group: 1 },
   },
   ```

3. **Load the workflow's declared groups.** The handler already has `context.workflowsConfig` in scope (set up at the top of the function). To compute `groups[]` we need the declared `action_groups` for this workflow type:

   ```js
   const workflowDoc = await context.mongoDBConnection('workflows').MongoDBFindOne({
     query: { _id: payload.workflow_id },
     options: { projection: { workflow_type: 1 } },
   });
   const workflowConfig = (context.workflowsConfig ?? []).find(
     (w) => w.type === workflowDoc?.workflow_type,
   );
   const declaredGroups = workflowConfig?.action_groups ?? [];
   ```

   Or — to avoid the extra round-trip — capture the workflow doc earlier in the handler when it's first read (the status push at line 43–57 doesn't currently read the workflow doc first; it's a blind `$push`). The cheapest path is to add a one-time read of `workflow_type` at the top of the handler, hold it in scope, and re-use through the cancel + summary + groups computation.

   **Lean: one read at the top of the handler.** Adds one Mongo find but lets the handler reason about `workflowConfig` consistently with `StartWorkflow.js` and `SubmitWorkflowAction/handleSubmit.js`.

4. **Compute `groups[]` from the in-memory action list.** After the `allActions` find (currently line 86–92), before the summary computation:

   ```js
   const groups = recomputeGroups({
     declaredGroups,
     actions: allActions,
   });
   ```

5. **Add `groups` to the final `$set`.** At lines 100–108:

   ```js
   await context.mongoDBConnection('workflows').MongoDBUpdateOne({
     filter: { _id: payload.workflow_id },
     update: {
       $set: {
         summary: { done, not_required, total },
         groups,
         updated: context.changeStamp,
       },
     },
   });
   ```

6. **Return shape stays unchanged.** At line 110:

   ```js
   return { action_ids: actionIds, event_id: null, tracker_fired: null };
   ```

   No `completed_groups` key — even though every group transitioned to `done`, cancellation doesn't fire `on_complete` hooks. Leave the return shape exactly as it is. Optionally add a one-line code comment naming the design contract:

   ```js
   // NOTE: do NOT include completed_groups — per part 7 design,
   // CancelWorkflow doesn't fire on_complete hooks. Part 11's fan-out
   // reads completed_groups only from SubmitWorkflowAction's return.
   ```

## Acceptance Criteria

- `CancelWorkflow.js` imports `recomputeGroups` from `../SubmitWorkflowAction/recomputeGroups.js`.
- The projection at the all-actions find includes `action_group`.
- The handler loads (or already has) the workflow's `workflow_type` so it can resolve `workflowConfig.action_groups`.
- `groups[]` is computed via `recomputeGroups` from the same in-memory action list used for `summary`.
- The final `MongoDBUpdateOne` includes `groups` in its `$set` block alongside `summary`.
- **One** `MongoDBUpdateOne` per cancel — the count of workflow-doc writes is unchanged from the shipped handler.
- The return shape stays `{ action_ids, event_id: null, tracker_fired: null }` — no `completed_groups`.
- All shipped `CancelWorkflow` tests still pass.
- New tests in `CancelWorkflow.test.js` (uses `inMemoryMongo`):
  - Cancel a workflow with `action_groups: [{ id: 'phase-1' }, { id: 'phase-2' }]` and actions distributed across both — after cancel, the workflow doc has `groups: [{ id: 'phase-1', status: 'done', summary: { done: 0, not_required: <N>, total: <N> } }, { id: 'phase-2', status: 'done', summary: { done: 0, not_required: <M>, total: <M> } }]`.
  - Cancel a workflow with one empty group — that group is `{ id, status: 'done', summary: { done: 0, not_required: 0, total: 0 } }`.
  - Cancel a workflow where some actions were already `done` before cancel — `summary.done` reflects the pre-existing dones, `summary.not_required` reflects the newly-cancelled actions. Groups still all `done`.
  - Cancel returns `{ action_ids: [...], event_id: null, tracker_fired: null }` — no `completed_groups` key. Assert the key is absent (not just falsy).
  - Single Mongo write to the workflows collection after the cancel push (the status push at line ~43 is one; the summary+groups `$set` is the second; no third write).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — modify — import `recomputeGroups`, load workflow type, extend projection, fold `groups` into the existing `$set`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.test.js` — modify (or create if missing) — add the groups-recompute cases above.

## Notes

- This task is independent of every submit-pipeline task (task 8) — it only touches `CancelWorkflow.js`. Can ship after tasks 1 + 3 land, in any order relative to tasks 5–8.
- The status push at `CancelWorkflow.js:43–57` issues a `$push` with `{ stage: 'cancelled', ... }`. It doesn't use the new `pushWorkflowStatus.js` helper (task 4) — migrating it is out of scope per [task 4 § Notes](./04-push-workflow-status.md#notes): the same-stage guard isn't load-bearing for cancel (single push from a known `active` state).
- If `createAction.js` (part 5) doesn't currently propagate `action.action_group` onto the action doc, the projection at the all-actions find returns `action_group: undefined` for every action, and every group would compute as empty (`status: 'done'`, `total: 0`). Verify the propagation in task 5's Acceptance Criteria; if missing there, this task depends on that fix.
- The workflow-doc `workflow_type` read can be skipped if the cancel call site already has the workflow doc in memory. v1 keeps it explicit so the handler is self-contained; v2 could thread it through `context.params` if a real perf concern surfaces.
