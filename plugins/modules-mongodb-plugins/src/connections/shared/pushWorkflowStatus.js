/**
 * Push a workflow-lifecycle status entry onto the workflow's `status[]` array.
 *
 * Guarded by a same-stage no-op check: reads the current `status[0].stage`
 * (either from the in-memory workflow doc passed in, or via a one-shot find)
 * and returns early on equality. This is the canonical idempotency guard for
 * workflow-lifecycle pushes — distinct from the action-status priority rule
 * (workflow lifecycle is a 3-value enum with no priorities).
 *
 * Used by: auto-complete check (part 7, inlined into handleSubmit's bundled
 * $set), future tracker subscription (part 10), future CloseWorkflow handler
 * (part 23).
 *
 * @param {Object} context — engine handler context (`mongoDBConnection`, `changeStamp`).
 * @param {Object} options
 * @param {string} options.workflowId
 * @param {'completed' | 'cancelled' | 'active'} options.newStage
 * @param {string | null} [options.eventId]
 * @param {string | null} [options.currentStage] — caller-supplied stage when
 *   the workflow doc is already in memory. When omitted, the helper reads it
 *   via a one-shot `MongoDBFindOne`.
 * @returns {Promise<{ pushed: boolean, stage: string }>}
 */
async function pushWorkflowStatus(
  context,
  { workflowId, newStage, eventId = null, currentStage = null },
) {
  let resolvedCurrent = currentStage;
  if (currentStage === null) {
    const doc = await context.mongoDBConnection("workflows").MongoDBFindOne({
      query: { _id: workflowId },
      options: { projection: { status: { $slice: 1 } } },
    });
    resolvedCurrent = doc?.status?.[0]?.stage ?? null;
  }

  if (resolvedCurrent === newStage) {
    return { pushed: false, stage: newStage };
  }

  await context.mongoDBConnection("workflows").MongoDBUpdateOne({
    filter: { _id: workflowId },
    update: {
      $set: { updated: context.changeStamp },
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
  return { pushed: true, stage: newStage };
}

export default pushWorkflowStatus;
