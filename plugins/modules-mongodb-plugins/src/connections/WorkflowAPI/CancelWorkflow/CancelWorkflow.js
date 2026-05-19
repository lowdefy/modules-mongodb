import createMongoDBConnection from '../../shared/createMongoDBConnection.js';

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
    params: payload,
  };

  if (!payload.workflow_id) {
    throw new Error('CancelWorkflow: workflow_id is required');
  }

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
        projection: { 'status.0.stage': 1 },
      },
    })) ?? [];

  const total = allActions.length;
  const done = allActions.filter((a) => a.status?.[0]?.stage === 'done').length;
  const not_required = allActions.filter(
    (a) => a.status?.[0]?.stage === 'not-required',
  ).length;

  await context.mongoDBConnection('workflows').MongoDBUpdateOne({
    filter: { _id: payload.workflow_id },
    update: {
      $set: {
        summary: { done, not_required, total },
        updated: context.changeStamp,
      },
    },
  });

  return { action_ids: actionIds, event_id: null, tracker_fired: null };
}

CancelWorkflow.schema = {};
CancelWorkflow.meta = {
  checkRead: false,
  checkWrite: true,
};

export default CancelWorkflow;
