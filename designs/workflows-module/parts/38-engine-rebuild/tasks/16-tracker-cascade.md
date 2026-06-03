# Task 16: Tracker cascade loop

## Context

`fireTrackerSubscription.js` is today a recursive function with shared engine context across parent workflows. Load-plan-commit makes that impossible (the Plan is per-aggregate — recursion can't share it). It becomes a **loop**, where each level runs its own load-plan-commit cycle on its own parent workflow. The per-level Plan reuses 100% of the per-Submit planner machinery (task 15); the only new piece is `planTrackerLevel`, a thin wrapper that emits the mirror signal then delegates to the same auto-unblock/recompute logic.

## Task

**Rewrite `WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` into `shared/phases/runTrackerCascade.js`** (D10). The cascade is cross-handler orchestration — its consumers are Submit (task 15) and Start/Cancel/Close (task 17, which today already import it from the Submit directory) — so per the phase-layer layout (D2/D8) it moves to `shared/phases/`, not a rename-in-place:

```js
const MAX_DEPTH = 10; // chain depth, not fan-out
const MAX_ATTEMPTS = 3; // per-level CAS retry bound
const RECORDED_CODES = ["concurrent_submit", "workflow_not_found", "missing_target"];

async function runTrackerCascade(initialFires, baseContext) {
  const fires = []; // [{ parent_action_id, parent_workflow_id, new_status }] — today's shape
  const dispatchErrors = []; // commit steps 3–5 failures, accumulated across levels (task 13)
  const cascadeErrors = []; // [{ fire, error }] — CAS exhaustion + gone parents
  let pendingFires = initialFires.map((f) => ({ ...f, depth: 1 }));

  while (pendingFires.length > 0) {
    const fire = pendingFires.shift();
    if (fire.depth > MAX_DEPTH) throw new TrackerCascadeDepthError(fire); // config bug — propagates

    // Each level is its own invocation: fresh event_id; now + newId pass through (see below).
    const levelContext = { ...baseContext, event_id: randomUUID() };
    let attempts = 0;
    while (true) {
      try {
        const levelLoaded = await loadWorkflowState(levelContext, { workflowId: fire.parentWorkflowId });
        const levelPlan = await planTrackerLevel(levelLoaded, {
          parentActionId: fire.parentActionId,
          signal: fire.signal,
          event_id: levelContext.event_id,
          now: levelContext.now,
          newId: levelContext.newId,
        });
        if (levelPlan === null) break; // FSM no-op — skip the level entirely (D3)
        const commitResult = await commitPlan(levelContext, levelPlan);
        dispatchErrors.push(...commitResult.dispatchErrors);
        fires.push(levelPlan.fired); // the plan carries the level's fired entry (FSM-resolved new_status)
        pendingFires.push(...levelPlan.trackerFires.map((f) => ({ ...f, depth: fire.depth + 1 })));
        break;
      } catch (error) {
        if (error.code === "concurrent_submit" && ++attempts < MAX_ATTEMPTS) continue; // fresh load → plan → commit
        if (RECORDED_CODES.includes(error.code)) {
          cascadeErrors.push({ fire, error }); // exhausted CAS / gone parent — record, continue
          break;
        }
        throw error; // unclassified — propagate
      }
    }
  }
  return { fires, dispatchErrors, cascadeErrors };
}
```

- **Each level is its own invocation — mint a fresh `event_id` per level.** Design rule: "Tracker-mirror commits per cascade level each generate their own `event_id`." Reusing the base submit's `event_id` would collide on the event doc `_id` (duplicate-key on every cascade-bearing submit) and point the parent's `status[]` entries at the *child* submit's event. `now` is **not** re-minted: the single per-request `connection.changeStamp` passes through to every level — one user action, one timestamp (matches today's recursion sharing `context.changeStamp`, keeps the stamp app-overridable, and keeps the change-log's stamp-grouped audit coherent). The `newId` factory passes through unchanged (each call already returns a fresh uuid).
- **`MAX_DEPTH = 10` guard tracks chain depth, not loop iterations.** Each fire carries a `depth` field seeded at 1, incremented per level. A wide-but-shallow cascade (one workflow with many tracker parents) must **not** trip the guard; a genuinely deep cycle must. A single dequeue counter on the BFS loop would measure total fan-out (breadth), not depth — do **not** use that.
- Define `TrackerCascadeDepthError extends WorkflowEngineError` (`code: "tracker_depth_exceeded"`) in `shared/errors.js` — engine throws share the D13 error model (base class created by task 9); it keeps a named class like `ConcurrentSubmitError`, but callers/tests discriminate on `code`.
- **Collect per-level dispatch errors; don't stop the cascade for them.** Each level's `commitPlan` may record post-commit dispatch failures on its `CommitResult.dispatchErrors[]` (task 13 failure policy). `runTrackerCascade` accumulates these across levels and returns them, so the handler folds them into its single end-of-invocation `post_commit_dispatch_failed` throw (task 15). A level's dispatch failure never prevents the remaining fires from running.
- **Bounded per-level CAS retry — a level's `ConcurrentSubmitError` never propagates.** The parent is a live workflow other users submit against, so a CAS miss at a cascade level is the *expected* concurrency event — and the caller can't recover it by retrying the original submit (the child already advanced; the retry FSM-no-ops → `signal_not_allowed`, so D15's "retryable" framing doesn't hold post-commit). On a CAS miss the loop re-runs the level, up to **3 attempts**, each a full fresh load → plan → commit: nothing stale is ever re-issued (the re-plan works from the re-loaded state; if the concurrent write advanced the tracker action itself, the re-plan FSM-no-ops and the level skips), and the level's `event_id` is safely reused across attempts (a CAS miss writes nothing — D9). This is the one engine site where auto-retry is safe by construction: tracker levels have no pre-hook and `planTrackerLevel` is deterministic, so D15's non-idempotence argument doesn't apply. On exhaustion, record `{ fire, error }` on the cascade's error accumulation and continue with the remaining fires.
- **`TrackerCascadeDepthError` and unclassified errors do propagate immediately.** A depth cycle is a structural config bug (D13 defensive gate), not a per-fire data state — it taints the whole cascade, so it fails loudly rather than folding into the error list. The loop's catch is a closed set — `concurrent_submit` (after exhaustion), `workflow_not_found`, `missing_target` are recorded; everything else rethrows (an unclassifiable mid-level error leaves the level's state unknowable; swallowing it would hide corruption).
- **Return `{ fires, dispatchErrors, cascadeErrors }`.** The handler's `tracker_fired` return key (task 15) and the post-hook `result` bag (task 14) read `fires` in **today's shape** — `[{ parent_action_id, parent_workflow_id, new_status }]`, `new_status` the FSM-resolved parent stage (review-11 #2; this is the existing `tracker_fired` consumer contract, `makeWorkflowApis.js` `:return`); each level's plan carries its `fired` entry, composed by `planTrackerLevel`. The two error lists stay separate (different shapes — step failures vs `{ fire, error }`); the handler throws `post_commit_dispatch_failed` when **either** is non-empty (task 15).
- **No-op convention: `planTrackerLevel` returns `null`** (mirroring `planActionTransition`'s landed no-op convention) — the loop's skip check is `levelPlan === null`, not a structural emptiness probe.

**Create `shared/phases/planners/planTrackerLevel.js`:**

- Takes the per-level injected `{ event_id, now, newId }` like every other planner — the landed `planActionTransition` requires them as inputs, and `planEventDispatch` uses `event_id` as the event doc `_id` (task 12).
- **Resolves its own target and config.** `loadWorkflowState` in `{ workflowId }` mode returns only `{ workflow, actions, workflowConfig }` — no `targetAction`, no `actionConfig` (the Submit path gets those from the load phase's `actionId` mode). `planTrackerLevel` locates `fire.parentActionId` within `levelLoaded.actions` and resolves its config from `workflowConfig.actions`. When either is missing it throws `missing_target` (D13 code) — the cascade loop owns the permissive policy, not the planner (next bullet).
- **Gone-parent policy: record and continue, don't throw out and don't skip silently.** A fire whose parent is gone — `workflow_not_found` from the level's `loadWorkflowState`, or `missing_target` from `planTrackerLevel` (no matching action doc, or its action type no longer in the workflow config) — is a dangling parent reference: a data bug (deletion/config removal while children still point at it), with no legitimate producing flow. The loop catches these two codes around the level's load+plan, records `{ fire, error }` on the cascade's error accumulation, skips the level, and continues with the remaining fires; the failure surfaces through the handler's end-of-invocation `post_commit_dispatch_failed` throw. **Deliberate deviation from today's silent `if (!tracker) return []`** — the child's committed submit is never aborted for it, but broken mirror chains become visible instead of quietly stopping. The FSM no-op skip (below) stays silent — that's the legitimate routine case (races, early-closed parents with terminal tracker actions), distinct from a missing doc.
- Emits the mirror signal (`internal_mirror_child_active` / `_completed` / `_cancelled`) against the parent's target action, then delegates to the same `planActionTransition` / `planAutoUnblock` / `planWorkflowRecompute` machinery as Submit.
- Emits an `action-internal-mirror-{state}` event (action-event context, per task 12) — the mirror has a single target action.
- **No-op levels short-circuit before commit (D3).** When the mirror signal FSM-no-ops against the parent's target action (`resolveSignal` returns null — cascade signals no-op silently, task 10), the level changed nothing: no transitions, so recomputed groups/summary equal the loaded ones. `planTrackerLevel` returns `null` and the loop **skips `commitPlan` for that level entirely** — no parent workflow write (no `updated` stamp advance, which would create spurious CAS pressure on concurrent real submits against the parent), no mirror event, no change-log entries, no further `trackerFires` from that level. `commitPlan` is never asked to detect emptiness; the caller owns the skip.

**Wire `runTrackerCascade` into the Submit handler** (task 15's call site) and any other handler that produces `trackerFires` (Start's parent-tracker push, Cancel/Close cascades — task 17).

## Acceptance Criteria

- Tracker recursion is a loop; each level is its own independently-atomic load-plan-commit cycle with no shared in-memory state.
- The depth guard tracks **chain depth** per fire (seeded 1, +1 per level) — a wide shallow cascade does not trip it; a deep cycle does.
- `planTrackerLevel` reuses the Submit planner machinery and emits the `action-internal-mirror-{state}` event.
- A mirror signal that FSM-no-ops against the parent's target action skips the level's commit entirely: the parent workflow is unwritten (its `updated.timestamp` unchanged), no `action-internal-mirror-*` event, no change-log entries, no follow-on fires.
- A fire whose parent workflow, parent action doc, or action config is gone records `{ fire, error }` on the cascade's error accumulation, skips that level, and runs the remaining fires — surfaced by the handler's end-of-invocation `post_commit_dispatch_failed` throw, never by aborting the request. Test covers the missing-parent branch (carried from `fireTrackerSubscription.test.js`) as distinct from the silent FSM-no-op skip.
- Integration test `runTrackerCascade.test.js` (replacing `fireTrackerSubscription.test.js`) covers a 3-level-deep multi-workflow cascade.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/runTrackerCascade.js` — create (the rewritten loop; relocated from `WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js`)
- `WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` (+ `fireTrackerSubscription.test.js`) — delete once consumers are rewired
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planTrackerLevel.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/errors.js` — modify — add `TrackerCascadeDepthError extends WorkflowEngineError` (`code: "tracker_depth_exceeded"`)
- `shared/phases/runTrackerCascade.test.js` — create (tracker cascade integration test, replacing `fireTrackerSubscription.test.js`)

## Notes

- Depends on task 15 (the Submit planner machinery + the handler call site). Start/Cancel/Close (task 17) also feed `trackerFires` into this loop.
- Fires arrive **fully resolved**: every producer composes `{ parentWorkflowId, parentActionId, signal }` from ids in hand at plan time — the loaded workflow doc's `parent_action_id` + `parent_workflow_id` (D3 producer rule; the latter is the workflow-doc schema addition Start stamps). The cascade does no id resolution; per-level fires recurse identically (`planTrackerLevel`'s loaded parent workflow carries its own parent ids). The next-level fire's `signal` is the constant `internal_mirror_child_completed` — the only stage a level's recompute can push is `completed`, so it's the only signal a cascade level can produce.
- The `CHILD_STAGE_MAP` export disappears with this rewrite — the FSM tracker table (task 2) supersedes it. (Its only external importer is its own test file; the handler files import only the default export, so the task-17 rewrites have nothing to re-point.)
- The mirror event is lower-prominence in the timeline (system event).
