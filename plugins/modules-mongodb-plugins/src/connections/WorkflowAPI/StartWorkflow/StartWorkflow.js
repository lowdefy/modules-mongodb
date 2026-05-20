import { randomUUID } from 'node:crypto';

import createMongoDBConnection from '../../shared/createMongoDBConnection.js';
import createAction from '../../shared/createAction.js';
import getActionFields from '../../shared/getActionFields.js';
import updateAction from '../../shared/updateAction.js';
import recomputeGroups from '../SubmitWorkflowAction/recomputeGroups.js';

async function StartWorkflow(lowdefyContext) {
  const { request: payload = {}, connection } = lowdefyContext;
  const context = {
    mongoDBConnection: createMongoDBConnection(lowdefyContext),
    workflowsConfig: connection.workflowsConfig,
    actionsEnum: connection.actionsEnum,
    changeStamp: connection.changeStamp,
    params: payload,
  };

  if (!payload.workflow_type) {
    throw new Error('StartWorkflow: workflow_type is required');
  }
  if (!payload.entity_id) {
    throw new Error('StartWorkflow: entity_id is required');
  }
  if (!payload.entity_collection) {
    throw new Error('StartWorkflow: entity_collection is required');
  }

  const workflowConfig = (context.workflowsConfig ?? []).find(
    (w) => w.type === payload.workflow_type,
  );
  if (!workflowConfig) {
    throw new Error(
      `StartWorkflow: workflow_type "${payload.workflow_type}" not found in workflowsConfig`,
    );
  }

  context.actionsConfig = workflowConfig.actions ?? [];

  const startingActions = payload.actions ?? workflowConfig.starting_actions ?? [];

  if (!payload.actions) {
    for (const entry of startingActions) {
      const cfg = context.actionsConfig.find((a) => a.type === entry.type);
      if (cfg && cfg.key !== undefined) {
        throw new Error(
          `StartWorkflow: starting_actions cannot reference keyed actions (type "${entry.type}"); pass them via the actions: payload instead`,
        );
      }
    }
  }

  let parent = null;
  if (payload.parent_action_id) {
    parent = await getActionFields(context.mongoDBConnection, payload.parent_action_id);
    if (!parent) {
      throw new Error('StartWorkflow: parent action not found');
    }
    if (parent.kind !== 'tracker') {
      throw new Error('StartWorkflow: parent action is not kind: tracker');
    }
    if (parent.child_workflow_id != null) {
      throw new Error(
        'StartWorkflow: parent action is already linked to a child workflow',
      );
    }
    if (parent.tracker?.workflow_type !== payload.workflow_type) {
      throw new Error(
        'StartWorkflow: workflow_type does not match parent tracker.workflow_type',
      );
    }
  }

  const workflowDoc = {
    ...payload.references,
    _id: randomUUID(),
    workflow_type: payload.workflow_type,
    key: workflowConfig.key ?? null,
    display_order: workflowConfig.display_order,
    entity_id: payload.entity_id,
    entity_collection: payload.entity_collection,
    status: [{ stage: 'active', created: context.changeStamp }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
    parent_action_id: parent ? payload.parent_action_id : null,
    parent_entity_id: parent ? parent.entity_id : null,
    parent_entity_collection: parent ? parent.entity_collection : null,
    created: context.changeStamp,
    updated: context.changeStamp,
  };

  const actionDrafts = startingActions.map((action) =>
    createAction(context, { workflow: workflowDoc, action, eventId: null }),
  );

  const notRequiredCount = actionDrafts.filter(
    (a) => a.status[0]?.stage === 'not-required',
  ).length;
  workflowDoc.summary = {
    done: 0,
    not_required: notRequiredCount,
    total: actionDrafts.length,
  };
  workflowDoc.groups = recomputeGroups({
    declaredGroups: workflowConfig.action_groups ?? [],
    actions: actionDrafts,
  });

  await context.mongoDBConnection('workflows').MongoDBInsertOne({ doc: workflowDoc });
  if (actionDrafts.length > 0) {
    await context
      .mongoDBConnection('actions')
      .MongoDBInsertMany({ docs: actionDrafts });
  }

  if (parent) {
    await updateAction(context, {
      actionId: payload.parent_action_id,
      newStage: 'in-progress',
      fields: {
        child_workflow_id: workflowDoc._id,
        child_entity_id: workflowDoc.entity_id,
        child_entity_collection: workflowDoc.entity_collection,
      },
      eventId: null,
      force: true,
    });
  }

  return {
    workflow_id: workflowDoc._id,
    action_ids: actionDrafts.map((a) => a._id),
  };
}

StartWorkflow.schema = {};
StartWorkflow.meta = {
  checkRead: false,
  checkWrite: true,
};

export default StartWorkflow;
