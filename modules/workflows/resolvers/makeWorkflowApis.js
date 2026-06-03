const HOOK_INTERACTIONS = [
  'submit_edit',
  'not_required',
  'resolve_error',
  'approve',
  'request_changes',
];
const HOOK_PHASES = ['pre', 'post'];
const EVENT_OVERRIDE_FIELDS = ['type', 'display', 'references', 'metadata'];

// Hooks are engine-only by design: a built `Api` endpoint is HTTP-callable,
// and a direct HTTP call to the predictable hook id
// (`{workflow}-{action}-{interaction}-{pre|post}`) would bypass the engine
// and its load-phase access gate entirely. `InternalApi` blocks HTTP and
// client CallAPI actions while staying reachable via engine `callApi`.
function emitHookApi(workflow, action, interaction, phase, body) {
  return {
    id: `${workflow.type}-${action.type}-${interaction}-${phase}`,
    type: 'InternalApi',
    routine: body.routine,
  };
}

function emitHooks(workflow, action) {
  const apis = [];
  const map = {};
  if (!action.hooks) return { apis, map: undefined };
  for (const interaction of HOOK_INTERACTIONS) {
    const phases = action.hooks[interaction];
    if (!phases) continue;
    const slot = {};
    for (const phase of HOOK_PHASES) {
      const body = phases[phase];
      if (!body) continue;
      const api = emitHookApi(workflow, action, interaction, phase, body);
      // String-form _module.endpointId — own-entry scope. The build walker
      // resolves resolver output, so the engine receives the hook id as a
      // pre-scoped opaque string (`<workflowsEntryId>/<hookApiId>`) on
      // params.hooks and passes it to callApi verbatim.
      slot[phase] = { '_module.endpointId': api.id };
      apis.push(api);
    }
    if (Object.keys(slot).length > 0) map[interaction] = slot;
  }
  return { apis, map: Object.keys(map).length > 0 ? map : undefined };
}

function emitEventOverrides(action) {
  if (!action.event) return undefined;
  const map = {};
  for (const interaction of HOOK_INTERACTIONS) {
    const e = action.event[interaction];
    if (!e) continue;
    const slot = {};
    for (const field of EVENT_OVERRIDE_FIELDS) {
      if (field in e) slot[field] = e[field];
    }
    if (Object.keys(slot).length > 0) map[interaction] = slot;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function emitActionEndpoint(workflow, action, hooksMap, eventMap) {
  const isSimple = action.kind === 'simple';
  const properties = {
    action_id: { _payload: 'action_id' },
    action_type: action.type,
    workflow_type: workflow.type,
    interaction: { _payload: 'interaction' },
    current_key: { _payload: 'current_key' },
    form: { _payload: 'form' },
    form_review: { _payload: 'form_review' },
    fields: { _payload: 'fields' },
    comment: { _payload: 'comment' },
    ...(isSimple ? { current_status: { _payload: 'current_status' } } : {}),
    ...(hooksMap ? { hooks: hooksMap } : {}),
    ...(eventMap ? { event_overrides: eventMap } : {}),
  };

  return {
    id: `${workflow.type}-${action.type}-submit`,
    type: 'Api',
    routine: [
      {
        id: 'submit',
        type: 'SubmitWorkflowAction',
        connectionId: { '_module.connectionId': 'workflow-api' },
        properties,
      },
      {
        ':return': {
          action_ids: { _step: 'submit.action_ids' },
          completed_groups: { _step: 'submit.completed_groups' },
          event_id: { _step: 'submit.event_id' },
          tracker_fired: { _step: 'submit.tracker_fired' },
          pre_hook_response: { _step: 'submit.pre_hook_response' },
          post_hook_response: { _step: 'submit.post_hook_response' },
        },
      },
    ],
  };
}

// Engine-only for the same reason as hook Apis (see emitHookApi).
function emitGroupOnCompleteApi(workflow, group) {
  if (!group.on_complete) return null;
  return {
    id: `${workflow.type}-group-${group.id}-on-complete`,
    type: 'InternalApi',
    routine: group.on_complete.routine,
  };
}

function emitForWorkflow(workflow) {
  // `workflow` is reserved (Part 34 D10): a type named `workflow` would emit
  // derived ids (`workflow-{action}-…`) that collide with the module's fixed
  // `workflow-*` page space.
  if (workflow.type === 'workflow') {
    throw new Error(
      'makeWorkflowApis: "workflow" is a reserved workflow type name — its derived ids would collide with the module\'s fixed workflow-* page space (Part 34 D10). Rename the workflow type.'
    );
  }

  const apis = [];

  for (const action of workflow.actions ?? []) {
    if (action.kind === 'tracker') continue;
    const { apis: hookApis, map: hooksMap } = emitHooks(workflow, action);
    apis.push(...hookApis);
    const eventMap = emitEventOverrides(action);
    apis.push(emitActionEndpoint(workflow, action, hooksMap, eventMap));
  }

  for (const group of workflow.action_groups ?? []) {
    const api = emitGroupOnCompleteApi(workflow, group);
    if (api) apis.push(api);
  }

  return apis;
}

function makeWorkflowApis(_, vars) {
  const { workflows } = vars;
  const apis = [];
  for (const workflow of workflows) {
    apis.push(...emitForWorkflow(workflow));
  }
  return apis;
}

export default makeWorkflowApis;
