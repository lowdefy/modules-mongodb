import createMongoDBConnection from '../../shared/createMongoDBConnection.js';
import fireTrackerSubscription from '../SubmitWorkflowAction/fireTrackerSubscription.js';
import recomputeGroups from '../../shared/phases/planners/recomputeGroups.js';

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

async function CloseWorkflow(lowdefyContext) {
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
    throw new Error('CloseWorkflow: workflow_id is required');
  }

  const workflowDoc = await context.mongoDBConnection('workflows').MongoDBFindOne({
    query: { _id: payload.workflow_id },
    options: {
      // Project the first status entry as a 1-element slice — MongoDB can't
      // dot-project nested-array-index fields like `status.0.stage`.
      projection: { status: { $slice: 1 }, workflow_type: 1 },
    },
  });

  if (!workflowDoc) {
    throw new Error(
      `CloseWorkflow: workflow ${payload.workflow_id} not found`,
    );
  }

  const currentStage = workflowDoc.status?.[0]?.stage;

  if (currentStage === 'completed') {
    return { action_ids: [], event_id: null, tracker_fired: [] };
  }

  if (currentStage === 'cancelled') {
    throw new Error(
      `CloseWorkflow: workflow ${payload.workflow_id} is cancelled; cannot close`,
    );
  }

  const workflowConfig = (context.workflowsConfig ?? []).find(
    (w) => w.type === workflowDoc.workflow_type,
  );
  const declaredGroups = workflowConfig?.action_groups ?? [];
  const requiredAfterCloseByType = Object.fromEntries(
    (workflowConfig?.actions ?? []).map((a) => [
      a.type,
      a.required_after_close === true,
    ]),
  );

  const safeReferences = { ...(payload.references ?? {}) };
  for (const key of RESERVED_WORKFLOW_KEYS) {
    delete safeReferences[key];
  }

  const completedEntry = {
    stage: 'completed',
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
          $each: [completedEntry],
        },
      },
    },
  });

  const candidateActions =
    (await context.mongoDBConnection('actions').MongoDBFind({
      query: {
        workflow_id: payload.workflow_id,
        'status.0.stage': { $nin: ['done', 'not-required'] },
      },
      options: {
        projection: {
          _id: 1,
          type: 1,
          key: 1,
          status: { $slice: 1 },
        },
      },
    })) ?? [];

  const actionsToSweep = candidateActions.filter((a) => {
    const isBlocked = a.status?.[0]?.stage === 'blocked';
    const requiredAfterClose = requiredAfterCloseByType[a.type] === true;
    // Sweep when not protected, OR when blocked (blocked-action exception).
    return !requiredAfterClose || isBlocked;
  });
  const actionIds = actionsToSweep.map((a) => a._id);

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
        // dot-project nested-array-index fields like `status.0.stage`.
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

  // Tracker subscription — fires after the final writeback so the completed
  // doc is on-disk consistent before the parent recompute reads it. Returns []
  // when the workflow has no parent_action_id, so safe to call unconditionally.
  const trackerFired = await fireTrackerSubscription(context, {
    workflowId: payload.workflow_id,
    newStage: 'completed',
    depth: 0,
  });

  return {
    action_ids: actionIds,
    event_id: null,
    tracker_fired: trackerFired,
  };
}

CloseWorkflow.schema = {};
CloseWorkflow.meta = {
  checkRead: false,
  checkWrite: true,
};

export default CloseWorkflow;
