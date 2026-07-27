# Task 2: `fireTrackerSubscription.js` — child→parent tracker mirror with multi-level recursion

## Context

After a workflow's status changes (auto-complete in `SubmitWorkflowAction` or cancel in `CancelWorkflow`), the engine mirrors the change onto the parent tracker action — that's the part 10 contract. The child workflow's `parent_action_id` (written by `StartWorkflow`'s parent-link in [StartWorkflow.js:117–129](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js)) points at the tracker; the subscription reads it, looks up the tracker action, applies the hard-coded child-stage map, force-writes the tracker, and then recurses into the parent workflow's recompute so the parent's own auto-complete (and its own tracker fire) can fan up.

The recursion is engine-internal — it does NOT re-enter the public `SubmitWorkflowAction` handler. Per [engine spec § Priority rule](../../../workflows-module-concept/engine/spec.md#priority-rule):

> Engine-internal force-pushes ... call `updateAction(...force: true)` directly rather than reconstructing a handler payload — they're already inside the handler invocation and don't need to re-enter through the payload surface.

This file is the seam where part 10's two trigger sites (`SubmitWorkflowAction` and `CancelWorkflow`) meet the parent-write + recompute + recurse loop. Tasks 3 and 4 wire it into those handlers.

## Task

### 1. Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js`.

Module shape:

```js
import updateAction from "../../shared/updateAction.js";
import recomputeWorkflowAfterActionWrite from "../../shared/recomputeWorkflowAfterActionWrite.js";

/**
 * Child workflow stage → parent tracker action stage. Module-level constant;
 * not configurable per concept design ([engine/spec.md § Tracker subscription]).
 * Exported for testability — the unit-test table iterates entries to assert
 * each mapping.
 */
export const CHILD_STAGE_MAP = {
  active: "in-progress",
  completed: "done",
  cancelled: "not-required",
};

/**
 * Maximum tracker-recursion depth. Picks up the cycle-protection commitment
 * from [engine/spec.md § Open questions]. Throws a structured error on overflow
 * rather than silently truncating — surfaces pathological linking immediately.
 */
const MAX_DEPTH = 10;

/**
 * Mirror a workflow status change onto its parent tracker action. Recurses
 * when the parent's own recompute pushes the parent workflow to `completed`.
 *
 * Trigger sites:
 *   - `handleSubmit` step 10, after auto-complete pushed `completed` in step 5's
 *     bundled $set (task 3).
 *   - `CancelWorkflow`, after the final summary + groups writeback (task 4).
 *
 * @param {Object} context — engine handler context (`mongoDBConnection`,
 *   `changeStamp`, `eventId`, `workflowsConfig`, `actionsEnum`).
 * @param {Object} options
 * @param {string} options.workflowId — the workflow whose status just changed.
 * @param {'active' | 'completed' | 'cancelled'} options.newStage — the child
 *   workflow's new lifecycle stage.
 * @param {number} [options.depth] — recursion depth counter. Callers pass 0
 *   (or omit); the function increments on each recurse.
 * @returns {Promise<Array<{ parent_action_id: string, parent_workflow_id: string, new_status: string }>>}
 *   The fire chain — newest at index 0, empty array when no parent was written.
 *   One entry per level in the chain.
 */
async function fireTrackerSubscription(
  context,
  { workflowId, newStage, depth = 0 },
) {
  // ...
}

export default fireTrackerSubscription;
```

### 2. Function body — implement the 7-step "Logic" sequence from the design.

1. **Depth-limit guard.** If `depth >= MAX_DEPTH`, throw:

   ```js
   const err = new Error(
     `fireTrackerSubscription: depth limit (${MAX_DEPTH}) exceeded — possible cycle in workflow parent linking`,
   );
   err.step = "tracker-subscription";
   throw err;
   ```

2. **Load the child workflow doc.** One-shot find with projection limited to `parent_action_id`:

   ```js
   const child = await context.mongoDBConnection("workflows").MongoDBFindOne({
     query: { _id: workflowId },
     options: { projection: { parent_action_id: 1 } },
   });
   if (!child) return [];
   if (child.parent_action_id == null) return [];
   ```

3. **Load the parent tracker action.** Use the shipped helper [shared/getActionFields.js](../../../../plugins/modules-mongodb-plugins/src/connections/shared/getActionFields.js) (projects `_id`, `workflow_id`, `type`, `key`, `kind`, `status`, `entity_id`, `entity_collection`, `tracker`, `child_workflow_id`):

   ```js
   const tracker = await getActionFields(
     context.mongoDBConnection,
     child.parent_action_id,
   );
   if (!tracker) return [];
   ```

   Add the import: `import getActionFields from "../../shared/getActionFields.js";`.

4. **Apply the child-stage map.** Map `newStage` → `targetStage`. If `CHILD_STAGE_MAP[newStage]` is undefined, return `[]` (defensive — keeps the helper inert on stage values outside the table rather than throwing).

5. **Same-stage guard.** Compare `tracker.status?.[0]?.stage` against `targetStage`. If equal, return `[]` — no write, no entry in the fire chain. Restates the same-stage guard the action priority rule would otherwise have provided (`force: true` bypasses the priority rule, so the helper must check directly). Mirrors `pushWorkflowStatus`'s posture for workflow-status writes.

6. **Write the parent action.** Call `updateAction` with `force: true`. The shipped helper signature at [shared/updateAction.js:36–46](../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js) takes the per-action shape:

   ```js
   await updateAction(context, {
     actionId: tracker._id,
     newStage: targetStage,
     fields: {},
     eventId: context.eventId,
     currentActionId: null,
     force: true,
   });
   ```

   `context.eventId` propagation: on the submit path this is the originating `SubmitWorkflowAction`'s eventId (threaded through every write in the invocation). On the cancel path it's `null` (task 4 calls this helper with `context.eventId = null` because `CancelWorkflow` doesn't generate an event in v1; see [part 8](../../08-side-effect-dispatch/design.md)). Don't synthesize a fresh id on the cancel path — `null` is the contract.

7. **Run the parent workflow's recompute** via the helper from task 1:

   ```js
   const parentResult = await recomputeWorkflowAfterActionWrite(context, {
     workflowId: tracker.workflow_id,
   });
   ```

8. **Build this level's fire entry.** Per [engine spec § Schema](../../../workflows-module-concept/engine/spec.md#schema), the tracker action's own `workflow_id` is the parent workflow's id — exactly the `parent_workflow_id` callers expect:

   ```js
   const thisFire = {
     parent_action_id: tracker._id,
     parent_workflow_id: tracker.workflow_id,
     new_status: targetStage,
   };
   ```

9. **Recurse if the parent auto-completed.** If `parentResult.shouldPushCompleted === true`, recurse:
   ```js
   const upstreamFires = await fireTrackerSubscription(context, {
     workflowId: tracker.workflow_id,
     newStage: "completed",
     depth: depth + 1,
   });
   return [thisFire, ...upstreamFires];
   ```
   Otherwise return `[thisFire]`. The newest fire sits at index 0 so callers can read "this level's parent" as `result[0]`.

## Acceptance Criteria

- File exists at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js`.
- Default export is the `fireTrackerSubscription` function with the signature above.
- Named export `CHILD_STAGE_MAP` carries the three entries `{ active: "in-progress", completed: "done", cancelled: "not-required" }`.
- `MAX_DEPTH` is `10`; overflow throws the structured error with `err.step = "tracker-subscription"`.
- No-op (`return []`) when: workflow not found; `parent_action_id` is `null`; tracker action not found; `targetStage === tracker.status?.[0]?.stage`.
- The `updateAction` call uses `force: true` and the per-action shape (`actionId`, `newStage`, …) — NOT the handler-level `actions: [...]` shape.
- Recursion only fires when `parentResult.shouldPushCompleted === true`.
- Colocated `fireTrackerSubscription.test.js` using `inMemoryMongo` covers:
  - **Table-driven mapping.** Iterate `CHILD_STAGE_MAP` entries; each child stage produces the documented parent stage.
  - **No parent.** Workflow with `parent_action_id: null` → returns `[]`, no Mongo writes.
  - **Tracker missing.** Workflow with `parent_action_id` pointing at a non-existent action → returns `[]`, no writes.
  - **Same-stage guard.** Tracker already at `done`, fire with `newStage: 'completed'` → returns `[]`, no write to the tracker, no recompute called. (Mock or spy on the helper to assert no recompute.)
  - **One-level happy path.** Child auto-completes; parent has multiple actions including the tracker; parent does NOT auto-complete → returns one fire entry; tracker action in DB now has `done` at status[0]; parent workflow `summary` reflects the tracker's new state.
  - **Two-level recurse.** Child auto-completes; parent is single-action (just the tracker) so parent also auto-completes → returns two fire entries (newest first); grandparent tracker (if present) updated; depth counter incremented correctly.
  - **`event_id` propagation.** With `context.eventId = 'E1'` the parent action's pushed status entry carries `event_id: 'E1'`.
  - **`event_id: null` on cancel path.** With `context.eventId = null` the parent's status entry carries `event_id: null`. No synthetic id.
  - **Depth-limit overflow.** Construct a synthetic 11-level chain (or stub recompute to always report `shouldPushCompleted: true` and feed a self-referential parent); the call throws with `err.step === "tracker-subscription"` and the message references the depth limit.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` — create — the helper + `CHILD_STAGE_MAP` const.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.test.js` — create — colocated unit tests using `inMemoryMongo`.

## Notes

- **No `populateIds`.** The subscription updates an existing action via `updateAction` → `MongoDBUpdateOne`. No new ids generated.
- The helper does NOT touch the child workflow's `tracker_fired` return field — that wiring lives in the call sites (tasks 3 and 4). This helper just returns the fire chain; callers decide where it lands in their response shape.
- **Why call `recomputeWorkflowAfterActionWrite` rather than re-entering `SubmitWorkflowAction`?** `SubmitWorkflowAction`'s step 1 validation runs user-facing checks (role gate, terminal-workflow gate, interaction → status resolution) that don't apply to engine-internal force-pushes. The engine spec at [engine/spec.md:307](../../../workflows-module-concept/engine/spec.md) settled this: engine-internal force-pushes bypass the public handler payload surface entirely. The post-write recompute helper is the right granularity — it does the work the parent needs (auto-complete, summary, groups) without invoking the user-facing validation gates.
- **Why depth limit 10?** The engine-spec open question commits to a runtime depth-limit guard with default 10. v1 doesn't statically prove acyclicity — real apps with pathological parent linking surface as a clear error rather than a stack overflow or infinite Mongo writes.
- **Why is `getActionFields`'s projection enough?** It projects `_id`, `workflow_id`, `status`, and other core fields — covers both the same-stage guard (reads `status[0].stage`) and the fire-entry construction (reads `workflow_id` as `parent_workflow_id`). No need to fetch the full action doc.
- This helper is async-internal — callers `await` it. The recursion is a tail call in shape but JavaScript doesn't optimize tail calls; that's fine because the depth limit is 10 (small stack).
