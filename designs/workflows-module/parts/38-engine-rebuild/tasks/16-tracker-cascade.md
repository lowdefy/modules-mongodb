# Task 16: Tracker cascade loop

## Context

`fireTrackerSubscription.js` is today a recursive function with shared engine context across parent workflows. Load-plan-commit makes that impossible (the Plan is per-aggregate — recursion can't share it). It becomes a **loop**, where each level runs its own load-plan-commit cycle on its own parent workflow. The per-level Plan reuses 100% of the per-Submit planner machinery (task 15); the only new piece is `planTrackerLevel`, a thin wrapper that emits the mirror signal then delegates to the same auto-unblock/recompute logic.

## Task

**Rewrite `WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js`** into `runTrackerCascade` (D10):

```js
async function runTrackerCascade(initialFires, baseContext) {
  let pendingFires = initialFires.map((f) => ({ ...f, depth: 1 }));
  while (pendingFires.length > 0) {
    const fire = pendingFires.shift();
    if (fire.depth > MAX_DEPTH) throw new TrackerCascadeDepthError(fire);
    const levelContext = { ...baseContext, /* per-level overrides */ };
    const levelLoaded = await loadWorkflowState(levelContext, { workflowId: fire.parentWorkflowId });
    const levelPlan = await planTrackerLevel(levelLoaded, { parentActionId: fire.parentActionId, signal: fire.signal });
    const commitResult = await commitPlan(levelContext, levelPlan);
    pendingFires.push(...levelPlan.trackerFires.map((f) => ({ ...f, depth: fire.depth + 1 })));
  }
}
```

- **`MAX_DEPTH = 10` guard tracks chain depth, not loop iterations.** Each fire carries a `depth` field seeded at 1, incremented per level. A wide-but-shallow cascade (one workflow with many tracker parents) must **not** trip the guard; a genuinely deep cycle must. A single dequeue counter on the BFS loop would measure total fan-out (breadth), not depth — do **not** use that.
- Define `TrackerCascadeDepthError extends WorkflowEngineError` (`code: "tracker_depth_exceeded"`) in `shared/errors.js` — engine throws share the D13 error model (base class created by task 9); it keeps a named class like `ConcurrentSubmitError`, but callers/tests discriminate on `code`.
- **Collect per-level dispatch errors; don't stop the cascade for them.** Each level's `commitPlan` may record post-commit dispatch failures on its `CommitResult.dispatchErrors[]` (task 13 failure policy). `runTrackerCascade` accumulates these across levels and returns them, so the handler folds them into its single end-of-invocation `post_commit_dispatch_failed` throw (task 15). A level's dispatch failure never prevents the remaining fires from running — only a steps-1–2 throw (e.g. `ConcurrentSubmitError`) propagates.
- **Return the accumulated fire list alongside the dispatch errors.** The handler's `tracker_fired` return key (task 15) and the post-hook `result` bag (task 14) read the cascade's per-level fire list in **today's shape** — `[{ parent_action_id, parent_workflow_id, new_status }]`, `new_status` the FSM-resolved parent stage (review-11 #2; this is the existing `tracker_fired` consumer contract, `makeWorkflowApis.js` `:return`).

**Create `shared/phases/planners/planTrackerLevel.js`:**

- Emits the mirror signal (`internal_mirror_child_active` / `_completed` / `_cancelled`) against the parent's target action, then delegates to the same `planActionTransition` / `planAutoUnblock` / `planWorkflowRecompute` machinery as Submit.
- Emits an `action-internal-mirror-{state}` event (action-event context, per task 12) — the mirror has a single target action.
- **No-op levels short-circuit before commit (D3).** When the mirror signal FSM-no-ops against the parent's target action (`resolveSignal` returns null — cascade signals no-op silently, task 10), the level changed nothing: no transitions, so recomputed groups/summary equal the loaded ones. `planTrackerLevel` returns an empty plan and the loop **skips `commitPlan` for that level entirely** — no parent workflow write (no `updated` stamp advance, which would create spurious CAS pressure on concurrent real submits against the parent), no mirror event, no change-log entries, no further `trackerFires` from that level. `commitPlan` is never asked to detect emptiness; the caller owns the skip.

**Wire `runTrackerCascade` into the Submit handler** (task 15's call site) and any other handler that produces `trackerFires` (Start's parent-tracker push, Cancel/Close cascades — task 17).

## Acceptance Criteria

- Tracker recursion is a loop; each level is its own independently-atomic load-plan-commit cycle with no shared in-memory state.
- The depth guard tracks **chain depth** per fire (seeded 1, +1 per level) — a wide shallow cascade does not trip it; a deep cycle does.
- `planTrackerLevel` reuses the Submit planner machinery and emits the `action-internal-mirror-{state}` event.
- A mirror signal that FSM-no-ops against the parent's target action skips the level's commit entirely: the parent workflow is unwritten (its `updated.timestamp` unchanged), no `action-internal-mirror-*` event, no change-log entries, no follow-on fires.
- Integration test `fireTrackerSubscription.test.js` (or renamed) covers a 3-level-deep multi-workflow cascade.

## Files

- `WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` — rewrite into `runTrackerCascade` (rename file if appropriate)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planTrackerLevel.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/errors.js` — modify — add `TrackerCascadeDepthError extends WorkflowEngineError` (`code: "tracker_depth_exceeded"`)
- tracker cascade integration test — create/rewrite

## Notes

- Depends on task 15 (the Submit planner machinery + the handler call site). Start/Cancel/Close (task 17) also feed `trackerFires` into this loop.
- Fires arrive **fully resolved**: every producer composes `{ parentWorkflowId, parentActionId, signal }` from ids in hand at plan time — the loaded workflow doc's `parent_action_id` + `parent_workflow_id` (D3 producer rule; the latter is the workflow-doc schema addition Start stamps). The cascade does no id resolution; per-level fires recurse identically (`planTrackerLevel`'s loaded parent workflow carries its own parent ids).
- The mirror event is lower-prominence in the timeline (system event).
