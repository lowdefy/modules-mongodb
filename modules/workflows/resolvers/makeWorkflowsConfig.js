// Engine-runtime needs + per-action UI lookups. Build-time-only fields
// (form, form_review, form_error, pages, hooks, interactions, event) are
// excluded — they're consumed by build-time resolvers (parts 12, 13, 15)
// against the raw workflow YAML, not via workflowsConfig at runtime.
const ACTION_FIELDS = [
  'type',
  'kind',
  'key',
  'tracker',
  'blocked_by',
  'action_group',
  'sort_order',
  'required_after_close',
  'access',
  'status_map',
];

const WORKFLOW_FIELDS = [
  'type',
  'entity_collection',
  'display_order',
  'starting_actions',
  'action_groups',
];

const ACTION_KINDS = ['form', 'task', 'tracker'];

const ACTION_STATUSES = [
  'not-required',
  'error',
  'changes-required',
  'done',
  'in-review',
  'in-progress',
  'action-required',
  'blocked',
];

function pick(source, fields) {
  const picked = {};
  for (const field of fields) {
    if (field in source) picked[field] = source[field];
  }
  return picked;
}

function fail(workflowType, message) {
  throw new Error(`makeWorkflowsConfig: workflow "${workflowType}": ${message}`);
}

function validateAction(workflow, action) {
  const where = `action "${action.type}"`;

  if (!ACTION_KINDS.includes(action.kind)) {
    fail(
      workflow.type,
      `${where} has unknown kind "${action.kind}" (expected form, task, or tracker).`
    );
  }

  if (action.kind === 'form' && !action.form) {
    fail(workflow.type, `${where} has kind "form" but no form: block.`);
  }
  if (action.kind === 'tracker' && !action.tracker) {
    fail(workflow.type, `${where} has kind "tracker" but no tracker: block.`);
  }
  if (action.kind === 'task' && (action.form || action.tracker)) {
    fail(
      workflow.type,
      `${where} has kind "task" but defines form: or tracker:.`
    );
  }
  if (action.form && action.tracker) {
    fail(workflow.type, `${where} cannot define both form: and tracker:.`);
  }

  if (action.status_map) {
    for (const status of Object.keys(action.status_map)) {
      if (!ACTION_STATUSES.includes(status)) {
        fail(
          workflow.type,
          `${where} status_map key "${status}" is not a member of action_statuses.`
        );
      }
    }
  }
}

function validateWorkflow(workflow) {
  if ('entity_type' in workflow) {
    fail(
      workflow.type,
      'legacy "entity_type" field is no longer supported; rename to "entity_collection" (a MongoDB collection connection id like "leads-collection").'
    );
  }

  const actions = workflow.actions ?? [];
  const groups = workflow.action_groups ?? [];
  const startingActions = workflow.starting_actions ?? [];

  const actionTypes = new Set();
  for (const action of actions) {
    if (actionTypes.has(action.type)) {
      fail(workflow.type, `duplicate action type "${action.type}".`);
    }
    actionTypes.add(action.type);
  }

  const groupIds = new Set();
  for (const group of groups) {
    if (actionTypes.has(group.id)) {
      fail(
        workflow.type,
        `action_groups id "${group.id}" collides with an action type.`
      );
    }
    groupIds.add(group.id);
  }

  for (const action of actions) {
    validateAction(workflow, action);
    if (action.action_group && !groupIds.has(action.action_group)) {
      fail(
        workflow.type,
        `action "${action.type}" references unknown action_group "${action.action_group}".`
      );
    }
  }

  for (const entry of startingActions) {
    if (!actionTypes.has(entry.type)) {
      fail(
        workflow.type,
        `starting_actions entry references unknown action type "${entry.type}".`
      );
    }
    if (!ACTION_STATUSES.includes(entry.status)) {
      fail(
        workflow.type,
        `starting_actions entry for "${entry.type}" has invalid status "${entry.status}".`
      );
    }
  }
}

function makeWorkflowsConfig(_, vars) {
  const { workflows } = vars;

  return workflows.map((workflow) => {
    validateWorkflow(workflow);

    const actions = (workflow.actions ?? []).map((action) =>
      pick(action, ACTION_FIELDS)
    );

    return {
      ...pick(workflow, WORKFLOW_FIELDS),
      actions,
    };
  });
}

export default makeWorkflowsConfig;
