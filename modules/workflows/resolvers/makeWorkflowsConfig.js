// Engine-runtime needs + per-action UI lookups. Build-time-only fields
// (form, form_review, form_error, pages, hooks, event) are excluded —
// they're consumed by build-time resolvers (parts 12, 13, 15) against
// the raw workflow YAML, not via workflowsConfig at runtime.
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

const ACTION_KINDS = ['form', 'simple', 'tracker'];

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

const HOOK_INTERACTIONS = [
  'submit_edit',
  'not_required',
  'resolve_error',
  'approve',
  'request_changes',
];

const HOOK_PHASES = ['pre', 'post'];

// Part 34 access verbs. Vocabulary is closed in v1 (Part 34 D4 / per-app block).
const ACCESS_VERBS = ['view', 'edit', 'review', 'error'];

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

function validateHooks(workflow, action) {
  if (!action.hooks) return;
  const where = `action "${action.type}"`;
  for (const interaction of Object.keys(action.hooks)) {
    if (!HOOK_INTERACTIONS.includes(interaction)) {
      fail(
        workflow.type,
        `${where} hooks key "${interaction}" is not a known interaction (expected one of: ${HOOK_INTERACTIONS.join(', ')}).`
      );
    }
    const phases = action.hooks[interaction];
    if (phases === null || typeof phases !== 'object') {
      fail(
        workflow.type,
        `${where} hooks.${interaction} must be an object with pre/post phase entries (got: ${JSON.stringify(phases)}).`
      );
    }
    for (const phase of Object.keys(phases)) {
      if (!HOOK_PHASES.includes(phase)) {
        fail(
          workflow.type,
          `${where} hooks.${interaction} phase "${phase}" is invalid (expected "pre" or "post").`
        );
      }
      const value = phases[phase];
      if (typeof value === 'string') {
        fail(
          workflow.type,
          `${where} hooks.${interaction}.${phase} is a string ("${value}") — the legacy shape pointing at an external Api id. Convert to an inline routine object: { routine: [ ... ] }. See action-authoring/spec.md "Action hooks contract".`
        );
      }
      if (
        value === null ||
        typeof value !== 'object' ||
        !Array.isArray(value.routine)
      ) {
        fail(
          workflow.type,
          `${where} hooks.${interaction}.${phase} must be an object with a routine: array (got: ${JSON.stringify(value)}).`
        );
      }
    }
  }
}

function validateGroupOnComplete(workflow, group) {
  if (!('on_complete' in group)) return;
  const where = `action_groups "${group.id}"`;
  const value = group.on_complete;
  if (typeof value === 'string') {
    fail(
      workflow.type,
      `${where} on_complete is a string ("${value}") — the legacy shape pointing at a YAML path. Convert to an inline routine object: { routine: [ ... ] }. See action-authoring/spec.md "Workflow YAML".`
    );
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    !Array.isArray(value.routine)
  ) {
    fail(
      workflow.type,
      `${where} on_complete must be an object with a routine: array (got: ${JSON.stringify(value)}).`
    );
  }
}

// Part 34 D4: per-app per-verb access map. `access.{app}` is a verb→gate map
// ({ view|edit|review|error }: true | [roles]). The removed action-wide
// `access.roles`, the shorthand list form (`access.{app}: [verbs]`), the empty
// list `[]`, unknown verb keys, and `notification_roles` under `access` all
// hard-error; an app block declaring edit/review/error without view lint-warns.
function validateActionAccess(workflow, action) {
  if (!action.access) return;
  const where = `action "${action.type}"`;
  const access = action.access;

  if (access === null || typeof access !== 'object' || Array.isArray(access)) {
    fail(
      workflow.type,
      `${where} access must be a map of {app_name}: { verb: gate } (got: ${JSON.stringify(access)}).`
    );
  }

  for (const [appName, block] of Object.entries(access)) {
    if (appName === 'roles') {
      fail(
        workflow.type,
        `${where} access.roles (the action-wide role gate) is removed (Part 34 D4). Every gate is per-app per-verb — move it under access.{app}.{verb}.`
      );
    }
    if (appName === 'notification_roles') {
      fail(
        workflow.type,
        `${where} notification_roles lives at the action root, not under access (Part 34 D9).`
      );
    }
    if (Array.isArray(block)) {
      fail(
        workflow.type,
        `${where} access.${appName} is the removed shorthand list form (Part 34 D1). Use the verb→gate map: access.${appName}.{verb}: true | [roles].`
      );
    }
    if (block === null || typeof block !== 'object') {
      fail(
        workflow.type,
        `${where} access.${appName} must be a verb→gate map object (got: ${JSON.stringify(block)}).`
      );
    }

    for (const [verb, gate] of Object.entries(block)) {
      if (!ACCESS_VERBS.includes(verb)) {
        fail(
          workflow.type,
          `${where} access.${appName} has unknown verb key "${verb}" (expected one of: ${ACCESS_VERBS.join(', ')}).`
        );
      }
      if (Array.isArray(gate) && gate.length === 0) {
        fail(
          workflow.type,
          `${where} access.${appName}.${verb} is the empty list [] — invalid. Omit the verb key to deny access instead (Part 34).`
        );
      }
      const gateOk =
        gate === true ||
        (Array.isArray(gate) && gate.every((r) => typeof r === 'string'));
      if (!gateOk) {
        fail(
          workflow.type,
          `${where} access.${appName}.${verb} gate must be true or a non-empty array of role strings (got: ${JSON.stringify(gate)}).`
        );
      }
    }

    const declaresPrivileged =
      'edit' in block || 'review' in block || 'error' in block;
    if (!('view' in block) && declaresPrivileged) {
      console.warn(
        `makeWorkflowsConfig: workflow "${workflow.type}": ${where} access.${appName} declares edit/review/error without view — users granted those verbs may be unable to read the action. Add "view" if that's unintended (Part 34 D4).`
      );
    }
  }
}

// Part 30 D9: status_map cell shape. Each `status_map[stage]` is a cell of
// per-slug `{ message? }` objects plus a reserved `status_title` (string|null).
// Built-in kinds reject `link:` (engine-managed); `kind: custom` (Part 28, not
// yet a valid kind) would accept `{ message?, link? }`. No coverage requirement.
function validateStatusMapCells(workflow, action) {
  if (!action.status_map) return;
  const where = `action "${action.type}"`;
  const isCustom = action.kind === 'custom';

  for (const [stage, cell] of Object.entries(action.status_map)) {
    if (!ACTION_STATUSES.includes(stage)) {
      fail(
        workflow.type,
        `${where} status_map key "${stage}" is not a member of action_statuses.`
      );
    }
    if (cell === null || typeof cell !== 'object' || Array.isArray(cell)) {
      fail(
        workflow.type,
        `${where} status_map.${stage} must be an object of {slug}: { message? } cells (got: ${JSON.stringify(cell)}).`
      );
    }

    for (const [key, value] of Object.entries(cell)) {
      if (key === 'status_title') {
        if (!(value === null || typeof value === 'string')) {
          fail(
            workflow.type,
            `${where} status_map.${stage}.status_title must be a string or null (got: ${JSON.stringify(value)}).`
          );
        }
        continue;
      }
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        fail(
          workflow.type,
          `${where} status_map.${stage}.${key} must be a cell object (got: ${JSON.stringify(value)}).`
        );
      }
      if ('link' in value && !isCustom) {
        fail(
          workflow.type,
          `${where} status_map.${stage}.${key}: link is engine-managed for kind: ${action.kind}; remove it from status_map.${stage}.${key}. To restrict navigation per slug, edit access.${key} verbs instead.`
        );
      }
      if ('message' in value && typeof value.message !== 'string') {
        fail(
          workflow.type,
          `${where} status_map.${stage}.${key}.message must be a string (got: ${JSON.stringify(value.message)}).`
        );
      }
    }
  }
}

function validateAction(workflow, action) {
  const where = `action "${action.type}"`;

  if (!ACTION_KINDS.includes(action.kind)) {
    fail(
      workflow.type,
      `${where} has unknown kind "${action.kind}" (expected form, simple, or tracker).`
    );
  }

  if (action.kind === 'form' && !action.form) {
    fail(workflow.type, `${where} has kind "form" but no form: block.`);
  }
  if (action.kind === 'tracker' && !action.tracker) {
    fail(workflow.type, `${where} has kind "tracker" but no tracker: block.`);
  }
  if (action.kind === 'simple' && (action.form || action.tracker)) {
    fail(
      workflow.type,
      `${where} has kind "simple" but defines form: or tracker:.`
    );
  }
  if (action.form && action.tracker) {
    fail(workflow.type, `${where} cannot define both form: and tracker:.`);
  }

  validateActionAccess(workflow, action);
  validateStatusMapCells(workflow, action);
  validateHooks(workflow, action);
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
    validateGroupOnComplete(workflow, group);
  }

  for (const action of actions) {
    validateAction(workflow, action);
    if (action.action_group && !groupIds.has(action.action_group)) {
      fail(
        workflow.type,
        `action "${action.type}" references unknown action_group "${action.action_group}".`
      );
    }
    const blockedBy = action.blocked_by ?? [];
    for (const entry of blockedBy) {
      if (!groupIds.has(entry) && !actionTypes.has(entry)) {
        fail(
          workflow.type,
          `action "${action.type}" blocked_by entry "${entry}" resolves to neither a declared action_groups[].id nor a declared actions[].type.`
        );
      }
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
