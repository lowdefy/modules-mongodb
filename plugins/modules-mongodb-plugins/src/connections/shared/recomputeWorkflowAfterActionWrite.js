import recomputeGroups from "../WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js";
import reevaluateBlockedActions from "../WorkflowAPI/SubmitWorkflowAction/reevaluateBlockedActions.js";
import getActions from "./getActions.js";

const TERMINAL = ["done", "not-required"];

/**
 * Run the post-action-write recompute for one workflow: sub-step 4a (recompute
 * groups), 4b (re-evaluate blocked_by), 4c (auto-complete check), and step 5
 * (bundled summary + groups + optional `completed` $push on the workflow doc).
 *
 * Reads fresh state per `workflowId` — the workflow doc and its actions are
 * loaded inside the helper. Callers must NOT pass cached docs; the helper is
 * built specifically so the tracker-recursion path (part 10) can run it on a
 * different workflow than the originating handler's cache reflects.
 *
 * Consumers:
 *   - `handleSubmit` (after step 4 writes action transitions)
 *   - `fireTrackerSubscription` (after the parent-tracker write, on the parent
 *     workflow)
 *
 * @param {Object} context — engine handler context (`mongoDBConnection`,
 *   `changeStamp`, `eventId`, `workflowsConfig`, `actionsEnum`).
 * @param {Object} options
 * @param {string} options.workflowId — the workflow whose actions just changed.
 * @returns {Promise<{
 *   workflow: Object,
 *   workflowActions: Array,
 *   groupsBefore: Array,
 *   groupsAfter: Array,
 *   reEvaluatedActionIds: string[],
 *   shouldPushCompleted: boolean,
 *   summary: { done: number, not_required: number, total: number },
 * }>}
 */
async function recomputeWorkflowAfterActionWrite(context, { workflowId }) {
  const workflow = await context
    .mongoDBConnection("workflows")
    .MongoDBFindOne({ query: { _id: workflowId } });
  if (!workflow) {
    throw new Error(
      `recomputeWorkflowAfterActionWrite: workflow ${workflowId} not found`,
    );
  }

  const workflowConfig = (context.workflowsConfig ?? []).find(
    (w) => w.type === workflow.workflow_type,
  );
  if (!workflowConfig) {
    throw new Error(
      `recomputeWorkflowAfterActionWrite: workflow_type "${workflow.workflow_type}" not in workflowsConfig`,
    );
  }
  context.actionsConfig = workflowConfig.actions ?? [];

  const declaredGroups = workflowConfig.action_groups ?? [];
  const groupsBefore = workflow.groups ?? [];

  const workflowActions = await getActions(context.mongoDBConnection, workflow._id);

  let groupsAfter = recomputeGroups({
    declaredGroups,
    actions: workflowActions,
  });

  const reEvaluatedActionIds = await reevaluateBlockedActions(context, {
    workflowActions,
    actionsConfig: context.actionsConfig,
    groups: groupsAfter,
    declaredGroups,
    eventId: context.eventId,
  });
  if (reEvaluatedActionIds.length > 0) {
    const refreshed = await getActions(context.mongoDBConnection, workflow._id);
    workflowActions.splice(0, workflowActions.length, ...refreshed);
    groupsAfter = recomputeGroups({
      declaredGroups,
      actions: workflowActions,
    });
  }

  const allTerminal =
    workflowActions.length > 0 &&
    workflowActions.every((a) => TERMINAL.includes(a.status?.[0]?.stage));
  const currentWorkflowStage = workflow.status?.[0]?.stage;
  const shouldPushCompleted =
    allTerminal &&
    currentWorkflowStage !== "completed" &&
    currentWorkflowStage !== "cancelled";

  const summary = {
    done: workflowActions.filter((a) => a.status?.[0]?.stage === "done").length,
    not_required: workflowActions.filter(
      (a) => a.status?.[0]?.stage === "not-required",
    ).length,
    total: workflowActions.length,
  };

  const setBlock = {
    summary,
    groups: groupsAfter,
    updated: context.changeStamp,
  };
  const update = shouldPushCompleted
    ? {
        $set: setBlock,
        $push: {
          status: {
            $position: 0,
            $each: [
              {
                stage: "completed",
                event_id: context.eventId,
                created: context.changeStamp,
              },
            ],
          },
        },
      }
    : { $set: setBlock };

  try {
    await context.mongoDBConnection("workflows").MongoDBUpdateOne({
      filter: { _id: workflow._id },
      update,
    });
  } catch (err) {
    err.step = err.step ?? "recompute-summary";
    throw err;
  }

  return {
    workflow,
    workflowActions,
    groupsBefore,
    groupsAfter,
    reEvaluatedActionIds,
    shouldPushCompleted,
    summary,
  };
}

export default recomputeWorkflowAfterActionWrite;
