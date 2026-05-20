/**
 * Fetch one action doc by id. Used by `handleSubmit.js` step 1 (validate the
 * `currentActionId` exists) and by the extended `shared/updateAction.js`
 * priority-rule branch (read current state for the priority comparison).
 *
 * No projection — callers need the full doc (`status[]` for the priority
 * comparison, `type` / `key` / `workflow_id` for downstream reads).
 * `shared/getActionFields.js` exists for the projection case (parts 5/10).
 *
 * @param {Object} context — engine handler context (has `mongoDBConnection`).
 * @param {Object} options
 * @param {string} options.actionId
 * @returns {Promise<Object | null>} — the action doc or null if not found.
 */
async function getCurrentAction(context, { actionId }) {
  return context.mongoDBConnection("actions").MongoDBFindOne({
    query: { _id: actionId },
  });
}

export default getCurrentAction;
