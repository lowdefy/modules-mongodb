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
- Define `TrackerCascadeDepthError`.

**Create `shared/phases/planners/planTrackerLevel.js`:**

- Emits the mirror signal (`internal_mirror_child_active` / `_completed` / `_cancelled`) against the parent's target action, then delegates to the same `planActionTransition` / `planAutoUnblock` / `planWorkflowRecompute` machinery as Submit.
- Emits an `action-internal-mirror-{state}` event (action-event context, per task 12) — the mirror has a single target action.

**Wire `runTrackerCascade` into the Submit handler** (task 15's call site) and any other handler that produces `trackerFires` (Start's parent-tracker push, Cancel/Close cascades — task 17).

## Acceptance Criteria

- Tracker recursion is a loop; each level is its own independently-atomic load-plan-commit cycle with no shared in-memory state.
- The depth guard tracks **chain depth** per fire (seeded 1, +1 per level) — a wide shallow cascade does not trip it; a deep cycle does.
- `planTrackerLevel` reuses the Submit planner machinery and emits the `action-internal-mirror-{state}` event.
- Integration test `fireTrackerSubscription.test.js` (or renamed) covers a 3-level-deep multi-workflow cascade.

## Files

- `WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` — rewrite into `runTrackerCascade` (rename file if appropriate)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planTrackerLevel.js` — create
- `TrackerCascadeDepthError` — create
- tracker cascade integration test — create/rewrite

## Notes

- Depends on task 15 (the Submit planner machinery + the handler call site). Start/Cancel/Close (task 17) also feed `trackerFires` into this loop.
- The mirror event is lower-prominence in the timeline (system event).
