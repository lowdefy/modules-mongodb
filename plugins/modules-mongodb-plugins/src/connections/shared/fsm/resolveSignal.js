import { FSM_TABLES, hasReview } from "./tables.js";

/**
 * Resolves a signal against an action's current stage via the per-kind FSM
 * table (design D4 / state-machine.md).
 *
 * Returns:
 *   - the target stage (string) when the cell is a direct target,
 *   - the resolved target when the cell is a function (the `submit` split),
 *   - `null` when the (stage, signal) pair has no entry — the structurally
 *     meaningful no-op (re-fire safety; broad cascade source-lists dropping
 *     intent harmlessly).
 *
 * Takes NO current-app argument: the `submit` in-review/done split is an
 * action-global property resolved from `actionConfig.access` via `hasReview`.
 *
 * Unknown-signal-name rejection is a handler-entry concern (the engine holds
 * the locked vocabulary), not this function's — a valid signal with no cell
 * simply no-ops here.
 *
 * For the upsert-spawn path the planner builds a pseudo-action
 * `{ kind, status: [{ stage: "none" }] }` and calls this normally, so the
 * `none` creation row resolves like any other cell.
 */
function resolveSignal({ action, signal, actionConfig }) {
  const table = FSM_TABLES[action.kind];
  if (!table) return null;
  const currentStage = action.status?.[0]?.stage;
  const entry = table[currentStage]?.[signal];
  if (entry === undefined) return null; // no-op signal — non-listening state
  if (typeof entry === "string") return entry; // direct target
  return entry({ action, actionConfig }); // function cell (submit split)
}

export { hasReview };
export default resolveSignal;
