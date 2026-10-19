import deriveGroupStatus from "./deriveGroupStatus.js";

/**
 * Compute each declared group's runtime `status` from the workflow's actions.
 * Output array preserves declaration order.
 *
 * Returns only `{ id, status }`: the sole caller (`planAutoUnblock`) reads only
 * `.status`, and the overview summaries are derived on read from the action
 * docs, so a `summary` computed here would be dead work.
 *
 * @param {Object} args
 * @param {Array<Object>} args.declaredGroups — `workflowConfig.action_groups`
 *   in declaration order. Each: `{ id, title?, on_complete? }`.
 * @param {Array<Object>} args.actions — every action doc on the workflow.
 *   Each: `{ action_group?, status: [{ stage, ... }, ...], ... }`.
 * @returns {Array<{ id: string, status: 'done' | 'blocked' | 'in-progress' }>}
 */
function recomputeGroups({ declaredGroups, actions }) {
  return (declaredGroups ?? []).map((group) => {
    const groupActions = (actions ?? []).filter(
      (a) => a.action_group === group.id,
    );
    return { id: group.id, status: deriveGroupStatus(groupActions) };
  });
}

export default recomputeGroups;
