import deriveGroupStatus from "./deriveGroupStatus.js";

/**
 * Compute the workflow doc's `groups[]` array from the workflow's actions
 * and its declared action_groups. Output array preserves declaration order.
 *
 * @param {Object} args
 * @param {Array<Object>} args.declaredGroups — `workflowConfig.action_groups`
 *   in declaration order. Each: `{ id, title?, on_complete? }`.
 * @param {Array<Object>} args.actions — every action doc on the workflow.
 *   Each: `{ action_group?, status: [{ stage, ... }, ...], ... }`.
 * @returns {Array<{ id: string, status: 'done' | 'blocked' | 'in-progress', summary: { done: number, not_required: number, total: number } }>}
 */
function recomputeGroups({ declaredGroups, actions }) {
  return (declaredGroups ?? []).map((group) => {
    const groupActions = (actions ?? []).filter(
      (a) => a.action_group === group.id,
    );
    const status = deriveGroupStatus(groupActions);
    const summary = {
      done: groupActions.filter((a) => a.status?.[0]?.stage === "done").length,
      not_required: groupActions.filter(
        (a) => a.status?.[0]?.stage === "not-required",
      ).length,
      total: groupActions.length,
    };
    return { id: group.id, status, summary };
  });
}

export default recomputeGroups;
