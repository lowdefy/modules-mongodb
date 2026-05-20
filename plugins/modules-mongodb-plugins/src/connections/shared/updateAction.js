import getCurrentAction from "../WorkflowAPI/SubmitWorkflowAction/utils/getCurrentAction.js";
import shouldUpdate from "../WorkflowAPI/SubmitWorkflowAction/utils/shouldUpdate.js";

/**
 * Update one action doc — push a new status entry, optionally set additional fields.
 *
 * Part 6 extension landed: per-entry priority-rule branch active. Force-bypass
 * path preserved for engine-internal callers (`StartWorkflow`'s parent push,
 * `CancelWorkflow`'s sweep, tracker subscription (part 10), `CloseWorkflow`'s
 * sweep (part 23), pre-hook returns (part 9)).
 *
 * Self-exception: same-stage allowed for the action whose id matches
 * `currentActionId`. A re-click writes a fresh status entry — audit history
 * is the source of truth for "user did this again."
 *
 * Returning `null` on priority-rule rejection (rather than throwing) lets the
 * per-entry write loop in step 4 iterate without breaking on no-op entries.
 *
 * Import invariant: this file imports from
 * `WorkflowAPI/SubmitWorkflowAction/utils/`. Those utilities must NOT import
 * back from `shared/updateAction.js` — that would create a cycle.
 *
 * @param {Object} context — engine handler context (`mongoDBConnection`,
 *   `changeStamp`, `actionsEnum`).
 * @param {Object} options
 * @param {string} options.actionId
 * @param {string} options.newStage
 * @param {Object} [options.fields] — additional `$set` fields.
 * @param {string | null} [options.eventId]
 * @param {string | null} [options.currentActionId] — used only for the
 *   self-exception. Falsy = no self-exception (engine-internal callers pass null).
 * @param {boolean} [options.force] — defaults to false. `true` bypasses the priority rule.
 * @returns {Promise<any | null>} — dispatcher result on write; `null` when
 *   the priority rule rejected the write.
 */
async function updateAction(
  context,
  {
    actionId,
    newStage,
    fields = {},
    eventId = null,
    currentActionId = null,
    force = false,
  },
) {
  if (force !== true) {
    const fetchedAction = await getCurrentAction(context, { actionId });
    if (!fetchedAction) {
      throw new Error(`updateAction: action ${actionId} not found`);
    }
    const allow = shouldUpdate({
      actionsEnum: context.actionsEnum,
      currentActionId,
      actionEntry: { type: fetchedAction.type, status: newStage, force: false },
      fetchedAction,
    });
    if (!allow) {
      return null;
    }
  }

  return context.mongoDBConnection("actions").MongoDBUpdateOne({
    filter: { _id: actionId },
    update: {
      $set: {
        updated: context.changeStamp,
        ...fields,
      },
      $push: {
        status: {
          $position: 0,
          $each: [
            {
              stage: newStage,
              event_id: eventId,
              created: context.changeStamp,
            },
          ],
        },
      },
    },
  });
}

export default updateAction;
