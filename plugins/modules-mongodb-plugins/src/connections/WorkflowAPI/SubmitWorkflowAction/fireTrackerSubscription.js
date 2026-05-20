import getActionFields from "../../shared/getActionFields.js";
import recomputeWorkflowAfterActionWrite from "../../shared/recomputeWorkflowAfterActionWrite.js";
import updateAction from "../../shared/updateAction.js";

/**
 * Child workflow stage → parent tracker action stage.
 */
export const CHILD_STAGE_MAP = {
  active: "in-progress",
  completed: "done",
  cancelled: "not-required",
};

const MAX_DEPTH = 10;

/**
 * Mirror a workflow status change onto its parent tracker action. Recurses
 * when the parent's own recompute pushes the parent workflow to `completed`.
 *
 * Trigger sites:
 *   - `handleSubmit` step 10, after auto-complete pushed `completed` in step 5.
 *   - `CancelWorkflow`, after the final summary + groups writeback.
 *
 * @param {Object} context — engine handler context (`mongoDBConnection`,
 *   `changeStamp`, `eventId`, `workflowsConfig`, `actionsEnum`).
 * @param {Object} options
 * @param {string} options.workflowId — the workflow whose status just changed.
 * @param {'active' | 'completed' | 'cancelled'} options.newStage — the child
 *   workflow's new lifecycle stage.
 * @param {number} [options.depth] — recursion depth counter.
 * @returns {Promise<Array<{ parent_action_id: string, parent_workflow_id: string, new_status: string }>>}
 *   The fire chain — newest at index 0, empty array when no parent was written.
 */
async function fireTrackerSubscription(
  context,
  { workflowId, newStage, depth = 0 },
) {
  if (depth >= MAX_DEPTH) {
    const err = new Error(
      `fireTrackerSubscription: depth limit (${MAX_DEPTH}) exceeded — possible cycle in workflow parent linking`,
    );
    err.step = "tracker-subscription";
    throw err;
  }

  const child = await context.mongoDBConnection("workflows").MongoDBFindOne({
    query: { _id: workflowId },
    options: { projection: { parent_action_id: 1 } },
  });
  if (!child) return [];
  if (child.parent_action_id == null) return [];

  const tracker = await getActionFields(
    context.mongoDBConnection,
    child.parent_action_id,
  );
  if (!tracker) return [];

  const targetStage = CHILD_STAGE_MAP[newStage];
  if (targetStage === undefined) return [];

  if (tracker.status?.[0]?.stage === targetStage) return [];

  await updateAction(context, {
    actionId: tracker._id,
    newStage: targetStage,
    fields: {},
    eventId: context.eventId,
    currentActionId: null,
    force: true,
  });

  const parentResult = await recomputeWorkflowAfterActionWrite(context, {
    workflowId: tracker.workflow_id,
  });

  const thisFire = {
    parent_action_id: tracker._id,
    parent_workflow_id: tracker.workflow_id,
    new_status: targetStage,
  };

  if (parentResult.shouldPushCompleted === true) {
    const upstreamFires = await fireTrackerSubscription(context, {
      workflowId: tracker.workflow_id,
      newStage: "completed",
      depth: depth + 1,
    });
    return [thisFire, ...upstreamFires];
  }

  return [thisFire];
}

export default fireTrackerSubscription;
