/**
 * Walk the workflow's `blocked_by` graph (mixed action types + group ids);
 * emit `{ type, status: 'action-required' }` entries for every blocked action
 * whose `blocked_by` dependencies are now all satisfied.
 *
 * Resolution rules for each `blocked_by` entry:
 *   1. Group id (declared in `action_groups[]`) → satisfied iff the group's
 *      persisted status is `'done'`.
 *   2. Action type (declared in `actions[]`) → satisfied iff every doc of
 *      that type is terminal. (For keyed actions, a type is "fully terminal"
 *      only when every doc of that type is terminal.)
 *   3. Neither — defensive skip (treat as unsatisfied). The build-time
 *      validator in `makeWorkflowsConfig` rejects unresolved entries; this
 *      branch only fires if the validator was bypassed.
 *
 * Reads the workflow's **pre-submit** `groups[]` array (Part 7's sub-step 4a
 * recomputes the post-submit array; that runs after step 4 writes, while this
 * function runs in step 3 *before* step 4).
 *
 * @param {Object} args
 * @param {Array<Object>} args.workflowActions
 * @param {Array<Object>} args.actionsConfig
 * @param {Array<{ id: string, status: 'done'|'blocked'|'in-progress', ... }>} [args.groups]
 *   — workflow doc's current `groups[]` array.
 * @param {Array<{ id: string, ... }>} [args.declaredGroups]
 *   — `workflowConfig.action_groups`.
 * @returns {Array<{ type: string, status: 'action-required' }>}
 */
function computeAutoUnblocks({
  workflowActions,
  actionsConfig,
  groups = [],
  declaredGroups = [],
}) {
  const terminalByType = new Map();
  for (const action of workflowActions) {
    const isTerminal = ["done", "not-required"].includes(action.status?.[0]?.stage);
    if (!terminalByType.has(action.type)) {
      terminalByType.set(action.type, isTerminal);
    } else if (!isTerminal) {
      terminalByType.set(action.type, false);
    }
  }

  const declaredGroupIds = new Set((declaredGroups ?? []).map((g) => g.id));
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
  const actionTypes = new Set(actionsConfig.map((cfg) => cfg.type));
  const unblockedTypes = new Set();

  for (const action of workflowActions) {
    if (action.status?.[0]?.stage !== "blocked") continue;

    const cfg = actionsConfig.find((c) => c.type === action.type);
    if (!cfg) continue;

    const blockedBy = cfg.blocked_by ?? [];
    if (blockedBy.length === 0) continue;

    const allSatisfied = blockedBy.every((entry) => {
      if (declaredGroupIds.has(entry)) {
        return groupById.get(entry)?.status === "done";
      }
      if (actionTypes.has(entry)) {
        return terminalByType.get(entry) === true;
      }
      // Defensive: build-time validator rejects unresolved entries.
      return false;
    });

    if (allSatisfied) {
      unblockedTypes.add(action.type);
    }
  }

  return [...unblockedTypes].map((type) => ({
    type,
    status: "action-required",
  }));
}

export default computeAutoUnblocks;
