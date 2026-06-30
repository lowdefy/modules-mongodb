import makeWorkflowApis from "./makeWorkflowApis.js";

const qualifyAction = {
  type: "qualify",
  kind: "form",
  access: { "my-team-app": { view: true, edit: ["account-manager"] } },
  action_group: "phase-1",
  form: [{ id: "contact_name", type: "TextInput" }],
  status_map: {
    "action-required": {
      "my-team-app": { message: "Qualify the lead" },
    },
  },
  hooks: {
    submit: {
      pre: { routine: [{ id: "x", type: "MongoDBFindOne" }] },
    },
  },
  event: {
    submit: {
      type: "qualified",
      display: "Lead qualified",
      references: { lead_id: "$action.references.lead_id" },
      metadata: { source: "qualify" },
    },
  },
  interactions: {
    submit_edit: { status: "done" },
  },
};

const sendQuoteAction = {
  type: "send-quote",
  kind: "form",
  access: {
    "my-team-app": {
      view: true,
      edit: ["account-manager", "ops-lead"],
      review: ["account-manager", "ops-lead"],
    },
  },
  action_group: "phase-1",
  blocked_by: ["qualify"],
  form: [{ id: "quote_total", type: "NumberInput" }],
};

const scheduleFollowupAction = {
  type: "schedule-followup",
  kind: "check",
  access: { "my-team-app": { view: true, edit: ["ops-lead"] } },
  action_group: "phase-2",
};

const trackInstallationAction = {
  type: "track-installation",
  kind: "tracker",
  access: { "my-team-app": { view: ["ops-lead"] } },
  action_group: "phase-3",
  tracker: { child_workflow_type: "installation" },
  event: {
    internal_mirror_child_completed: {
      display: { "my-team-app": { title: "Installation complete" } },
    },
  },
};

const workedExample = {
  type: "onboarding",
  entity_collection: "leads-collection",
  display_order: 1,
  action_groups: [
    {
      id: "phase-1",
      title: "Discovery",
      on_complete: {
        routine: [{ id: "notify", type: "CallApi" }],
      },
    },
    { id: "phase-2", title: "Quote" },
    { id: "phase-3", title: "Installation" },
  ],
  starting_actions: [{ type: "qualify", status: "action-required" }],
  actions: [
    qualifyAction,
    sendQuoteAction,
    scheduleFollowupAction,
    trackInstallationAction,
  ],
};

// All-tracker parent of `onboarding` — its render slices ride descendant
// endpoints even though it emits no submit endpoint of its own.
const onboardingTrackerWorkflow = {
  type: "onboarding-tracker",
  entity_collection: "companies-collection",
  display_order: 0,
  starting_actions: [],
  actions: [
    {
      type: "install-tracker",
      kind: "tracker",
      access: { "my-team-app": { view: ["ops-lead"] } },
      tracker: { child_workflow_type: "onboarding" },
      event: {
        internal_mirror_child_completed: {
          display: {
            "my-team-app": { title: "{{ ticket }} closed by {{ agent }}" },
          },
        },
      },
    },
  ],
};

function findApi(apis, id) {
  return apis.find((a) => a.id === id);
}

function propsOf(api) {
  return api.routine[0].properties;
}

test("makeWorkflowApis: one {type}-submit endpoint per workflow — no per-action submit ids", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const ids = apis.map((a) => a.id);
  expect(ids).toContain("onboarding-submit");
  expect(ids.filter((id) => id === "onboarding-submit")).toHaveLength(1);
  // The old per-action ids are gone.
  expect(ids).not.toContain("onboarding-qualify-submit");
  expect(ids).not.toContain("onboarding-send-quote-submit");
  expect(ids).not.toContain("onboarding-schedule-followup-submit");
  expect(ids).not.toContain("onboarding-track-installation-submit");
});

test("makeWorkflowApis: payload contains the complete required field set", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const submit = findApi(apis, "onboarding-submit");
  const props = propsOf(submit);

  expect(props.action_id).toEqual({ _payload: "action_id" });
  expect(props.signal).toEqual({ _payload: "signal" });
  expect(props.current_key).toEqual({ _payload: "current_key" });
  expect(props.fields).toEqual({ _payload: "fields" });
  expect(props.form).toEqual({ _payload: "form" });
  expect(props.form_review).toEqual({ _payload: "form_review" });
  expect(props.comment).toEqual({ _payload: "comment" });
  expect(props.comment_visibility).toEqual({ _payload: "comment_visibility" });
  expect(props.metadata).toEqual({ _payload: "metadata" });
});

test("makeWorkflowApis: payload does not carry removed/superseded fields", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const props = propsOf(findApi(apis, "onboarding-submit"));
  expect(props).not.toHaveProperty("force");
  expect(props).not.toHaveProperty("interaction");
  expect(props).not.toHaveProperty("current_status");
  expect(props).not.toHaveProperty("action_type");
  expect(props).not.toHaveProperty("workflow_type");
  // Part 48: the flat event_overrides property is gone — its content rides
  // render_config.
  expect(props).not.toHaveProperty("event_overrides");
});

test("makeWorkflowApis: six-key :return is unchanged", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const submit = findApi(apis, "onboarding-submit");
  expect(submit.routine[1][":return"]).toEqual({
    action_ids: { _step: "submit.action_ids" },
    completed_groups: { _step: "submit.completed_groups" },
    event_id: { _step: "submit.event_id" },
    tracker_fired: { _step: "submit.tracker_fired" },
    pre_hook_response: { _step: "submit.pre_hook_response" },
    post_hook_response: { _step: "submit.post_hook_response" },
  });
});

test("makeWorkflowApis: hooks keyed by action type; actions without hooks omitted", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const submit = findApi(apis, "onboarding-submit");

  // Hook ids are wrapped in string-form _module.endpointId so the build
  // walker resolves them to pre-scoped opaque strings (own-entry scope).
  // Per-workflow endpoint: the map is keyed by action type, then signal.
  expect(propsOf(submit).hooks).toEqual({
    qualify: {
      submit: {
        pre: { "_module.endpointId": "onboarding-qualify-submit-pre" },
      },
    },
  });
  // send-quote / schedule-followup declare no hooks — no action key.
  expect(propsOf(submit).hooks).not.toHaveProperty("send-quote");
  expect(propsOf(submit).hooks).not.toHaveProperty("schedule-followup");
});

test("makeWorkflowApis: hooks property absent when no action declares hooks", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    display_order: 1,
    starting_actions: [{ type: "kickoff", status: "action-required" }],
    actions: [{ type: "kickoff", kind: "check" }],
  };
  const apis = makeWorkflowApis(null, { workflows: [workflow] });
  expect(propsOf(findApi(apis, "onboarding-submit"))).not.toHaveProperty(
    "hooks",
  );
});

// ── Part 28: custom is submittable like check ────────────────────────────────

const customReviewWorkflow = {
  type: "account-review",
  entity_collection: "leads-collection",
  display_order: 1,
  starting_actions: [{ type: "review-document", status: "action-required" }],
  actions: [
    {
      type: "review-document",
      kind: "custom",
      access: { "my-team-app": { view: true, edit: ["account-manager"] } },
      status_map: {
        "action-required": {
          "my-team-app": {
            message: "Review the document.",
            link: { pageId: "contract-review", urlQuery: { action_id: true } },
          },
        },
      },
    },
  ],
};

test("makeWorkflowApis: a custom-only workflow is submittable (emits {type}-submit + {type}-update-fields)", () => {
  const apis = makeWorkflowApis(null, { workflows: [customReviewWorkflow] });
  const ids = apis.map((a) => a.id);
  expect(ids).toContain("account-review-submit");
  expect(ids).toContain("account-review-update-fields");
});

test("makeWorkflowApis: a custom action's status_map (incl. link cells) rides render_config", () => {
  const apis = makeWorkflowApis(null, { workflows: [customReviewWorkflow] });
  const props = propsOf(findApi(apis, "account-review-submit"));
  expect(
    props.render_config["account-review"]["review-document"].status_map,
  ).toEqual({
    "action-required": {
      "my-team-app": {
        message: "Review the document.",
        link: { pageId: "contract-review", urlQuery: { action_id: true } },
      },
    },
  });
});

test("makeWorkflowApis: hook InternalApi ids stay {workflow}-{action}-{signal}-{phase}", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  // Signal-keyed: `…-submit-pre` not `…-submit_edit-pre`
  const hook = findApi(apis, "onboarding-qualify-submit-pre");
  expect(hook).toBeDefined();
  // Engine-only: blocked over HTTP and from client CallAPI, reachable via callApi.
  expect(hook.type).toBe("InternalApi");
  expect(hook.routine).toEqual([{ id: "x", type: "MongoDBFindOne" }]);
  // Legacy-keyed id is not emitted.
  expect(findApi(apis, "onboarding-qualify-submit_edit-pre")).toBeUndefined();
});

test("makeWorkflowApis: legacy-keyed hooks.submit_edit block is not emitted (signal-keyed emitter)", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: {
          submit_edit: {
            pre: { routine: [{ id: "x", type: "MongoDBFindOne" }] },
          },
        },
      },
    ],
  };
  const apis = makeWorkflowApis(null, { workflows: [workflow] });
  // The emitter only loops over HOOK_SIGNALS; submit_edit is not in the list,
  // so no hook Api is emitted and the hooks map on the submit endpoint is absent.
  expect(findApi(apis, "onboarding-qualify-submit_edit-pre")).toBeUndefined();
  const submit = findApi(apis, "onboarding-submit");
  expect(propsOf(submit)).not.toHaveProperty("hooks");
});

test("makeWorkflowApis: group on_complete Api emission", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const onComplete = findApi(apis, "onboarding-group-phase-1-on-complete");
  expect(onComplete).toBeDefined();
  // Engine-only, same rationale as hook Apis.
  expect(onComplete.type).toBe("InternalApi");
  expect(onComplete.routine).toEqual([{ id: "notify", type: "CallApi" }]);
});

test("makeWorkflowApis: submit Api stays client-invokable type Api", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  expect(findApi(apis, "onboarding-submit").type).toBe("Api");
});

test("makeWorkflowApis: entity.data emits a {type}-entity-data InternalApi (Part 26)", () => {
  const routine = [
    {
      id: "load",
      type: "MongoDBAggregation",
      connectionId: "leads-collection",
    },
    { ":return": { name: { _step: "load.0.name" } } },
  ];
  const workflow = { ...workedExample, entity: { data: { routine } } };
  const apis = makeWorkflowApis(null, { workflows: [workflow] });
  const entityData = findApi(apis, "onboarding-entity-data");
  expect(entityData).toBeDefined();
  // Engine-only, same rationale as hook / on_complete Apis.
  expect(entityData.type).toBe("InternalApi");
  expect(entityData.routine).toEqual(routine);
});

test("makeWorkflowApis: no entity.data → no entity-data endpoint", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  expect(findApi(apis, "onboarding-entity-data")).toBeUndefined();
});

test("makeWorkflowApis: render_config carries own slices — raw status_map + signal-keyed event_overrides", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const props = propsOf(findApi(apis, "onboarding-submit"));

  expect(props.render_config.onboarding.qualify).toEqual({
    status_map: {
      "action-required": {
        "my-team-app": { message: "Qualify the lead" },
      },
    },
    event_overrides: {
      submit: {
        type: "qualified",
        display: "Lead qualified",
        references: { lead_id: "$action.references.lead_id" },
        metadata: { source: "qualify" },
      },
    },
  });
});

test("makeWorkflowApis: render_config omits empty slices", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const props = propsOf(findApi(apis, "onboarding-submit"));
  // send-quote / schedule-followup declare neither status_map nor event — no key.
  expect(props.render_config.onboarding).not.toHaveProperty("send-quote");
  expect(props.render_config.onboarding).not.toHaveProperty(
    "schedule-followup",
  );
});

test("makeWorkflowApis: render_config property absent when no workflow contributes a slice", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    display_order: 1,
    starting_actions: [{ type: "kickoff", status: "action-required" }],
    actions: [{ type: "kickoff", kind: "check" }],
  };
  const apis = makeWorkflowApis(null, { workflows: [workflow] });
  expect(propsOf(findApi(apis, "onboarding-submit"))).not.toHaveProperty(
    "render_config",
  );
});

test("makeWorkflowApis: tracker actions contribute mirror-signal event_overrides to render_config", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const props = propsOf(findApi(apis, "onboarding-submit"));
  // track-installation is skipped for submit/hooks but its render slice rides.
  expect(props.render_config.onboarding["track-installation"]).toEqual({
    event_overrides: {
      internal_mirror_child_completed: {
        display: { "my-team-app": { title: "Installation complete" } },
      },
    },
  });
});

test("makeWorkflowApis: render_config bundles ancestor slices traced via child_workflow_type", () => {
  const apis = makeWorkflowApis(null, {
    workflows: [workedExample, onboardingTrackerWorkflow],
  });
  const props = propsOf(findApi(apis, "onboarding-submit"));

  expect(Object.keys(props.render_config).sort()).toEqual([
    "onboarding",
    "onboarding-tracker",
  ]);
  expect(props.render_config["onboarding-tracker"]["install-tracker"]).toEqual({
    event_overrides: {
      internal_mirror_child_completed: {
        display: {
          "my-team-app": { title: "{{ ticket }} closed by {{ agent }}" },
        },
      },
    },
  });
  // The all-tracker ancestor itself emits no submit endpoint.
  expect(findApi(apis, "onboarding-tracker-submit")).toBeUndefined();
});

test("makeWorkflowApis: ancestor walk is transitive across deeper tracker chains", () => {
  const grandparent = {
    type: "program",
    entity_collection: "programs-collection",
    display_order: 0,
    starting_actions: [],
    actions: [
      {
        type: "track-rollout",
        kind: "tracker",
        tracker: { child_workflow_type: "rollout" },
        event: {
          internal_mirror_child_active: {
            display: { "my-team-app": { title: "Rollout started" } },
          },
        },
      },
    ],
  };
  const parent = {
    type: "rollout",
    entity_collection: "rollouts-collection",
    display_order: 1,
    starting_actions: [],
    actions: [
      {
        type: "track-site",
        kind: "tracker",
        tracker: { child_workflow_type: "site-setup" },
        status_map: { active: { "my-team-app": { message: "Tracking" } } },
      },
    ],
  };
  const child = {
    type: "site-setup",
    entity_collection: "sites-collection",
    display_order: 2,
    starting_actions: [{ type: "survey", status: "action-required" }],
    actions: [
      {
        type: "survey",
        kind: "check",
        status_map: { done: { "my-team-app": { message: "Surveyed" } } },
      },
    ],
  };
  const apis = makeWorkflowApis(null, {
    workflows: [grandparent, parent, child],
  });
  const props = propsOf(findApi(apis, "site-setup-submit"));
  expect(Object.keys(props.render_config).sort()).toEqual([
    "program",
    "rollout",
    "site-setup",
  ]);
  expect(props.render_config.rollout["track-site"].status_map).toEqual({
    active: { "my-team-app": { message: "Tracking" } },
  });
  expect(
    props.render_config.program["track-rollout"].event_overrides,
  ).toHaveProperty("internal_mirror_child_active");
});

test("makeWorkflowApis: stale interactions: YAML field is not baked into the endpoint payload", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const submit = findApi(apis, "onboarding-submit");
  // qualifyAction fixture declares `interactions: { submit_edit: { status: "done" } }`
  // — the resolver silently drops it (Part 32 collapse).
  expect(propsOf(submit)).not.toHaveProperty("interactions");
});

test("makeWorkflowApis: emitted ids are entry-scoped {workflow_type}-… with no workflow- prefix", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  for (const api of apis) {
    expect(api.id.startsWith("workflow-")).toBe(false);
    expect(api.id.startsWith("update-action-")).toBe(false);
    expect(api.id.startsWith("onboarding-")).toBe(true);
  }
});

test("makeWorkflowApis: a workflow type named `workflow` is rejected (reserved — Part 34 D10)", () => {
  const reserved = {
    type: "workflow",
    entity_collection: "leads-collection",
    display_order: 1,
    starting_actions: [{ type: "do-it", status: "action-required" }],
    actions: [{ type: "do-it", kind: "check" }],
  };
  expect(() => makeWorkflowApis(null, { workflows: [reserved] })).toThrow(
    /reserved workflow type name/,
  );
});

test("makeWorkflowApis: tracker-only workflow emits start/cancel/close but no submit (task 8 invariant)", () => {
  const workflow = {
    type: "installation",
    entity_collection: "installations-collection",
    display_order: 2,
    starting_actions: [],
    actions: [
      {
        type: "track-installation",
        kind: "tracker",
        access: { "my-team-app": { view: ["ops-lead"] } },
        tracker: { child_workflow_type: "site-setup" },
      },
    ],
  };
  const apis = makeWorkflowApis(null, { workflows: [workflow] });
  expect(apis.map((a) => a.id).sort()).toEqual([
    "installation-cancel",
    "installation-close",
    "installation-start",
  ]);
  expect(findApi(apis, "installation-submit")).toBeUndefined();
});

test("makeWorkflowApis: each workflow emits exactly one {type}-start/cancel/close, type Api", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const ids = apis.map((a) => a.id);
  for (const verb of ["start", "cancel", "close"]) {
    expect(ids.filter((id) => id === `onboarding-${verb}`)).toHaveLength(1);
    // HTTP-callable like the generic endpoints they replace — not InternalApi.
    expect(findApi(apis, `onboarding-${verb}`).type).toBe("Api");
  }
});

test("makeWorkflowApis: {type}-start — StartWorkflow step, static workflow_type, passthroughs, :return", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const start = findApi(apis, "onboarding-start");
  const step = start.routine[0];

  expect(step.id).toBe("start");
  expect(step.type).toBe("StartWorkflow");
  expect(step.connectionId).toEqual({ "_module.connectionId": "workflow-api" });

  // workflow_type is a static literal — the endpoint is type-scoped, callers
  // no longer pass it in the payload.
  expect(step.properties.workflow_type).toBe("onboarding");
  // Narrow pick: only entity.id is mapped from the payload; the connection id
  // is sourced from config inside StartWorkflow (Part 59).
  expect(step.properties.entity).toEqual({ id: { _payload: "entity.id" } });
  expect(step.properties.parent_action_id).toEqual({
    _payload: "parent_action_id",
  });
  expect(step.properties.actions).toEqual({ _payload: "actions" });
  expect(step.properties.references).toEqual({ _payload: "references" });
  expect(step.properties.metadata).toEqual({ _payload: "metadata" });

  expect(start.routine[1][":return"]).toEqual({
    workflow_id: { _step: "start.workflow_id" },
    action_ids: { _step: "start.action_ids" },
    event_id: { _step: "start.event_id" },
  });
});

test("makeWorkflowApis: {type}-cancel/{type}-close — step types, passthroughs, :return", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  for (const [verb, stepType] of [
    ["cancel", "CancelWorkflow"],
    ["close", "CloseWorkflow"],
  ]) {
    const api = findApi(apis, `onboarding-${verb}`);
    const step = api.routine[0];
    expect(step.id).toBe(verb);
    expect(step.type).toBe(stepType);
    expect(step.connectionId).toEqual({
      "_module.connectionId": "workflow-api",
    });
    expect(step.properties.workflow_id).toEqual({ _payload: "workflow_id" });
    expect(step.properties.reason).toEqual({ _payload: "reason" });
    expect(step.properties.references).toEqual({ _payload: "references" });
    expect(api.routine[1][":return"]).toEqual({
      action_ids: { _step: `${verb}.action_ids` },
      event_id: { _step: `${verb}.event_id` },
      tracker_fired: { _step: `${verb}.tracker_fired` },
    });
  }
});

test("makeWorkflowApis: lifecycle endpoints carry the same render_config bundle as submit", () => {
  const apis = makeWorkflowApis(null, {
    workflows: [workedExample, onboardingTrackerWorkflow],
  });
  const submitConfig = propsOf(
    findApi(apis, "onboarding-submit"),
  ).render_config;
  expect(submitConfig).toBeDefined();
  for (const verb of ["start", "cancel", "close"]) {
    expect(propsOf(findApi(apis, `onboarding-${verb}`)).render_config).toEqual(
      submitConfig,
    );
  }
});

test("makeWorkflowApis: lifecycle_event_override — started on start, closed on close, none on cancel", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    display_order: 1,
    starting_actions: [{ type: "kickoff", status: "action-required" }],
    actions: [{ type: "kickoff", kind: "check" }],
    event: {
      started: { display: { "my-team-app": { title: "Onboarding started" } } },
      closed: { display: { "my-team-app": { title: "Onboarding closed" } } },
    },
  };
  const apis = makeWorkflowApis(null, { workflows: [workflow] });
  expect(
    propsOf(findApi(apis, "onboarding-start")).lifecycle_event_override,
  ).toEqual({
    display: { "my-team-app": { title: "Onboarding started" } },
  });
  expect(
    propsOf(findApi(apis, "onboarding-close")).lifecycle_event_override,
  ).toEqual({
    display: { "my-team-app": { title: "Onboarding closed" } },
  });
  // No event.cancelled entry — the property is omitted, not emitted empty.
  expect(propsOf(findApi(apis, "onboarding-cancel"))).not.toHaveProperty(
    "lifecycle_event_override",
  );
});

test("makeWorkflowApis: lifecycle_event_override absent when the workflow declares no event map", () => {
  // workedExample has no workflow-level event.
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  for (const verb of ["start", "cancel", "close"]) {
    expect(propsOf(findApi(apis, `onboarding-${verb}`))).not.toHaveProperty(
      "lifecycle_event_override",
    );
  }
});

test("makeWorkflowApis: no hooks property on start/cancel/close", () => {
  // workedExample's qualify action declares hooks — they ride submit only.
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  expect(propsOf(findApi(apis, "onboarding-submit")).hooks).toBeDefined();
  for (const verb of ["start", "cancel", "close"]) {
    expect(propsOf(findApi(apis, `onboarding-${verb}`))).not.toHaveProperty(
      "hooks",
    );
  }
});

// ── Part 24: {type}-update-fields endpoint ───────────────────────────────────

test("makeWorkflowApis: a workflow with a form action emits exactly one {type}-update-fields", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const ids = apis.map((a) => a.id);
  expect(ids).toContain("onboarding-update-fields");
  expect(ids.filter((id) => id === "onboarding-update-fields")).toHaveLength(1);
});

test("makeWorkflowApis: update-fields endpoint shape — Api, exact properties, two-key :return", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const ep = findApi(apis, "onboarding-update-fields");
  expect(ep.type).toBe("Api");
  expect(propsOf(ep)).toEqual({
    action_id: { _payload: "action_id" },
    workflow_type: "onboarding",
    fields: { _payload: "fields" },
  });
  expect(ep.routine[0].type).toBe("UpdateActionFields");
  expect(ep.routine[1][":return"]).toEqual({
    action_id: { _step: "update_fields.action_id" },
    event_id: { _step: "update_fields.event_id" },
  });
  // Signal-less / workflow-scoped: no signal/form/interaction/action_type keys.
  const props = propsOf(ep);
  expect(props).not.toHaveProperty("signal");
  expect(props).not.toHaveProperty("form");
  expect(props).not.toHaveProperty("interaction");
  expect(props).not.toHaveProperty("action_type");
  // Part 61: the field-update operation carries no comment.
  expect(props).not.toHaveProperty("comment");
  expect(props).not.toHaveProperty("comment_visibility");
});

test("makeWorkflowApis: a workflow with only check actions still emits update-fields", () => {
  const checkOnly = {
    type: "check-flow",
    entity_collection: "leads-collection",
    starting_actions: [],
    actions: [
      {
        type: "audit",
        kind: "check",
        access: { "my-team-app": { view: true, edit: true } },
      },
    ],
  };
  const apis = makeWorkflowApis(null, { workflows: [checkOnly] });
  expect(apis.map((a) => a.id)).toContain("check-flow-update-fields");
});

test("makeWorkflowApis: a tracker-only workflow emits no update-fields endpoint", () => {
  const apis = makeWorkflowApis(null, {
    workflows: [onboardingTrackerWorkflow, workedExample],
  });
  const ids = apis.map((a) => a.id);
  expect(ids).not.toContain("onboarding-tracker-update-fields");
  // The form/check workflow still emits one.
  expect(ids).toContain("onboarding-update-fields");
});

test("makeWorkflowApis: two workflows emit two distinct update-fields ids", () => {
  const wfB = {
    type: "renewal",
    entity_collection: "leads-collection",
    starting_actions: [],
    actions: [
      {
        type: "review",
        kind: "form",
        form: [{ id: "x", type: "TextInput" }],
        access: { "my-team-app": { view: true, edit: true } },
      },
    ],
  };
  const apis = makeWorkflowApis(null, { workflows: [workedExample, wfB] });
  const ids = apis
    .map((a) => a.id)
    .filter((id) => id.endsWith("-update-fields"));
  expect(ids).toEqual(
    expect.arrayContaining([
      "onboarding-update-fields",
      "renewal-update-fields",
    ]),
  );
});
