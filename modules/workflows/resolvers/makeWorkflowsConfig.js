import { HOOK_SIGNALS, HOOK_PHASES, MIRROR_SIGNALS, LIFECYCLE_SIGNALS } from './hookSignals.js';
import { collectTrackerEdges } from './trackerEdges.js';

// Engine-runtime needs + per-action UI lookups. Build-time-only fields
// (form, form_review, form_error, pages, hooks, event) are excluded —
// they're consumed by build-time resolvers (parts 12, 13, 15) against
// the raw workflow YAML, not via workflowsConfig at runtime.
//
// `status_map` is deliberately NOT picked here (Part 48): it's the blob's one
// heavy per-stage × per-app field, paid for all workflows on every connection
// call. It now arrives per-request via the write endpoints' `render_config`
// and is spliced onto the action config at load time (loadWorkflowState seam,
// task 3). Build-time validation of `status_map` cells (validateStatusMapCells)
// still runs against the raw workflow — the field is validated here even though
// it's no longer carried on the blob.
const ACTION_FIELDS = [
  'type',
  'kind',
  'key',
  'tracker',
  'blocked_by',
  'action_group',
  'sort_order',
  'required_after_close',
  'allow_not_required',
  'access',
];

const WORKFLOW_FIELDS = [
  'type',
  'title',
  'entity_collection',
  'entity_ref_key',
  'display_order',
  'starting_actions',
  'action_groups',
];

// --- form_meta projection (ported from makeActionFormConfigs.js) ------------
// Walks form arrays and emits { component, key, required, title, validate }
// per node, recursing into structural components. Produces the same shape as
// makeActionFormConfigs so the overview pages' inline submitted-data rendering
// continues to work once they switch to reading from workflowsConfig.

const STRUCTURAL_COMPONENTS = [
  'controlled_list',
  'section',
  'box',
  'label',
  'file_upload',
];

const METADATA_FIELDS = ['component', 'key', 'required', 'title', 'validate'];

function pickMetadata(entry) {
  const node = {};
  for (const field of METADATA_FIELDS) {
    if (field in entry) node[field] = entry[field];
  }
  if (!('required' in node)) node.required = false;
  return node;
}

function toMetadataNode(entry) {
  const node = pickMetadata(entry);
  if (entry.component && STRUCTURAL_COMPONENTS.includes(entry.component)) {
    node.form = (entry.form ?? []).map(toMetadataNode);
  }
  return node;
}

function describeForm(formArray) {
  return (formArray ?? []).map(toMetadataNode);
}

const ACTION_KINDS = ['form', 'check', 'tracker'];

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

// The two legal direct-seed statuses for starting_actions (Part 45 review 2 #2;
// task 17). Creation at workflow start is not an FSM transition, so a seed may
// only land at one of the two non-terminal birth stages.
const LEGAL_SEED_STATUSES = ['action-required', 'blocked'];

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
  for (const signal of Object.keys(action.hooks)) {
    if (!HOOK_SIGNALS.includes(signal)) {
      fail(
        workflow.type,
        `${where} hooks key "${signal}" is not a known signal (expected one of: ${HOOK_SIGNALS.join(', ')}).`
      );
    }
    const phases = action.hooks[signal];
    if (phases === null || typeof phases !== 'object') {
      fail(
        workflow.type,
        `${where} hooks.${signal} must be an object with pre/post phase entries (got: ${JSON.stringify(phases)}).`
      );
    }
    for (const phase of Object.keys(phases)) {
      if (!HOOK_PHASES.includes(phase)) {
        fail(
          workflow.type,
          `${where} hooks.${signal} phase "${phase}" is invalid (expected "pre" or "post").`
        );
      }
      const value = phases[phase];
      if (typeof value === 'string') {
        fail(
          workflow.type,
          `${where} hooks.${signal}.${phase} is a string ("${value}") — the legacy shape pointing at an external Api id. Convert to an inline routine object: { routine: [ ... ] }. See action-authoring/spec.md "Action hooks contract".`
        );
      }
      if (
        value === null ||
        typeof value !== 'object' ||
        !Array.isArray(value.routine)
      ) {
        fail(
          workflow.type,
          `${where} hooks.${signal}.${phase} must be an object with a routine: array (got: ${JSON.stringify(value)}).`
        );
      }
    }
  }
}

function validateEvent(workflow, action) {
  if (!action.event) return;
  const where = `action "${action.type}"`;
  const isTracker = action.kind === 'tracker';
  for (const signal of Object.keys(action.event)) {
    if (HOOK_SIGNALS.includes(signal)) continue;
    if (isTracker && MIRROR_SIGNALS.includes(signal)) continue;
    if (!isTracker && MIRROR_SIGNALS.includes(signal)) {
      fail(
        workflow.type,
        `${where} event key "${signal}" is a mirror signal and is only valid on kind: tracker actions (allowed for tracker: ${[...HOOK_SIGNALS, ...MIRROR_SIGNALS].join(', ')}; allowed for non-tracker: ${HOOK_SIGNALS.join(', ')}).`
      );
    }
    fail(
      workflow.type,
      `${where} event key "${signal}" is not a known signal (expected one of: ${HOOK_SIGNALS.join(', ')}${isTracker ? `, ${MIRROR_SIGNALS.join(', ')}` : ''}).`
    );
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

// Part 48 D6: tracker.child_workflow_type validation. Every kind: tracker action
// must declare a non-empty string child_workflow_type. Cross-workflow resolution
// (does the value match a declared workflow type?) and cycle detection are
// performed after all per-workflow validation in makeWorkflowsConfig (they
// require the full workflow set). The legacy key tracker.workflow_type
// hard-errors with a rename hint.
function validateTrackerChildWorkflowType(workflow, action) {
  if (action.kind !== 'tracker') return;
  const where = `action "${action.type}"`;
  const tracker = action.tracker;

  if ('workflow_type' in tracker) {
    fail(
      workflow.type,
      `${where} tracker.workflow_type is renamed — use tracker.child_workflow_type (Part 48 D6).`
    );
  }

  if (
    typeof tracker.child_workflow_type !== 'string' ||
    tracker.child_workflow_type === ''
  ) {
    fail(
      workflow.type,
      `${where} tracker.child_workflow_type must be a non-empty string (got: ${JSON.stringify(tracker.child_workflow_type)}).`
    );
  }
}

// Part 44: tracker.start_link validation. An optional engine-link shape
// { pageId: string, urlQuery?: object }. Reserved urlQuery keys action_id /
// entity_id are sentinel-only (value must be exactly true); all other keys
// must carry string values (static params, passed through verbatim). Any
// other key at the top level (e.g. title:) hard-errors because the engine-link
// shape only supports pageId / urlQuery — title is familiar from custom-kind
// cell links but is not valid here.
const TRACKER_START_LINK_ALLOWED_KEYS = new Set(['pageId', 'urlQuery']);
const TRACKER_URL_QUERY_SENTINEL_KEYS = new Set(['action_id', 'entity_id']);

function validateTrackerStartLink(workflow, action) {
  if (!action.tracker?.start_link) return;
  const where = `action "${action.type}"`;
  const startLink = action.tracker.start_link;

  if (
    startLink === null ||
    typeof startLink !== 'object' ||
    Array.isArray(startLink)
  ) {
    fail(
      workflow.type,
      `${where} tracker.start_link must be a plain object (got: ${JSON.stringify(startLink)}).`
    );
  }

  for (const key of Object.keys(startLink)) {
    if (!TRACKER_START_LINK_ALLOWED_KEYS.has(key)) {
      fail(
        workflow.type,
        `${where} tracker.start_link has unknown key "${key}" — only pageId and urlQuery are allowed (note: "title" is not part of the engine-link shape).`
      );
    }
  }

  const { pageId, urlQuery } = startLink;

  if (typeof pageId !== 'string' || pageId === '') {
    fail(
      workflow.type,
      `${where} tracker.start_link.pageId must be a non-empty string (got: ${JSON.stringify(pageId)}).`
    );
  }

  if (urlQuery !== undefined) {
    if (urlQuery === null || typeof urlQuery !== 'object' || Array.isArray(urlQuery)) {
      fail(
        workflow.type,
        `${where} tracker.start_link.urlQuery must be a plain object (got: ${JSON.stringify(urlQuery)}).`
      );
    }

    for (const [key, value] of Object.entries(urlQuery)) {
      if (TRACKER_URL_QUERY_SENTINEL_KEYS.has(key)) {
        if (value !== true) {
          fail(
            workflow.type,
            `${where} tracker.start_link.urlQuery.${key} is a reserved sentinel key — its value must be exactly true (got: ${JSON.stringify(value)}).`
          );
        }
      } else {
        if (typeof value !== 'string') {
          fail(
            workflow.type,
            `${where} tracker.start_link.urlQuery.${key} must be a string (static param passed through verbatim) (got: ${JSON.stringify(value)}).`
          );
        }
      }
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
      `${where} has unknown kind "${action.kind}" (expected form, check, or tracker).`
    );
  }

  if (action.kind === 'form' && !action.form) {
    fail(workflow.type, `${where} has kind "form" but no form: block.`);
  }
  if (action.kind === 'tracker' && !action.tracker) {
    fail(workflow.type, `${where} has kind "tracker" but no tracker: block.`);
  }
  if (action.kind === 'check' && (action.form || action.tracker)) {
    fail(
      workflow.type,
      `${where} has kind "check" but defines form: or tracker:.`
    );
  }
  if (action.form && action.tracker) {
    fail(workflow.type, `${where} cannot define both form: and tracker:.`);
  }

  if ('allow_not_required' in action && typeof action.allow_not_required !== 'boolean') {
    fail(
      workflow.type,
      `${where} allow_not_required must be a boolean (got: ${JSON.stringify(action.allow_not_required)}).`
    );
  }

  validateActionAccess(workflow, action);
  validateStatusMapCells(workflow, action);
  validateTrackerChildWorkflowType(workflow, action);
  validateTrackerStartLink(workflow, action);
  validateHooks(workflow, action);
  validateEvent(workflow, action);
}

// Part 48 D8: workflow-level event map. Keys must be LIFECYCLE_SIGNALS
// (started / cancelled / closed). Payload internals are not validated here —
// depth matches validateEvent (signal keys only).
function validateWorkflowEvent(workflow) {
  if (!workflow.event) return;
  const event = workflow.event;
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    fail(
      workflow.type,
      `workflow event must be a plain object keyed by lifecycle signals (expected keys: ${LIFECYCLE_SIGNALS.join(', ')}).`
    );
  }
  for (const signal of Object.keys(event)) {
    if (!LIFECYCLE_SIGNALS.includes(signal)) {
      fail(
        workflow.type,
        `workflow event key "${signal}" is not a known lifecycle signal (expected one of: ${LIFECYCLE_SIGNALS.join(', ')}).`
      );
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

  if (
    typeof workflow.entity_ref_key !== 'string' ||
    workflow.entity_ref_key === ''
  ) {
    fail(
      workflow.type,
      'missing required "entity_ref_key" — the event-references key for the workflow\'s entity (e.g. "lead_ids"), written into event docs so events surface on the entity.'
    );
  }

  validateWorkflowEvent(workflow);

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
    if (!LEGAL_SEED_STATUSES.includes(entry.status)) {
      fail(
        workflow.type,
        `starting_actions entry for "${entry.type}" seeds status "${entry.status}" — only ${LEGAL_SEED_STATUSES.join(' | ')} are legal seeds (creation at workflow start is not an FSM transition). Re-author to a legal seed.`
      );
    }
  }
}

// Part 48 D6: Cross-workflow tracker edge validation. Runs after per-workflow
// validation so all workflow types are known. Checks:
//   1. Every child_workflow_type resolves to a declared workflow type.
//   2. No tracker cycle exists across the workflow set.
function validateTrackerEdges(workflows) {
  const declaredTypes = new Set(workflows.map((wf) => wf.type));
  const edges = collectTrackerEdges(workflows);

  // Resolution check: child must be a declared workflow type.
  for (const { parentType, childType } of edges) {
    if (!declaredTypes.has(childType)) {
      throw new Error(
        `makeWorkflowsConfig: workflow "${parentType}": tracker action declares child_workflow_type "${childType}" which is not a declared workflow type.`
      );
    }
  }

  // Acyclicity check: walk the edge graph and detect cycles using DFS.
  // Build adjacency list (parent → [children]).
  const children = new Map();
  for (const { parentType, childType } of edges) {
    if (!children.has(parentType)) children.set(parentType, []);
    children.get(parentType).push(childType);
  }

  // DFS with three-colour marking: white (unvisited), grey (in-stack), black (done).
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map();

  function dfs(node, stack) {
    colour.set(node, GREY);
    for (const child of children.get(node) ?? []) {
      if (colour.get(child) === GREY) {
        // Cycle detected — reconstruct the cycle path from the stack.
        const cycleStart = stack.indexOf(child);
        const cyclePath = [...stack.slice(cycleStart), child].join(' → ');
        throw new Error(
          `makeWorkflowsConfig: tracker cycle: ${cyclePath}`
        );
      }
      if ((colour.get(child) ?? WHITE) === WHITE) {
        dfs(child, [...stack, child]);
      }
    }
    colour.set(node, BLACK);
  }

  for (const type of declaredTypes) {
    if ((colour.get(type) ?? WHITE) === WHITE) {
      dfs(type, [type]);
    }
  }
}

function makeWorkflowsConfig(_, vars) {
  const { workflows } = vars;

  const result = workflows.map((workflow) => {
    validateWorkflow(workflow);

    const actions = (workflow.actions ?? []).map((action) => {
      const picked = pick(action, ACTION_FIELDS);

      // Default allow_not_required to false (opt-in; preserves Part 39 D3's
      // safety rationale). Validation already rejected non-boolean values above.
      picked.allow_not_required = action.allow_not_required === true;

      // Attach form_meta for form-kind actions. Ported from makeActionFormConfigs
      // so the per-action metadata rides the validated config directly (no
      // cross-workflow action.type collision).
      if (action.kind === 'form') {
        picked.form_meta = {
          form: describeForm(action.form),
          ...(action.form_review
            ? { form_review: describeForm(action.form_review) }
            : {}),
          ...(action.form_error
            ? { form_error: describeForm(action.form_error) }
            : {}),
        };
      }

      return picked;
    });

    return {
      ...pick(workflow, WORKFLOW_FIELDS),
      actions,
    };
  });

  // Cross-workflow checks: edge resolution + acyclicity (require full set).
  validateTrackerEdges(workflows);

  return result;
}

export default makeWorkflowsConfig;
