/**
 * Walk the workflow's `blocked_by` graph (action-type entries only in v1);
 * emit `{ type, status: 'action-required' }` entries for every blocked action
 * whose `blocked_by` action-type dependencies are now terminal.
 *
 * For keyed actions (multiple docs per type), a type is "fully terminal"
 * only when every doc of that type is terminal — empty action types count
 * as non-terminal.
 *
 * @param {Object} args
 * @param {Array<Object>} args.workflowActions — all action docs on the workflow.
 * @param {Array<Object>} args.actionsConfig — `workflowsConfig[workflow_type].actions`.
 * @returns {Array<{ type: string, status: 'action-required' }>}
 */
function computeAutoUnblocks({ workflowActions, actionsConfig }) {
  const terminalByType = new Map();
  for (const action of workflowActions) {
    const isTerminal = ["done", "not-required"].includes(action.status?.[0]?.stage);
    if (!terminalByType.has(action.type)) {
      terminalByType.set(action.type, isTerminal);
    } else if (!isTerminal) {
      terminalByType.set(action.type, false);
    }
  }

  const knownActionTypes = new Set(actionsConfig.map((cfg) => cfg.type));
  const unblockedTypes = new Set();

  for (const action of workflowActions) {
    if (action.status?.[0]?.stage !== "blocked") continue;

    const cfg = actionsConfig.find((c) => c.type === action.type);
    if (!cfg) continue;

    const blockedBy = cfg.blocked_by ?? [];
    // PART 7 EXTENSION: group-id entries in `blocked_by` are filtered out here
    // (action-type only in v1). Part 7's blocked_by group-id resolution adds
    // the group-status lookup branch before this filter, so group ids resolve
    // via the workflow's persisted `groups[]` array.
    const actionTypeDeps = blockedBy.filter((entry) => knownActionTypes.has(entry));
    if (actionTypeDeps.length === 0) continue;

    const allSatisfied = actionTypeDeps.every((dep) => terminalByType.get(dep) === true);
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
