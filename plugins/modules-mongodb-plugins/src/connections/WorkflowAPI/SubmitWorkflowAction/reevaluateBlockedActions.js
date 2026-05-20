import updateAction from "../../shared/updateAction.js";

/**
 * Sub-step 4b: walk every action in `blocked` status post-write and push
 * `action-required` on those whose `blocked_by` dependencies are now satisfied.
 * Reads the post-4a `groups[]` array and the post-step-4 action statuses.
 *
 * Writes directly via `shared/updateAction.js` — the priority rule allows
 * `action-required` (6) < `blocked` (7); same-stage on already-`action-required`
 * actions no-ops. Walk-pushed entries don't carry `force` and don't use the
 * `currentActionId` self-exception (they're never the user-submitted action).
 *
 * Single-pass: the walk only pushes `action-required` (non-terminal), so a
 * newly-unblocked action can never cause another group to transition to `done`
 * in the same call.
 *
 * @param {Object} context — engine handler context.
 * @param {Object} args
 * @param {Array<Object>} args.workflowActions
 * @param {Array<Object>} args.actionsConfig
 * @param {Array<Object>} args.groups — post-4a `groups[]` array.
 * @param {Array<Object>} args.declaredGroups — `workflowConfig.action_groups`.
 * @param {string | null} args.eventId — the submit's event id.
 * @returns {Promise<Array<string>>} — ids of actions that were pushed.
 */
async function reevaluateBlockedActions(
  context,
  { workflowActions, actionsConfig, groups, declaredGroups, eventId },
) {
  const declaredGroupIds = new Set((declaredGroups ?? []).map((g) => g.id));
  const actionTypes = new Set(actionsConfig.map((cfg) => cfg.type));
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));

  const terminalByType = new Map();
  for (const a of workflowActions) {
    const isTerminal = ["done", "not-required"].includes(a.status?.[0]?.stage);
    if (!terminalByType.has(a.type)) {
      terminalByType.set(a.type, isTerminal);
    } else if (!isTerminal) {
      terminalByType.set(a.type, false);
    }
  }

  const blockedActions = workflowActions.filter(
    (a) => a.status?.[0]?.stage === "blocked",
  );

  const pushed = [];
  for (const action of blockedActions) {
    const cfg = actionsConfig.find((c) => c.type === action.type);
    if (!cfg) continue;

    const blockedBy = cfg.blocked_by ?? [];
    const allSatisfied = blockedBy.every((entry) => {
      if (declaredGroupIds.has(entry)) {
        return groupById.get(entry)?.status === "done";
      }
      if (actionTypes.has(entry)) {
        return terminalByType.get(entry) === true;
      }
      return false;
    });

    if (!allSatisfied) continue;

    const result = await updateAction(context, {
      actionId: action._id,
      newStage: "action-required",
      eventId,
    });
    if (result !== null && result !== undefined) {
      pushed.push(action._id);
    }
  }

  return pushed;
}

export default reevaluateBlockedActions;
