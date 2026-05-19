import { randomUUID } from 'node:crypto';

/**
 * Build an action doc draft (caller inserts via MongoDBInsertOne / MongoDBInsertMany).
 *
 * Pure builder — does not touch `context.mongoDBConnection`.
 *
 * @param {Object} context — engine handler context.
 * @param {Object} context.changeStamp
 * @param {Array<Object>} context.actionsConfig — workflow's actions[] from workflowsConfig.
 * @param {Object} options
 * @param {Object} options.workflow — the workflow doc this action belongs to
 *   (for `workflow_id`, `entity_id`, `entity_collection`).
 * @param {Object} options.action — { type, key?, status, fields?, references? } —
 *   entry from payload `actions[]` or YAML `starting_actions`.
 * @param {string | null} [options.eventId] — optional event id threaded into the status entry.
 * @returns {Object} the action doc draft.
 */
function createAction(context, { workflow, action, eventId = null }) {
  const actionConfig = (context.actionsConfig ?? []).find(
    (a) => a.type === action.type,
  );
  if (!actionConfig) {
    throw new Error(
      `createAction: action type "${action.type}" not found in workflow actions config`,
    );
  }

  return {
    ...action.references,
    _id: randomUUID(),
    workflow_id: workflow._id,
    type: action.type,
    kind: actionConfig.kind,
    key: action.key ?? null,
    status: [
      {
        stage: action.status,
        event_id: eventId,
        created: context.changeStamp,
      },
    ],
    entity_id: workflow.entity_id,
    entity_collection: workflow.entity_collection,
    assignees: action.fields?.assignees ?? [],
    due_date: action.fields?.due_date ?? null,
    description: action.fields?.description ?? null,
    tracker:
      actionConfig.kind === 'tracker'
        ? { workflow_type: actionConfig.tracker.workflow_type }
        : null,
    child_workflow_id: null,
    child_entity_id: null,
    child_entity_collection: null,
    created: context.changeStamp,
    updated: context.changeStamp,
  };
}

export default createAction;
