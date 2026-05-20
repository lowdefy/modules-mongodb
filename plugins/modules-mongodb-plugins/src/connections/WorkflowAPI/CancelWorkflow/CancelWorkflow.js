import createMongoDBConnection from '../../shared/createMongoDBConnection.js';
import fireTrackerSubscription from '../SubmitWorkflowAction/fireTrackerSubscription.js';
import recomputeGroups from '../SubmitWorkflowAction/recomputeGroups.js';

const RESERVED_WORKFLOW_KEYS = [
  '_id',
  'workflow_id',
  'type',
  'workflow_type',
  'entity_id',
  'entity_collection',
  'status',
  'summary',
  'groups',
  'form_data',
  'created',
  'updated',
];

async function CancelWorkflow(lowdefyContext) {
  const { request: payload = {}, connection } = lowdefyContext;
  const context = {
    mongoDBConnection: createMongoDBConnection(lowdefyContext),
    workflowsConfig: connection.workflowsConfig,
    actionsEnum: connection.actionsEnum,
    changeStamp: connection.changeStamp,
    eventId: null,
    params: payload,
  };

  if (!payload.workflow_id) {
    throw new Error('CancelWorkflow: workflow_id is required');
  }

  const workflowDoc = await context.mongoDBConnection('workflows').MongoDBFindOne({
    query: { _id: payload.workflow_id },
    options: { projection: { workflow_type: 1 } },
  });
  const workflowConfig = (context.workflowsConfig ?? []).find(
    (w) => w.type === workflowDoc?.workflow_type,
  );
  const declaredGroups = workflowConfig?.action_groups ?? [];

  const safeReferences = { ...(payload.references ?? {}) };
  for (const key of RESERVED_WORKFLOW_KEYS) {
    delete safeReferences[key];
  }

  const cancelledEntry = {
    stage: 'cancelled',
    created: context.changeStamp,
    ...(payload.reason ? { reason: payload.reason } : {}),
  };

  await context.mongoDBConnection('workflows').MongoDBUpdateOne({
    filter: { _id: payload.workflow_id },
    update: {
      $set: {
        ...safeReferences,
        updated: context.changeStamp,
      },
      $push: {
        status: {
          $position: 0,
          $each: [cancelledEntry],
        },
      },
    },
  });

  const nonTerminalActions =
    (await context.mongoDBConnection('actions').MongoDBFind({
      query: {
        workflow_id: payload.workflow_id,
        'status.0.stage': { $nin: ['done', 'not-required'] },
      },
      options: {
        projection: { _id: 1, type: 1, key: 1 },
      },
    })) ?? [];

  const actionIds = nonTerminalActions.map((a) => a._id);
  if (actionIds.length > 0) {
    await context.mongoDBConnection('actions').MongoDBUpdateMany({
      filter: { _id: { $in: actionIds } },
      update: {
        $set: { updated: context.changeStamp },
        $push: {
          status: {
            $position: 0,
            $each: [{ stage: 'not-required', created: context.changeStamp }],
          },
        },
      },
    });
  }

  const allActions =
    (await context.mongoDBConnection('actions').MongoDBFind({
      query: { workflow_id: payload.workflow_id },
      options: {
        // Project the first status entry as a 1-element slice — MongoDB can't
        // dot-project nested-array-index fields like `status.0.stage` (server
        // strips the field and returns `status: [{}]`).
        projection: { status: { $slice: 1 }, action_group: 1 },
      },
    })) ?? [];

  const total = allActions.length;
  const done = allActions.filter((a) => a.status?.[0]?.stage === 'done').length;
  const not_required = allActions.filter(
    (a) => a.status?.[0]?.stage === 'not-required',
  ).length;

  const groups = recomputeGroups({
    declaredGroups,
    actions: allActions,
  });

  await context.mongoDBConnection('workflows').MongoDBUpdateOne({
    filter: { _id: payload.workflow_id },
    update: {
      $set: {
        summary: { done, not_required, total },
        groups,
        updated: context.changeStamp,
      },
    },
  });

  // Tracker subscription — fires after the final writeback so the cancelled
  // doc is on-disk consistent before the parent recompute reads it. Returns []
  // when the workflow has no parent_action_id, so safe to call unconditionally.
  const trackerFired = await fireTrackerSubscription(context, {
    workflowId: payload.workflow_id,
    newStage: 'cancelled',
    depth: 0,
  });

  // NOTE: do NOT include completed_groups — per part 7 design, CancelWorkflow
  // doesn't fire on_complete hooks. Part 11's fan-out reads completed_groups
  // only from SubmitWorkflowAction's return.
  return { action_ids: actionIds, event_id: null, tracker_fired: trackerFired };
}

CancelWorkflow.schema = {};
CancelWorkflow.meta = {
  checkRead: false,
  checkWrite: true,
};

export default CancelWorkflow;
