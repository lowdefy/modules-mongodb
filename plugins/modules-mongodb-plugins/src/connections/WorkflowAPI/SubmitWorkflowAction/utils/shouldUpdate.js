/**
 * Apply the priority rule to a single per-entry status transition.
 *
 * Returns `true` if the transition should land (priority allows it, the
 * self-exception applies, or the entry opts in with `force: true`).
 * Returns `false` if the priority rule rejects it.
 *
 * Throws when the new status (or the current stage on the fetched action) is
 * not present in `actionsEnum` — guards against typos in action.interactions
 * overrides (part 9) or pre-hook returns that resolved to unknown stages.
 *
 * @param {Object} args
 * @param {Object} args.actionsEnum — `connection.actionsEnum`; each value
 *   carries `priority: number` (load-bearing).
 * @param {string | null} args.currentActionId — the user-submitted action's id.
 * @param {Object} args.actionEntry — one entry from the internal `actions[]`
 *   array: `{ type, status, keys?, fields?, references?, force? }`.
 * @param {Object} args.fetchedAction — the action doc as currently in Mongo:
 *   `{ _id, status: [{ stage, ... }, ...], ... }`.
 * @returns {boolean}
 */
function shouldUpdate({ actionsEnum, currentActionId, actionEntry, fetchedAction }) {
  if (actionEntry.force === true) {
    return true;
  }

  const newEnum = actionsEnum?.[actionEntry.status];
  if (!newEnum || typeof newEnum.priority !== "number") {
    throw new Error(
      `shouldUpdate: target status "${actionEntry.status}" not found in actionsEnum (typo or missing display config?)`,
    );
  }

  const currentStage = fetchedAction.status?.[0]?.stage;
  const currentEnum = actionsEnum?.[currentStage];
  if (!currentEnum || typeof currentEnum.priority !== "number") {
    throw new Error(
      `shouldUpdate: current status "${currentStage}" not found in actionsEnum (typo or missing display config?)`,
    );
  }

  if (fetchedAction._id === currentActionId) {
    return true;
  }

  return newEnum.priority < currentEnum.priority;
}

export default shouldUpdate;
