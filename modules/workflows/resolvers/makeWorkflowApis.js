import { HOOK_SIGNALS, HOOK_PHASES, MIRROR_SIGNALS } from "./hookSignals.js";
import { collectTrackerEdges } from "./trackerEdges.js";

const EVENT_OVERRIDE_FIELDS = ["type", "display", "references", "metadata"];

// Signals whose `event:` overrides ride render_config: submit-time hook
// signals plus tracker mirror signals (Part 48 task 7 made the latter
// authorable on kind: tracker actions).
const EVENT_OVERRIDE_SIGNALS = [...HOOK_SIGNALS, ...MIRROR_SIGNALS];

// Hooks are engine-only by design: a built `Api` endpoint is HTTP-callable,
// and a direct HTTP call to the predictable hook id
// (`{workflow}-{action}-{signal}-{pre|post}`) would bypass the engine
// and its load-phase access gate entirely. `InternalApi` blocks HTTP and
// client CallAPI actions while staying reachable via engine `callApi`.
function emitHookApi(workflow, action, signal, phase, body) {
  return {
    id: `${workflow.type}-${action.type}-${signal}-${phase}`,
    type: "InternalApi",
    routine: body.routine,
  };
}

function emitHooks(workflow, action) {
  const apis = [];
  const map = {};
  if (!action.hooks) return { apis, map: undefined };
  for (const signal of HOOK_SIGNALS) {
    const phases = action.hooks[signal];
    if (!phases) continue;
    const slot = {};
    for (const phase of HOOK_PHASES) {
      const body = phases[phase];
      if (!body) continue;
      const api = emitHookApi(workflow, action, signal, phase, body);
      // String-form _module.endpointId — own-entry scope. The build walker
      // resolves resolver output, so the engine receives the hook id as a
      // pre-scoped opaque string (`<workflowsEntryId>/<hookApiId>`) on
      // params.hooks and passes it to callApi verbatim.
      slot[phase] = { "_module.endpointId": api.id };
      apis.push(api);
    }
    if (Object.keys(slot).length > 0) map[signal] = slot;
  }
  return { apis, map: Object.keys(map).length > 0 ? map : undefined };
}

function emitEventOverrides(action) {
  if (!action.event) return undefined;
  const map = {};
  for (const signal of EVENT_OVERRIDE_SIGNALS) {
    const e = action.event[signal];
    if (!e) continue;
    const slot = {};
    for (const field of EVENT_OVERRIDE_FIELDS) {
      if (field in e) slot[field] = e[field];
    }
    if (Object.keys(slot).length > 0) map[signal] = slot;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

// One render slice per action: raw status_map (already validated by
// makeWorkflowsConfig) + event_overrides. Empty slices are omitted.
function emitWorkflowRenderSlices(workflow) {
  const slices = {};
  for (const action of workflow.actions ?? []) {
    const slice = {};
    if (action.status_map && Object.keys(action.status_map).length > 0) {
      slice.status_map = action.status_map;
    }
    const eventMap = emitEventOverrides(action);
    if (eventMap) slice.event_overrides = eventMap;
    if (Object.keys(slice).length > 0) slices[action.type] = slice;
  }
  return Object.keys(slices).length > 0 ? slices : undefined;
}

// Ancestors of `type`: the transitive closure of tracker child→parent edges
// walked upward. The submit's write operations cascade to ancestors and render
// status_map/mirror events along the way (Part 48 D6), so every ancestor's
// render slices must ride the endpoint. No cycle guard — makeWorkflowsConfig
// hard-errors on cycles at build time (and the visited set terminates anyway).
function collectAncestorTypes(type, edges) {
  const ancestors = new Set();
  let frontier = [type];
  while (frontier.length > 0) {
    const next = [];
    for (const { parentType, childType } of edges) {
      if (frontier.includes(childType) && !ancestors.has(parentType)) {
        ancestors.add(parentType);
        next.push(parentType);
      }
    }
    frontier = next;
  }
  return [...ancestors];
}

// render_config bundle: workflow_type → action_type → { status_map?,
// event_overrides? } for the workflow's own actions plus every ancestor's.
// Static build output — values are raw display config, no _module.* refs.
// Duplication of a shared ancestor's config across descendant endpoints is
// accepted: build artifacts are cheap, per-request evaluation is what hurts.
function emitRenderConfig(workflow, workflowsByType, edges) {
  const config = {};
  for (const type of [
    workflow.type,
    ...collectAncestorTypes(workflow.type, edges),
  ]) {
    const target = workflowsByType.get(type);
    if (!target) continue;
    const slices = emitWorkflowRenderSlices(target);
    if (slices) config[type] = slices;
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

function emitSubmitEndpoint(workflow, hooksByAction, renderConfig) {
  const properties = {
    action_id: { _payload: "action_id" },
    signal: { _payload: "signal" },
    current_key: { _payload: "current_key" },
    fields: { _payload: "fields" },
    form: { _payload: "form" },
    form_review: { _payload: "form_review" },
    comment: { _payload: "comment" },
    comment_visibility: { _payload: "comment_visibility" },
    metadata: { _payload: "metadata" },
    // hooks is a sibling of render_config, not nested under it: hook values
    // are build-resolved endpoint refs consumed off params, not Nunjucks
    // display config. Keyed by action type (Part 48 D7) — handleSubmit
    // re-slices to the signal-keyed shape the hook phases consume.
    ...(hooksByAction ? { hooks: hooksByAction } : {}),
    ...(renderConfig ? { render_config: renderConfig } : {}),
  };

  return {
    id: `${workflow.type}-submit`,
    type: "Api",
    routine: [
      {
        id: "submit",
        type: "SubmitWorkflowAction",
        connectionId: { "_module.connectionId": "workflow-api" },
        properties,
      },
      {
        ":return": {
          action_ids: { _step: "submit.action_ids" },
          completed_groups: { _step: "submit.completed_groups" },
          event_id: { _step: "submit.event_id" },
          tracker_fired: { _step: "submit.tracker_fired" },
          pre_hook_response: { _step: "submit.pre_hook_response" },
          post_hook_response: { _step: "submit.post_hook_response" },
        },
      },
    ],
  };
}

// Part 24: one {type}-update-fields endpoint per workflow that declares any
// surface-bearing (form/check) action, dispatched by action_id — exactly
// mirroring the per-workflow submit endpoint. The UpdateActionFields handler
// loads the action by id and reads type/kind off the doc, so no per-action-type
// granularity is needed. type: Api (client-callable) — the handler's load-phase
// edit-verb gate is the access authority, same posture as submit. The endpoint
// is signal-less and carries no form/interaction/action_type keys.
function emitFieldsEndpoint(workflow) {
  return {
    id: `${workflow.type}-update-fields`,
    type: "Api",
    routine: [
      {
        id: "update_fields",
        type: "UpdateActionFields",
        connectionId: { "_module.connectionId": "workflow-api" },
        properties: {
          action_id: { _payload: "action_id" },
          // Build-time literal — the only per-workflow constant the endpoint
          // needs (the component builds the id from it at runtime).
          workflow_type: workflow.type,
          fields: { _payload: "fields" },
          comment: { _payload: "comment" },
          comment_visibility: { _payload: "comment_visibility" },
        },
      },
      {
        ":return": {
          action_id: { _step: "update_fields.action_id" },
          event_id: { _step: "update_fields.event_id" },
        },
      },
    ],
  };
}

// Part 48 D5: per-workflow lifecycle endpoints replace the generic
// start-workflow/cancel-workflow/close-workflow Apis — a generic endpoint
// can't carry a bounded render_config because it doesn't know its workflow
// type until runtime. Callers construct the endpoint id from the type
// ({type}-start etc.) — D5's accepted ergonomic regression.
//
// lifecycle_event_override is a sibling of render_config, not nested under
// it (same reasoning as hooks on the submit endpoint): it's consumed off
// params by the handler, not Nunjucks display config keyed by workflow/
// action type. It carries the workflow-level event[<signal>] slice for the
// one lifecycle signal this endpoint fires — own workflow only, since
// lifecycle events fire exactly once at the originating handler and never
// cascade. Omitted when the workflow declares no `event` or no entry for
// the signal. No hooks — start/cancel/close have no user-action hooks.
function emitStartEndpoint(workflow, renderConfig) {
  return {
    id: `${workflow.type}-start`,
    type: "Api",
    routine: [
      {
        id: "start",
        type: "StartWorkflow",
        connectionId: { "_module.connectionId": "workflow-api" },
        properties: {
          // Static literal — the endpoint is type-scoped, so callers no
          // longer pass workflow_type in the payload.
          workflow_type: workflow.type,
          // Narrow pick: only entity.id is mapped from the payload — the
          // connection id is a config constant, sourced inside StartWorkflow
          // from workflowConfig.entity.connection_id (Part 59). The mapping
          // itself is the filter, so a caller can't smuggle in a conflicting
          // connection_id.
          entity: { id: { _payload: "entity.id" } },
          parent_action_id: { _payload: "parent_action_id" },
          // actions: override seeds actions directly at a declared status.
          // Grammar: { type, key?, status } where status is one of
          // action-required | blocked (enforced at runtime); key for keyed
          // action types. Per-entry fields/references are not part of the
          // contract — payload-level metadata merges onto every seeded
          // draft, and payload-level references lands on the workflow doc.
          // Signals are the submit-time grammar only and do not apply at
          // workflow start.
          actions: { _payload: "actions" },
          references: { _payload: "references" },
          metadata: { _payload: "metadata" },
          ...(renderConfig ? { render_config: renderConfig } : {}),
          ...(workflow.event?.started
            ? { lifecycle_event_override: workflow.event.started }
            : {}),
        },
      },
      {
        ":return": {
          workflow_id: { _step: "start.workflow_id" },
          action_ids: { _step: "start.action_ids" },
          event_id: { _step: "start.event_id" },
        },
      },
    ],
  };
}

// Cancel and close share a shape; only the step type and lifecycle signal
// differ. See emitStartEndpoint for the D5 rationale and the
// lifecycle_event_override contract.
function emitTerminalEndpoint(
  workflow,
  renderConfig,
  { verb, stepType, signal },
) {
  return {
    id: `${workflow.type}-${verb}`,
    type: "Api",
    routine: [
      {
        id: verb,
        type: stepType,
        connectionId: { "_module.connectionId": "workflow-api" },
        properties: {
          workflow_id: { _payload: "workflow_id" },
          reason: { _payload: "reason" },
          references: { _payload: "references" },
          ...(renderConfig ? { render_config: renderConfig } : {}),
          ...(workflow.event?.[signal]
            ? { lifecycle_event_override: workflow.event[signal] }
            : {}),
        },
      },
      {
        ":return": {
          action_ids: { _step: `${verb}.action_ids` },
          event_id: { _step: `${verb}.event_id` },
          tracker_fired: { _step: `${verb}.tracker_fired` },
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
    type: "InternalApi",
    routine: group.on_complete.routine,
  };
}

// Part 26: one {type}-entity-data InternalApi per workflow that declares an
// inline entity.data routine — same body as emitGroupOnCompleteApi. The read
// handlers reach it via the engine's callApi to fetch host-shaped entity data.
// Engine-only for the same reason as hook Apis (see emitHookApi); the id
// {type}-entity-data is collision-free against the hook (4-segment), group
// ({type}-group-{id}-on-complete), and lifecycle/submit id spaces.
function emitEntityDataApi(workflow) {
  if (!workflow.entity?.data) return null;
  return {
    id: `${workflow.type}-entity-data`,
    type: "InternalApi",
    routine: workflow.entity.data.routine,
  };
}

function emitForWorkflow(workflow, { workflowsByType, edges }) {
  // `workflow` is reserved (Part 34 D10): a type named `workflow` would emit
  // derived ids (`workflow-{action}-…`, and since Part 48 also
  // `workflow-start/cancel/close`) that collide with the module's fixed
  // `workflow-*` page/endpoint space.
  if (workflow.type === "workflow") {
    throw new Error(
      'makeWorkflowApis: "workflow" is a reserved workflow type name — its derived ids would collide with the module\'s fixed workflow-* page space (Part 34 D10). Rename the workflow type.',
    );
  }

  const apis = [];
  const renderConfig = emitRenderConfig(workflow, workflowsByType, edges);

  // One submit endpoint per workflow (Part 48); hook InternalApis stay
  // per-action with unchanged ids. Trackers are skipped — an all-tracker
  // workflow emits no submit endpoint.
  const hooksByAction = {};
  let hasSubmittableAction = false;
  for (const action of workflow.actions ?? []) {
    if (action.kind === "tracker") continue;
    hasSubmittableAction = true;
    const { apis: hookApis, map: hooksMap } = emitHooks(workflow, action);
    apis.push(...hookApis);
    if (hooksMap) hooksByAction[action.type] = hooksMap;
  }

  if (hasSubmittableAction) {
    apis.push(
      emitSubmitEndpoint(
        workflow,
        Object.keys(hooksByAction).length > 0 ? hooksByAction : undefined,
        renderConfig,
      ),
    );
    // Part 24: one update-fields endpoint per surface-bearing workflow (the
    // same form/check gate as the submit endpoint). Check actions get the
    // independent Update path in addition to writing fields on submit.
    apis.push(emitFieldsEndpoint(workflow));
  }

  // Lifecycle endpoints for every workflow — including all-tracker ones,
  // which can still be started/cancelled/closed even though they emit no
  // submit endpoint.
  apis.push(
    emitStartEndpoint(workflow, renderConfig),
    emitTerminalEndpoint(workflow, renderConfig, {
      verb: "cancel",
      stepType: "CancelWorkflow",
      signal: "cancelled",
    }),
    emitTerminalEndpoint(workflow, renderConfig, {
      verb: "close",
      stepType: "CloseWorkflow",
      signal: "closed",
    }),
  );

  for (const group of workflow.action_groups ?? []) {
    const api = emitGroupOnCompleteApi(workflow, group);
    if (api) apis.push(api);
  }

  const entityDataApi = emitEntityDataApi(workflow);
  if (entityDataApi) apis.push(entityDataApi);

  return apis;
}

function makeWorkflowApis(_, vars) {
  const { workflows } = vars;
  const edges = collectTrackerEdges(workflows);
  const workflowsByType = new Map(workflows.map((w) => [w.type, w]));
  const apis = [];
  for (const workflow of workflows) {
    apis.push(...emitForWorkflow(workflow, { workflowsByType, edges }));
  }
  return apis;
}

export default makeWorkflowApis;
