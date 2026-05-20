# Part 10 — Tracker subscription

**Source rationale:** [workflows-module-concept/engine/spec.md](../../../workflows-module-concept/engine/spec.md). **Layer:** engine handlers. **Size:** S. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Goal

Mirror child workflow status changes into the parent tracker action synchronously and in-process. After this part, completing a child workflow flips the parent's tracker action to `done`; cancelling the child flips it to `not-required`; reopening the child flips it back to `in-progress`.

## In scope

### Trigger sites

The subscription fires inside every handler that changes a workflow's status:

- `SubmitWorkflowAction` — light up the body of step 10 (currently a TODO comment in [handleSubmit.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) between step 9's group fan-out from [part 11](../11-group-on-complete-fanout/design.md) and step 11's post-hook). When step 5's bundled `$set` (the `update = shouldPushCompleted ? { ... }` block in `handleSubmit.js`) included the `completed` `$push` (i.e. auto-complete fired), invoke the subscription with `newStage: 'completed'`. If no workflow-status push happened in this call, no-op.
- `CancelWorkflow` — after the final summary + groups writeback at [CancelWorkflow.js:118–127](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js), before the return. Fires with `newStage: 'cancelled'`. The handler's return shape already includes `tracker_fired: null` at line 132; the subscription replaces it with the fire array (see step 7 of "Logic" for the shape) — empty when no parent was written.

### Logic

For the workflow whose status just changed:

1. Read `parent_action_id`. If null, no-op.
2. Look up the parent tracker action by primary key. If missing (shouldn't happen, but guard), log and no-op.
3. Apply the hard-coded child-stage map:
   - `active` → `in-progress`
   - `completed` → `done`
   - `cancelled` → `not-required`
4. **Same-stage guard.** Compare `tracker.status?.[0]?.stage` against `targetStage` from step 3. If equal, no-op (don't write, don't surface `tracker_fired`). The tracker fetch in step 2 already returned the status, so this is one comparison with no extra DB read. Restates the same-stage guard the action priority-rule would otherwise have provided — `force: true` bypasses the priority rule, so the subscription must check directly. Same posture as `pushWorkflowStatus`'s idempotency guard for workflow-status writes.
5. Push the new status to the parent action via `shared/updateAction.js` with `force: true`. Per-action call shape: `updateAction(context, { actionId: tracker._id, newStage: targetStage, eventId, currentActionId: null, force: true })`. The concept spec's pseudo-code at [engine/spec.md § Tracker subscription](../../../workflows-module-concept/engine/spec.md#tracker-subscription) uses the handler-level `actions: [...]` shape; that is not the helper's API — engine-internal force-pushes call the per-action helper directly.

   **`eventId` propagation.** On the submit path, the parent-action status entry carries the originating submit's `eventId` (threaded through from `handleSubmit`'s entry — same id every other write in this invocation uses). Each recursion level inherits the same `eventId`, so in a multi-level chain the grandparent's tracker entry references the leaf submit's log event. No separate "tracker-fire" event is generated in v1 — part 8's `dispatchLogEvent` does not run for the tracker write itself. On the cancel path, `CancelWorkflow` doesn't generate an event in v1 ([part 5](../05-start-cancel-handlers/design.md), event lands in [part 8](../08-side-effect-dispatch/design.md)), so the parent-action status entry's `event_id` is `null`. Implementers should not synthesize a fresh id on the cancel path.
6. Run the parent workflow's post-write recompute pass (groups, `blocked_by` re-evaluation, auto-complete, summary writeback) via the shared helper described in "Implementation" below. If the recompute pushed the parent workflow to `completed`, recurse: fire the parent's own tracker subscription against its parent. The depth-limit guard from [engine spec § Open questions](../../../workflows-module-concept/engine/spec.md#open-questions-in-scope-deferred) caps runaway recursion at 10 levels and throws a clear error on overflow.
7. Surface the fan-up on the originating submit response as `tracker_fired: Array<{ parent_action_id, parent_workflow_id, new_status }>` — empty when no fire, one entry per level (newest at index 0). `parent_workflow_id` is read from the fetched tracker action's `workflow_id` field (the action doc's own `workflow_id`, per [engine spec § Schema](../../../workflows-module-concept/engine/spec.md#schema)). No extra DB read — the tracker fetch in step 2 already returns it.

### Implementation

- New file: `src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` (also called from `CancelWorkflow.js`).
- Reuses `shared/updateAction.js` (introduced as a scaffold in [part 5](../05-start-cancel-handlers/design.md#shared-internal-helpers-in-srcconnectionsshared); priority-rule branch added by [part 6](../06-submit-action-writes/design.md)) for the parent write. The subscription invokes it with `force: true` per [engine spec § Tracker subscription](../../../workflows-module-concept/engine/spec.md#tracker-subscription).
- **Post-write recompute helper extraction.** Extract `handleSubmit`'s post-action-write portion — sub-steps 4a (`recomputeGroups`), 4b (`reevaluateBlockedActions`), 4c (auto-complete check), and 5 (bundled `summary` + `groups` + optional `completed` `$set`) — into a shared helper `src/connections/shared/recomputeWorkflowAfterActionWrite.js`. Both `handleSubmit` and `fireTrackerSubscription` invoke it. The helper takes a fresh `workflowId` and reads the workflow doc + actions inside (the originating handler's `context.workflow`/`workflowActions` caches are stale across workflows). This is the only structural change to part 6's `handleSubmit`: the body of those sub-steps moves out behind a one-line call; the file otherwise keeps its lifecycle shape.
- **Recursion path.** When the parent recompute returns a "workflow pushed `completed`" signal, `fireTrackerSubscription` recurses with `parentWorkflowId` as the new `workflowId`. Engine-internal writes do **not** re-enter the public `SubmitWorkflowAction` handler — that path runs user-facing validation (role gate, terminal-workflow gate, `interaction` → target-status resolution) that doesn't apply to engine-internal force-pushes, and the engine spec explicitly says engine-internal force-pushes call `updateAction(...force: true)` directly rather than reconstructing a handler payload ([engine/spec.md:307](../../../workflows-module-concept/engine/spec.md)).
- **Depth-limit guard.** Cap recursion at 10 levels (constant in `fireTrackerSubscription.js`); throw a structured error on overflow. Picks up the cycle-protection commitment from [engine spec § Open questions](../../../workflows-module-concept/engine/spec.md#open-questions-in-scope-deferred).
- The child-stage map is a `const` at the top of `fireTrackerSubscription.js`, exported as `CHILD_STAGE_MAP` for testability (the unit-test table iterates over its entries to assert each mapping). Both `SubmitWorkflowAction` and `CancelWorkflow` import the function; only tests import the constant directly.
- No `populateIds` call — the subscription updates an existing tracker action document via `MongoDBUpdateOne`, no new ids generated.
- **`handleSubmit` return-shape wiring.** Replace the two hard-coded `tracker_fired: null` literals in [handleSubmit.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) (one in the error-path partial return inside the outer `catch` block, one in the success-path return at the bottom) — replace the success-path literal with a `trackerFired` local populated by `fireTrackerSubscription`; keep the error-path literal so no subscription runs on the error path. Same wiring in `CancelWorkflow` at the final return of [CancelWorkflow.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js).

## Out of scope / deferred

- **Hierarchical cancel propagation** (cancel parent ⇒ cancel children). Not in v1. Subscription only goes child→parent.
- **Multi-parent tracker scenarios.** Concept enforces one-parent-per-child in `StartWorkflow` ([part 5](../05-start-cancel-handlers/design.md)).
- **Async / change-stream variant.** Concept defers to a follow-up if multi-process writers surface.
- **Hooks on tracker transitions** — tracker actions never receive user submissions; per-hook contract doesn't apply.

## Depends on

[Part 5](../05-start-cancel-handlers/design.md), [part 6](../06-submit-action-writes/design.md), [part 7](../07-group-state-machine/design.md) (auto-complete is the most common trigger).

## Verification

- Unit tests:
  - `active` push fires parent `in-progress`; `completed` fires `done`; `cancelled` fires `not-required`.
  - No-op when workflow has no `parent_action_id`.
  - Re-firing the same stage is a no-op because of two layered guards: (a) the upstream same-stage check on the workflow's status push (`handleSubmit`'s auto-complete predicate — the `shouldPushCompleted` block in [handleSubmit.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) skips the `completed` push when the workflow is already terminal); (b) the explicit same-stage guard inside `fireTrackerSubscription` (step 4 of "Logic" above). The tracker write itself uses `force: true` — the priority rule does **not** guard it. Test the downstream guard directly: re-fire tracker on an already-`done` parent action no-ops without writing audit history.
  - `tracker_fired` array populated on the originating submit response — one entry per recursion level, newest at index 0; empty array when no parent was written.
- Integration test using the worked-example: completing the child `device-installation` workflow flips the parent's `track-installation` to `done` in one server-side call.
- **Cache invariant — multi-level recurse.** 3-level auto-complete chain (grandchild C auto-completes → child B auto-completes → parent A auto-completes). Assert each level's persisted `summary` and `groups[]` reflect that level's own action list, not a stale cache from an outer-scope workflow. Catches the failure mode where an implementer threads the originating handler's `context.workflow`/`context.workflowActions` into the recompute helper instead of letting it fetch fresh per `workflowId`.
- **Depth-limit overflow.** A synthetic 11-level chain throws the structured depth-limit error and writes no state past level 10.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Notes

- **Client model.** The subscription reuses the originating handler's `context.mongoDBConnection` dispatcher — same posture as every other helper inside the handler invocation. No transaction wrapping in v1 ([engine spec § Client and transaction model](../../../workflows-module-concept/engine/spec.md#client-and-transaction-model)). Settled by the engine architecture; not an open question.

## Open questions

None.

## Contract to neighbours

- **Part 11** runs **before** this part in the lifecycle ordering — step 9 (group `on_complete` fan-out, owned by [part 11](../11-group-on-complete-fanout/design.md)) executes before step 10 (tracker subscription, this part), per part 6's submit-pipeline numbering and [part 11 design.md:26](../11-group-on-complete-fanout/design.md). This part reads workflow status from step 5's `$set` (auto-complete push) and the just-written parent action status; it does not depend on part 11's fan-out results. The parent workflow's groups recompute happens on the parent's next submit, not now.
