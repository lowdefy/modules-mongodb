import { randomUUID } from "node:crypto";

import loadWorkflowState from "./loadWorkflowState.js";
import commitPlan from "./commitPlan.js";
import planTrackerLevel from "./planners/planTrackerLevel.js";
import { TrackerCascadeDepthError } from "../errors.js";

// Chain-depth guard (NOT a loop-iteration counter — a wide-but-shallow cascade
// must not trip it; a genuinely deep cycle must). Each fire carries its own
// `depth`, seeded 1 and incremented per level.
const MAX_DEPTH = 10;
// Per-level CAS retry bound — a level's ConcurrentSubmitError never propagates;
// each attempt is a full fresh load → plan → commit.
const MAX_ATTEMPTS = 3;
// The closed set the cascade RECORDS (records `{ fire, error }`, continues) on:
// CAS exhaustion + gone-parent. Everything else propagates.
const RECORDED_CODES = [
  "concurrent_submit",
  "workflow_not_found",
  "missing_target",
];

/**
 * Tracker cascade orchestrator (design D3 / D10; task 16).
 *
 * The recursive `fireTrackerSubscription` is now a LOOP: each level runs its own
 * independently-atomic load-plan-commit cycle on its own parent workflow — no
 * shared in-memory state across levels (load-plan-commit makes the per-aggregate
 * Plan impossible to share across parents). Each fire dequeued runs:
 *
 *   load parent workflow  → planTrackerLevel  → commitPlan
 *
 * and enqueues the next-level fires its plan produced (`trackerFires`).
 *
 * Per-level invocation identity (design D7):
 *   - `event_id` is MINTED FRESH per level — reusing the base submit's id would
 *     collide on the event doc `_id` and point the parent's `status[]` at the
 *     child submit's event.
 *   - `now` is NOT re-minted — the single per-request `connection.changeStamp`
 *     passes through (one user action, one timestamp).
 *   - `newId` passes through unchanged.
 *
 * Per-level CAS policy: a level's `ConcurrentSubmitError` never propagates —
 * bounded `MAX_ATTEMPTS` retry, each a full fresh load → plan → commit (nothing
 * stale is re-issued; the re-plan works from re-loaded state, and on exhaustion
 * the fire is recorded and the cascade continues). The level's `event_id` is
 * safely reused across attempts (a CAS miss writes nothing — D9).
 *
 * Gone-parent policy: a fire whose parent is gone — `workflow_not_found` from
 * the level's load, or `missing_target` from `planTrackerLevel` — is recorded
 * (`{ fire, error }`) and skipped; the remaining fires still run. Broken mirror
 * chains become visible (deliberate deviation from today's silent return-[]).
 *
 * FSM no-op skip: when the mirror signal no-ops against the parent's target
 * action, `planTrackerLevel` returns `null` and the loop skips `commitPlan`
 * entirely — no parent write, no mirror event, no change-log, no follow-on
 * fires. This is the legitimate routine case (distinct from a missing doc), so
 * it stays silent.
 *
 * Depth-cycle + unclassified errors propagate immediately: `TrackerCascadeDepthError`
 * is a structural config bug that taints the whole cascade and fails loudly.
 *
 * @param {Array<{ parentWorkflowId: string, parentActionId: string, signal: string,
 *   payload?: { fields?: Object } }>} initialFires
 *   — fully-resolved fires from the originating plan (`plan.trackerFires`).
 *   The optional `payload.fields` (Start's child link fields —
 *   `child_workflow_id`, `child_entity: { connection_id, id }`, task 17)
 *   is forwarded through `planTrackerLevel` into `planActionTransition`'s
 *   `payload.fields` (D3 fire shape).
 * @param {Object} baseContext — engine context for the next-level loads/commits
 *   (mongoDb, connection, callbacks, user, workflowsConfig, now, newId,
 *   audit, …). Its `event_id` is replaced per level.
 * @returns {Promise<{
 *   fires: Array<{ parent_action_id: string, parent_workflow_id: string, new_status: string }>,
 *   dispatchErrors: Array<{ step: number, error: Error }>,
 *   cascadeErrors: Array<{ fire: Object, error: Error }>,
 * }>}
 */
async function runTrackerCascade(initialFires, baseContext) {
  const fires = []; // accumulated level `fired` entries (today's shape)
  const dispatchErrors = []; // commit steps 3–5 failures, across levels (task 13)
  const cascadeErrors = []; // CAS exhaustion + gone parents
  const pendingFires = (initialFires ?? []).map((f) => ({ ...f, depth: 1 }));

  while (pendingFires.length > 0) {
    const fire = pendingFires.shift();
    if (fire.depth > MAX_DEPTH) {
      throw new TrackerCascadeDepthError(
        `runTrackerCascade: chain depth ${fire.depth} exceeded the limit (${MAX_DEPTH}) — possible cycle in workflow parent linking (parent action ${fire.parentActionId}).`,
        { fire },
      );
    }

    // Each level is its own invocation: fresh event_id; now + newId pass through.
    const levelContext = { ...baseContext, event_id: randomUUID() };
    let attempts = 0;
    for (;;) {
      try {
        const levelLoaded = await loadWorkflowState(levelContext, {
          workflowId: fire.parentWorkflowId,
        });
        const levelPlan = planTrackerLevel(levelLoaded, {
          parentActionId: fire.parentActionId,
          signal: fire.signal,
          payload: fire.payload,
          event_id: levelContext.event_id,
          now: levelContext.now,
          newId: levelContext.newId,
          connection: levelContext.connection,
          audit: levelContext.audit,
        });
        if (levelPlan === null) break; // FSM no-op — skip the level (D3)
        levelContext.loadedState = levelLoaded; // commitPlan's CAS anchor
        const commitResult = await commitPlan(levelContext, levelPlan);
        dispatchErrors.push(...commitResult.dispatchErrors);
        fires.push(levelPlan.fired);
        for (const next of levelPlan.trackerFires) {
          pendingFires.push({ ...next, depth: fire.depth + 1 });
        }
        break;
      } catch (error) {
        // Bounded per-level CAS retry — fresh load → plan → commit each attempt.
        if (error.code === "concurrent_submit" && ++attempts < MAX_ATTEMPTS) {
          continue;
        }
        if (RECORDED_CODES.includes(error.code)) {
          cascadeErrors.push({ fire, error });
          break;
        }
        throw error; // unclassified (incl. tracker_depth_exceeded) — propagate
      }
    }
  }

  return { fires, dispatchErrors, cascadeErrors };
}

export default runTrackerCascade;
