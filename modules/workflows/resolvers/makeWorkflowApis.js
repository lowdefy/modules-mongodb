const HOOK_INTERACTIONS = [
  'submit_edit',
  'not_required',
  'resolve_error',
  'approve',
  'request_changes',
];
const HOOK_PHASES = ['pre', 'post'];
const EVENT_OVERRIDE_FIELDS = ['type', 'display', 'references', 'metadata'];

function emitHookApi(action, interaction, phase, body) {
  return {
    id: `update-action-${action.type}-${interaction}-${phase}`,
    definition: {
      type: 'Api',
      auth: { roles: [...(action.access?.roles ?? [])] },
      routine: body.routine,
    },
  };
}

function emitHooks(action) {
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
      const api = emitHookApi(action, interaction, phase, body);
      slot[phase] = api.id;
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

function emitInteractions(action) {
  if (!action.interactions) return undefined;
  const map = {};
  for (const interaction of HOOK_INTERACTIONS) {
    const v = action.interactions[interaction];
    if (!v || !('status' in v)) continue;
    map[interaction] = { status: v.status };
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function emitActionEndpoint(workflow, action, hooksMap, eventMap, interactionsMap) {
  const isTask = action.kind === 'task';
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
    ...(isTask ? { current_status: { _payload: 'current_status' } } : {}),
    ...(hooksMap ? { hooks: hooksMap } : {}),
    ...(eventMap ? { event_overrides: eventMap } : {}),
    ...(interactionsMap ? { interactions: interactionsMap } : {}),
  };

  return {
    id: `update-action-${action.type}`,
    definition: {
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
    },
  };
}

function emitGroupOnCompleteApi(workflow, group) {
  if (!group.on_complete) return null;
  const groupActions = (workflow.actions ?? []).filter(
    (a) => a.action_group === group.id
  );
  const roles = [
    ...new Set(groupActions.flatMap((a) => a.access?.roles ?? [])),
  ];
  return {
    id: `workflow-${workflow.type}-group-${group.id}-on-complete`,
    definition: {
      type: 'Api',
      auth: { roles },
      routine: group.on_complete.routine,
    },
  };
}

function emitForWorkflow(workflow) {
  const apis = [];

  for (const action of workflow.actions ?? []) {
    if (action.kind === 'tracker') continue;
    const { apis: hookApis, map: hooksMap } = emitHooks(action);
    apis.push(...hookApis);
    const eventMap = emitEventOverrides(action);
    const interactionsMap = emitInteractions(action);
    apis.push(
      emitActionEndpoint(workflow, action, hooksMap, eventMap, interactionsMap)
    );
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
