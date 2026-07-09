/**
 * Derive a group's status from the actions assigned to it.
 *
 * Three-value enum (distinct from the 8-value action-status enum):
 *   - 'done'        — every action in the group is terminal ('done' or
 *                     'not-required'). Empty groups are 'done' by convention.
 *   - 'blocked'     — every non-terminal action in the group is 'blocked'.
 *   - 'in-progress' — otherwise.
 *
 * @param {Array<Object>} groupActions — actions belonging to the group, each
 *   shaped `{ status: [{ stage, ... }, ...], ... }`. Pre-filtered by caller
 *   (the caller already knows which actions belong to which group).
 * @returns {'done' | 'blocked' | 'in-progress'}
 */
function deriveGroupStatus(groupActions) {
  if (groupActions.length === 0) return "done";
  const TERMINAL = ["done", "not-required"];
  const stages = groupActions.map((a) => a.status?.[0]?.stage);
  if (stages.every((s) => TERMINAL.includes(s))) return "done";
  if (stages.every((s) => TERMINAL.includes(s) || s === "blocked"))
    return "blocked";
  return "in-progress";
}

export default deriveGroupStatus;
