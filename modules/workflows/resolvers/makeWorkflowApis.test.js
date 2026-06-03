import makeWorkflowApis from "./makeWorkflowApis.js";

const qualifyAction = {
  type: "qualify",
  kind: "form",
  access: { "my-team-app": { view: true, edit: ["account-manager"] } },
  action_group: "phase-1",
  form: [{ id: "contact_name", type: "TextInput" }],
  hooks: {
    submit_edit: {
      pre: { routine: [{ id: "x", type: "MongoDBFindOne" }] },
    },
  },
  event: {
    submit_edit: {
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
  kind: "simple",
  access: { "my-team-app": { view: true, edit: ["ops-lead"] } },
  action_group: "phase-2",
};

const trackInstallationAction = {
  type: "track-installation",
  kind: "tracker",
  access: { "my-team-app": { view: ["ops-lead"] } },
  action_group: "phase-3",
  tracker: { workflow_type: "installation" },
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

function findApi(apis, id) {
  return apis.find((a) => a.id === id);
}

function propsOf(api) {
  return api.routine[0].properties;
}

test("makeWorkflowApis: worked example emits the expected {type}-{action}-submit set, no tracker", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const ids = apis.map((a) => a.id).sort();
  expect(ids).toContain("onboarding-qualify-submit");
  expect(ids).toContain("onboarding-send-quote-submit");
  expect(ids).toContain("onboarding-schedule-followup-submit");
  expect(ids).not.toContain("onboarding-track-installation-submit");
});

test("makeWorkflowApis: simple endpoint includes current_status; form endpoints do not", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const simpleApi = findApi(apis, "onboarding-schedule-followup-submit");
  const form = findApi(apis, "onboarding-qualify-submit");
  const sendQuote = findApi(apis, "onboarding-send-quote-submit");

  expect(propsOf(simpleApi).current_status).toEqual({ _payload: "current_status" });
  expect(propsOf(form)).not.toHaveProperty("current_status");
  expect(propsOf(sendQuote)).not.toHaveProperty("current_status");
});

test("makeWorkflowApis: every form/simple endpoint passes runtime comment through to the handler", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const simpleApi = findApi(apis, "onboarding-schedule-followup-submit");
  const form = findApi(apis, "onboarding-qualify-submit");
  const sendQuote = findApi(apis, "onboarding-send-quote-submit");

  expect(propsOf(simpleApi).comment).toEqual({ _payload: "comment" });
  expect(propsOf(form).comment).toEqual({ _payload: "comment" });
  expect(propsOf(sendQuote).comment).toEqual({ _payload: "comment" });
});

test("makeWorkflowApis: sparse hooks, event_overrides maps", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const qualify = findApi(apis, "onboarding-qualify-submit");
  const sendQuote = findApi(apis, "onboarding-send-quote-submit");

  // Hook ids are wrapped in string-form _module.endpointId so the build
  // walker resolves them to pre-scoped opaque strings (own-entry scope).
  expect(propsOf(qualify).hooks).toEqual({
    submit_edit: {
      pre: { "_module.endpointId": "onboarding-qualify-submit_edit-pre" },
    },
  });
  expect(propsOf(qualify).hooks).not.toHaveProperty("post");
  expect(propsOf(qualify).hooks.submit_edit).not.toHaveProperty("post");

  // send-quote declares no hooks/event — both keys absent.
  expect(propsOf(sendQuote)).not.toHaveProperty("hooks");
  expect(propsOf(sendQuote)).not.toHaveProperty("event_overrides");
});

test("makeWorkflowApis: hook Api emission", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const hook = findApi(apis, "onboarding-qualify-submit_edit-pre");
  expect(hook).toBeDefined();
  // Engine-only: blocked over HTTP and from client CallAPI, reachable via callApi.
  expect(hook.type).toBe("InternalApi");
  expect(hook.routine).toEqual([{ id: "x", type: "MongoDBFindOne" }]);
});

test("makeWorkflowApis: group on_complete Api emission", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const onComplete = findApi(
    apis,
    "onboarding-group-phase-1-on-complete"
  );
  expect(onComplete).toBeDefined();
  // Engine-only, same rationale as hook Apis.
  expect(onComplete.type).toBe("InternalApi");
  expect(onComplete.routine).toEqual([{ id: "notify", type: "CallApi" }]);
});

test("makeWorkflowApis: per-action submit Api stays client-invokable type Api", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  expect(findApi(apis, "onboarding-qualify-submit").type).toBe("Api");
  expect(findApi(apis, "onboarding-send-quote-submit").type).toBe("Api");
  expect(findApi(apis, "onboarding-schedule-followup-submit").type).toBe("Api");
});

test("makeWorkflowApis: event_overrides carries the four-tuple", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const qualify = findApi(apis, "onboarding-qualify-submit");
  expect(propsOf(qualify).event_overrides).toEqual({
    submit_edit: {
      type: "qualified",
      display: "Lead qualified",
      references: { lead_id: "$action.references.lead_id" },
      metadata: { source: "qualify" },
    },
  });
});

test("makeWorkflowApis: stale interactions: YAML field is not baked into the endpoint payload", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const qualify = findApi(apis, "onboarding-qualify-submit");
  // qualifyAction fixture declares `interactions: { submit_edit: { status: "done" } }`
  // — the resolver silently drops it (Part 32 collapse).
  expect(propsOf(qualify)).not.toHaveProperty("interactions");
});

test("makeWorkflowApis: emitted endpoint properties contain no force slot", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  for (const api of apis.filter((a) => a.id.endsWith("-submit"))) {
    // Only action endpoints have routine[0].properties.
    if (api.routine?.[0]?.properties) {
      expect(api.routine[0].properties).not.toHaveProperty("force");
    }
  }
});

test("makeWorkflowApis: emitted ids are entry-scoped {workflow_type}-{action_type}-… with no workflow- prefix", () => {
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
    actions: [{ type: "do-it", kind: "simple" }],
  };
  expect(() => makeWorkflowApis(null, { workflows: [reserved] })).toThrow(
    /reserved workflow type name/,
  );
});

test("makeWorkflowApis: tracker-only workflow emits zero Apis", () => {
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
        tracker: { workflow_type: "installation" },
      },
    ],
  };
  const apis = makeWorkflowApis(null, { workflows: [workflow] });
  expect(apis).toEqual([]);
});
