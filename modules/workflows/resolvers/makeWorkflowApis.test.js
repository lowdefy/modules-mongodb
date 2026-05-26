import makeWorkflowApis from "./makeWorkflowApis.js";

const qualifyAction = {
  type: "qualify",
  kind: "form",
  access: { "my-team-app": ["view", "edit"], roles: ["account-manager"] },
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
    "my-team-app": ["view", "edit", "review"],
    roles: ["account-manager", "ops-lead"],
  },
  action_group: "phase-1",
  blocked_by: ["qualify"],
  form: [{ id: "quote_total", type: "NumberInput" }],
};

const scheduleFollowupAction = {
  type: "schedule-followup",
  kind: "task",
  access: { "my-team-app": ["view", "edit"], roles: ["ops-lead"] },
  action_group: "phase-2",
};

const trackInstallationAction = {
  type: "track-installation",
  kind: "tracker",
  access: { "my-team-app": ["view"], roles: ["ops-lead"] },
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

test("makeWorkflowApis: worked example emits the expected update-action-* set, no tracker", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const ids = apis.map((a) => a.id).sort();
  expect(ids).toContain("update-action-qualify");
  expect(ids).toContain("update-action-send-quote");
  expect(ids).toContain("update-action-schedule-followup");
  expect(ids).not.toContain("update-action-track-installation");
});

test("makeWorkflowApis: task endpoint includes current_status; form endpoints do not", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const task = findApi(apis, "update-action-schedule-followup");
  const form = findApi(apis, "update-action-qualify");
  const sendQuote = findApi(apis, "update-action-send-quote");

  expect(propsOf(task).current_status).toEqual({ _payload: "current_status" });
  expect(propsOf(form)).not.toHaveProperty("current_status");
  expect(propsOf(sendQuote)).not.toHaveProperty("current_status");
});

test("makeWorkflowApis: every form/task endpoint passes runtime comment through to the handler", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const task = findApi(apis, "update-action-schedule-followup");
  const form = findApi(apis, "update-action-qualify");
  const sendQuote = findApi(apis, "update-action-send-quote");

  expect(propsOf(task).comment).toEqual({ _payload: "comment" });
  expect(propsOf(form).comment).toEqual({ _payload: "comment" });
  expect(propsOf(sendQuote).comment).toEqual({ _payload: "comment" });
});

test("makeWorkflowApis: sparse hooks, event_overrides, interactions maps", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const qualify = findApi(apis, "update-action-qualify");
  const sendQuote = findApi(apis, "update-action-send-quote");

  expect(propsOf(qualify).hooks).toEqual({
    submit_edit: { pre: "update-action-qualify-submit_edit-pre" },
  });
  expect(propsOf(qualify).hooks).not.toHaveProperty("post");
  expect(propsOf(qualify).hooks.submit_edit).not.toHaveProperty("post");

  // send-quote declares no hooks/event/interactions — all three keys absent.
  expect(propsOf(sendQuote)).not.toHaveProperty("hooks");
  expect(propsOf(sendQuote)).not.toHaveProperty("event_overrides");
  expect(propsOf(sendQuote)).not.toHaveProperty("interactions");
});

test("makeWorkflowApis: hook Api emission with synthesized auth.roles", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const hook = findApi(apis, "update-action-qualify-submit_edit-pre");
  expect(hook).toBeDefined();
  expect(hook.type).toBe("Api");
  expect(hook.auth).toEqual({ roles: ["account-manager"] });
  expect(hook.routine).toEqual([{ id: "x", type: "MongoDBFindOne" }]);
});

test("makeWorkflowApis: group on_complete Api emission with union of access.roles", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const onComplete = findApi(
    apis,
    "workflow-onboarding-group-phase-1-on-complete"
  );
  expect(onComplete).toBeDefined();
  expect(onComplete.type).toBe("Api");
  expect(onComplete.auth.roles.sort()).toEqual(
    ["account-manager", "ops-lead"].sort()
  );
  expect(onComplete.routine).toEqual([{ id: "notify", type: "CallApi" }]);
});

test("makeWorkflowApis: on_complete auth.roles dedupes across actions sharing roles", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    display_order: 1,
    action_groups: [
      {
        id: "phase-1",
        on_complete: { routine: [{ id: "x", type: "CallApi" }] },
      },
    ],
    starting_actions: [{ type: "a", status: "action-required" }],
    actions: [
      {
        type: "a",
        kind: "task",
        action_group: "phase-1",
        access: { roles: ["account-manager"] },
      },
      {
        type: "b",
        kind: "task",
        action_group: "phase-1",
        access: { roles: ["account-manager"] },
      },
    ],
  };
  const apis = makeWorkflowApis(null, { workflows: [workflow] });
  const onComplete = findApi(
    apis,
    "workflow-onboarding-group-phase-1-on-complete"
  );
  expect(onComplete.auth).toEqual({ roles: ["account-manager"] });
});

test("makeWorkflowApis: empty roles pass through verbatim", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    display_order: 1,
    action_groups: [
      {
        id: "phase-1",
        on_complete: { routine: [{ id: "x", type: "CallApi" }] },
      },
    ],
    starting_actions: [{ type: "a", status: "action-required" }],
    actions: [
      {
        type: "a",
        kind: "form",
        action_group: "phase-1",
        access: { roles: [] },
        form: [{ id: "x", type: "TextInput" }],
        hooks: {
          submit_edit: { pre: { routine: [{ id: "x", type: "CallApi" }] } },
        },
      },
    ],
  };
  const apis = makeWorkflowApis(null, { workflows: [workflow] });
  const hook = findApi(apis, "update-action-a-submit_edit-pre");
  expect(hook.auth).toEqual({ roles: [] });
  const onComplete = findApi(
    apis,
    "workflow-onboarding-group-phase-1-on-complete"
  );
  expect(onComplete.auth).toEqual({ roles: [] });
});

test("makeWorkflowApis: event_overrides carries the four-tuple", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const qualify = findApi(apis, "update-action-qualify");
  expect(propsOf(qualify).event_overrides).toEqual({
    submit_edit: {
      type: "qualified",
      display: "Lead qualified",
      references: { lead_id: "$action.references.lead_id" },
      metadata: { source: "qualify" },
    },
  });
});

test("makeWorkflowApis: interactions[interaction].status baked in", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  const qualify = findApi(apis, "update-action-qualify");
  expect(propsOf(qualify).interactions).toEqual({
    submit_edit: { status: "done" },
  });
});

test("makeWorkflowApis: emitted endpoint properties contain no force slot", () => {
  const apis = makeWorkflowApis(null, { workflows: [workedExample] });
  for (const api of apis.filter((a) => a.id.startsWith("update-action-"))) {
    // Only action endpoints have routine[0].properties.
    if (api.routine?.[0]?.properties) {
      expect(api.routine[0].properties).not.toHaveProperty("force");
    }
  }
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
        access: { roles: ["ops-lead"] },
        tracker: { workflow_type: "installation" },
      },
    ],
  };
  const apis = makeWorkflowApis(null, { workflows: [workflow] });
  expect(apis).toEqual([]);
});
