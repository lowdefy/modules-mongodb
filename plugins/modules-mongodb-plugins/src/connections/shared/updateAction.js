/**
 * Update one action doc — push a new status entry, optionally set additional fields.
 *
 * v1 scope: supports `force: true` only (callers explicitly opt in). The priority-rule
 * path lands in part 06, which extends this function in place. Until then, every
 * caller passes `force: true`; calls without `force: true` throw.
 *
 * @param {Object} context — engine handler context (has `mongoDBConnection`, `changeStamp`).
 * @param {Object} options
 * @param {string} options.actionId
 * @param {string} options.newStage — the status enum key to push (`in-progress`, `not-required`, etc.).
 * @param {Object} [options.fields] — additional `$set` fields (e.g. `child_workflow_id`, `child_entity_id`).
 * @param {string | null} [options.eventId]
 * @param {boolean} [options.force] — required `true` in v1; future task in part 06 makes this optional.
 * @returns {Promise<any>}
 */
async function updateAction(
  context,
  { actionId, newStage, fields = {}, eventId = null, force },
) {
  if (force !== true) {
    throw new Error(
      'updateAction: priority-rule path is part 06 scope; this scaffold requires force: true',
    );
  }

  return context.mongoDBConnection('actions').MongoDBUpdateOne({
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
