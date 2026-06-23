import makeWorkflowsConfig from "./makeWorkflowsConfig.js";

const validWorkflow = {
  type: "onboarding",
  entity_collection: "leads-collection",
  entity_ref_key: "lead_ids",
  display_order: 1,
  starting_actions: [{ type: "do-it", status: "action-required" }],
  actions: [{ type: "do-it", kind: "check" }],
};

test("makeWorkflowsConfig: entity_collection flows through and no entity_type appears on the normalized output", () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect(out.entity_collection).toBe("leads-collection");
  expect("entity_type" in out).toBe(false);
});

test("makeWorkflowsConfig: rejects legacy entity_type with migration message", () => {
  const workflow = {
    ...validWorkflow,
    entity_collection: undefined,
    entity_type: "lead",
  };
  delete workflow.entity_collection;

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /legacy "entity_type" field is no longer supported/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: rejects when both entity_type and entity_collection are declared (migration check fires first)", () => {
  const workflow = {
    ...validWorkflow,
    entity_type: "lead",
  };

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /legacy "entity_type" field is no longer supported/,
  );
});

test("makeWorkflowsConfig: entity_ref_key flows through to the normalized output", () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect(out.entity_ref_key).toBe("lead_ids");
});

test("makeWorkflowsConfig: rejects a workflow missing entity_ref_key", () => {
  const workflow = { ...validWorkflow };
  delete workflow.entity_ref_key;

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /missing required "entity_ref_key" — the event-references key/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: rejects an empty-string entity_ref_key", () => {
  const workflow = { ...validWorkflow, entity_ref_key: "" };

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /missing required "entity_ref_key"/,
  );
});

test("makeWorkflowsConfig: blocked_by referencing a declared action type passes", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check" },
      { type: "send-quote", kind: "check", blocked_by: ["qualify"] },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: blocked_by referencing a declared group id passes", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    action_groups: [{ id: "phase-1" }, { id: "phase-2" }],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check", action_group: "phase-1" },
      { type: "send-quote", kind: "check", blocked_by: ["phase-1"] },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: blocked_by with mixed group id + action type passes", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    action_groups: [{ id: "phase-1" }],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check", action_group: "phase-1" },
      {
        type: "send-quote",
        kind: "check",
        blocked_by: ["phase-1", "qualify"],
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: no blocked_by field on any action passes", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check" },
      { type: "send-quote", kind: "check" },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: blocked_by entry that resolves to nothing throws with action type, entry, and workflow type", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check" },
      { type: "send-quote", kind: "check", blocked_by: ["nonexistent-entry"] },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /send-quote/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /nonexistent-entry/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: blocked_by walk doesn't short-circuit on the first valid entry", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check" },
      {
        type: "send-quote",
        kind: "check",
        blocked_by: ["qualify", "nonexistent-entry"],
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /nonexistent-entry/,
  );
});

test("makeWorkflowsConfig: inline hook routine validates cleanly (signal-keyed)", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: {
          submit: {
            pre: { routine: [{ id: "x", type: "MongoDBFindOne" }] },
          },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: legacy string hook fails with migration message", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: { submit: { pre: "some-api-id" } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /legacy shape/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /Convert to an inline routine object/,
  );
});

test("makeWorkflowsConfig: hook value missing routine: array fails", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: { submit: { pre: { not_routine: [] } } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /must be an object with a routine: array/,
  );
});

test("makeWorkflowsConfig: unknown hook signal fails (legacy submit_edit rejected)", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: { submit_edit: { pre: { routine: [] } } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /is not a known signal/,
  );
});

test("makeWorkflowsConfig: completely unknown hook key fails", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: { surprise: { pre: { routine: [] } } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /is not a known signal/,
  );
});

// --- validateEvent: event: key validation -----------------------------------

test("makeWorkflowsConfig: signal-keyed event block validates cleanly", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        event: {
          submit: { type: "qualified", display: "Lead qualified" },
          approve: { type: "approved", display: "Lead approved" },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: legacy event key submit_edit hard-errors", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        event: {
          submit_edit: { type: "qualified", display: "Lead qualified" },
        },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /is not a known signal/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /submit_edit/,
  );
});

test("makeWorkflowsConfig: unknown event key hard-errors", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        event: { surprise: { type: "something" } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /is not a known signal/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /surprise/,
  );
});

test("makeWorkflowsConfig: inline on_complete routine validates cleanly", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    action_groups: [
      {
        id: "phase-1",
        on_complete: {
          routine: [{ id: "notify", type: "CallApi" }],
        },
      },
    ],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [{ type: "qualify", kind: "check", action_group: "phase-1" }],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: legacy string on_complete fails with migration message", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    action_groups: [
      {
        id: "phase-1",
        on_complete: "workflow_config/onboarding/api/phase-1-complete.yaml",
      },
    ],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [{ type: "qualify", kind: "check", action_group: "phase-1" }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /on_complete is a string/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /legacy shape/,
  );
});

// Stub child workflow used in tracker tests so that tracker.child_workflow_type
// "device-installation" resolves to a declared type in the workflows array.
const deviceInstallationStub = {
  type: "device-installation",
  entity_collection: "installations-collection",
  entity_ref_key: "installation_ids",
};

// --- validateActionAccess (Part 34 D4) -------------------------------------

function workflowWithAccess(access) {
  return {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [{ type: "qualify", kind: "form", form: [], access }],
  };
}

test("validateActionAccess: accepts the verb→gate map (true and array gates)", () => {
  const wf = workflowWithAccess({
    demo: { view: true, edit: ["account-manager"], review: ["account-manager"] },
    support: { view: ["support-rep"] },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).not.toThrow();
});

test("validateActionAccess: rejects the empty-list gate []", () => {
  const wf = workflowWithAccess({ demo: { view: true, edit: [] } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /empty list \[\] — invalid/,
  );
});

test("validateActionAccess: rejects the shorthand list form access.{app}: [verbs]", () => {
  const wf = workflowWithAccess({ demo: ["view", "edit"] });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /removed shorthand list form/,
  );
});

test("validateActionAccess: rejects the removed action-wide access.roles", () => {
  const wf = workflowWithAccess({ demo: { view: true }, roles: ["admin"] });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /access\.roles .* is removed/,
  );
});

test("validateActionAccess: rejects notification_roles nested under access", () => {
  const wf = workflowWithAccess({
    demo: { view: true },
    notification_roles: ["admin"],
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /notification_roles lives at the action root/,
  );
});

test("validateActionAccess: rejects an unknown verb key", () => {
  const wf = workflowWithAccess({ demo: { view: true, delete: true } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /unknown verb key "delete"/,
  );
});

test("validateActionAccess: rejects a gate that is neither true nor a role array", () => {
  const wf = workflowWithAccess({ demo: { view: "admin" } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /gate must be true or a non-empty array of role strings/,
  );
});

test("validateActionAccess: notification_roles at the action root is valid", () => {
  const wf = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "form",
        form: [],
        access: { demo: { view: true } },
        notification_roles: ["admin"],
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).not.toThrow();
});

test("validateActionAccess: lint-warns (does not throw) on edit/review/error without view", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const wf = workflowWithAccess({ demo: { edit: ["account-manager"] } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).not.toThrow();
  expect(warn).toHaveBeenCalledWith(
    expect.stringMatching(/declares edit\/review\/error without view/),
  );
  warn.mockRestore();
});

// --- validateStatusMapCells (Part 30 D9) -----------------------------------

function workflowWithStatusMap(status_map) {
  return {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "form",
        form: [],
        access: { demo: { view: true } },
        status_map,
      },
    ],
  };
}

test("validateStatusMapCells: accepts a message-only cell and a status_title", () => {
  const wf = workflowWithStatusMap({
    "action-required": { demo: { message: "Qualify the lead." }, status_title: "Qualifying" },
    done: { status_title: null },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).not.toThrow();
});

test("makeWorkflowsConfig: status_map is validated but NOT carried on the returned blob (Part 48)", () => {
  // status_map now arrives per-request via render_config and is spliced at load
  // time (loadWorkflowState seam), so the connection blob must not carry it.
  const wf = workflowWithStatusMap({
    "action-required": { demo: { message: "Qualify the lead." }, status_title: "Qualifying" },
    done: { status_title: null },
  });
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect("status_map" in out.actions[0]).toBe(false);
});

test("validateStatusMapCells: rejects link: on a built-in kind", () => {
  const wf = workflowWithStatusMap({
    done: { demo: { message: "Done.", link: { pageId: "x" } } },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /link is engine-managed for kind: form/,
  );
});

test("validateStatusMapCells: rejects an invalid stage key", () => {
  const wf = workflowWithStatusMap({ "not-a-stage": { demo: { message: "x" } } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /is not a member of action_statuses/,
  );
});

test("validateStatusMapCells: rejects a non-string/null status_title", () => {
  const wf = workflowWithStatusMap({ done: { status_title: 42 } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /status_title must be a string or null/,
  );
});

// --- validateTrackerStartLink (Part 44) ------------------------------------

function workflowWithTracker(tracker) {
  return {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "install-device", status: "action-required" }],
    actions: [{ type: "install-device", kind: "tracker", tracker }],
  };
}

test("validateTrackerStartLink: full shape (pageId + urlQuery with sentinels and static string) passes and flows through", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: {
      pageId: "ticket-new",
      urlQuery: {
        action_id: true,
        entity_id: true,
        source: "onboarding",
      },
    },
  });
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect(out.actions[0].tracker.start_link).toEqual({
    pageId: "ticket-new",
    urlQuery: { action_id: true, entity_id: true, source: "onboarding" },
  });
});

test("validateTrackerStartLink: minimal shape (pageId only, no urlQuery) passes", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new" },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).not.toThrow();
});

test("validateTrackerStartLink: tracker block with no start_link passes (regression guard)", () => {
  const wf = workflowWithTracker({ child_workflow_type: "device-installation" });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).not.toThrow();
});

test("validateTrackerStartLink: rejects missing pageId", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { urlQuery: { source: "onboarding" } },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link\.pageId must be a non-empty string/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /onboarding/,
  );
});

test("validateTrackerStartLink: rejects non-string pageId", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: 42 },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link\.pageId must be a non-empty string/,
  );
});

test("validateTrackerStartLink: rejects empty-string pageId", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "" },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link\.pageId must be a non-empty string/,
  );
});

test("validateTrackerStartLink: rejects unknown key — specifically title:", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", title: "Create ticket" },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link has unknown key "title"/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /only pageId and urlQuery are allowed/,
  );
});

test("validateTrackerStartLink: rejects start_link that is a string", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: "ticket-new",
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link must be a plain object/,
  );
});

test("validateTrackerStartLink: rejects start_link that is an array", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: [{ pageId: "ticket-new" }],
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link must be a plain object/,
  );
});

test("validateTrackerStartLink: rejects urlQuery that is not an object", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: "not-an-object" },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link\.urlQuery must be a plain object/,
  );
});

test("validateTrackerStartLink: rejects urlQuery with true on a non-sentinel key (source: true)", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: { source: true } },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link\.urlQuery\.source must be a string/,
  );
});

test("validateTrackerStartLink: rejects urlQuery with static string on reserved key action_id", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: { action_id: "some-id" } },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link\.urlQuery\.action_id is a reserved sentinel key/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /value must be exactly true/,
  );
});

test("validateTrackerStartLink: rejects urlQuery with static string on reserved key entity_id", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: { entity_id: "foo" } },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link\.urlQuery\.entity_id is a reserved sentinel key/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /value must be exactly true/,
  );
});

test("validateTrackerStartLink: rejects urlQuery with non-string static — number (count: 3)", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: { count: 3 } },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link\.urlQuery\.count must be a string/,
  );
});

test("validateTrackerStartLink: rejects urlQuery with non-string static — boolean false (flag: false)", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: { flag: false } },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /tracker\.start_link\.urlQuery\.flag must be a string/,
  );
});

// --- title materialization (workflow / action / group) ----------------------

test("makeWorkflowsConfig: explicit workflow title flows through verbatim", () => {
  const workflow = { ...validWorkflow, title: "Custom Onboarding" };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.title).toBe("Custom Onboarding");
});

test("makeWorkflowsConfig: workflow without title derives it from type", () => {
  const workflow = { ...validWorkflow, type: "company-setup" };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.title).toBe("Company Setup");
});

test("makeWorkflowsConfig: action without title derives it from type", () => {
  const workflow = {
    ...validWorkflow,
    starting_actions: [{ type: "upload-po", status: "action-required" }],
    actions: [{ type: "upload-po", kind: "check" }],
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.actions[0].title).toBe("Upload PO");
});

test("makeWorkflowsConfig: explicit action title wins over the derived default", () => {
  const workflow = {
    ...validWorkflow,
    starting_actions: [{ type: "upload-po", status: "action-required" }],
    actions: [{ type: "upload-po", kind: "check", title: "Send the PO" }],
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.actions[0].title).toBe("Send the PO");
});

test("makeWorkflowsConfig: group title — explicit wins, else derived from id (2-tier)", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    action_groups: [{ id: "kickoff-call", title: "Kickoff" }, { id: "billing-details" }],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [{ type: "qualify", kind: "check", action_group: "kickoff-call" }],
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.action_groups[0].title).toBe("Kickoff");
  expect(out.action_groups[1].title).toBe("Billing Details");
});

test("makeWorkflowsConfig: title_acronyms extends the humanizer for all defaults", () => {
  const workflow = {
    type: "manage-bom",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    action_groups: [{ id: "bom-review" }],
    starting_actions: [{ type: "upload-bom", status: "action-required" }],
    actions: [{ type: "upload-bom", kind: "check", action_group: "bom-review" }],
  };
  const [out] = makeWorkflowsConfig(null, {
    workflows: [workflow],
    title_acronyms: ["BOM"],
  });
  expect(out.title).toBe("Manage BOM");
  expect(out.actions[0].title).toBe("Upload BOM");
  expect(out.action_groups[0].title).toBe("BOM Review");
});

test("makeWorkflowsConfig: rejects a non-string workflow title", () => {
  const workflow = { ...validWorkflow, title: 42 };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /workflow title must be a string when present/,
  );
});

test("makeWorkflowsConfig: rejects a non-string action title", () => {
  const workflow = {
    ...validWorkflow,
    actions: [{ type: "do-it", kind: "check", title: { x: 1 } }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /action "do-it" title must be a string when present/,
  );
});

test("makeWorkflowsConfig: rejects a non-string group title", () => {
  const workflow = {
    ...validWorkflow,
    action_groups: [{ id: "phase-1", title: 7 }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /action_groups "phase-1" title must be a string when present/,
  );
});

// --- form_meta (form-kind actions) ------------------------------------------

const qualifyAction = {
  type: "qualify",
  kind: "form",
  form: [
    { component: "text_input", key: "contact_name", required: true, title: "Contact name" },
    { component: "text_area", key: "notes", title: "Notes" },
  ],
};

const sendQuoteAction = {
  type: "send-quote",
  kind: "form",
  form: [{ component: "number", key: "quote_total", required: true }],
  form_review: [{ component: "text_area", key: "approve_notes" }],
};

const proofOfInstallAction = {
  type: "proof-of-installation",
  kind: "form",
  form: [
    {
      component: "controlled_list",
      key: "form.devices",
      required: true,
      title: "Devices",
      form: [
        { component: "label_value", key: "form.devices.$._id", title: "Device Number" },
        { component: "date_range_selector", key: "form.devices.$.warranty", required: true, title: "Warranty" },
      ],
    },
  ],
};

function workflowWithFormActions(...actions) {
  return {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: actions[0].type, status: "action-required" }],
    actions,
  };
}

test("makeWorkflowsConfig: form-kind action carries form_meta matching makeActionFormConfigs shape", () => {
  const wf = workflowWithFormActions(qualifyAction);
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect(out.actions[0].form_meta).toEqual({
    form: [
      { component: "text_input", key: "contact_name", required: true, title: "Contact name" },
      { component: "text_area", key: "notes", required: false, title: "Notes" },
    ],
  });
});

test("makeWorkflowsConfig: form_meta includes form_review when present", () => {
  const wf = workflowWithFormActions(sendQuoteAction);
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect(out.actions[0].form_meta).toEqual({
    form: [{ component: "number", key: "quote_total", required: true }],
    form_review: [{ component: "text_area", key: "approve_notes", required: false }],
  });
  expect("form_error" in out.actions[0].form_meta).toBe(false);
});

test("makeWorkflowsConfig: form_meta includes form_error when present", () => {
  const withError = {
    type: "qualify-with-error",
    kind: "form",
    form: [{ component: "text_input", key: "name", required: true }],
    form_error: [{ component: "text_area", key: "recovery_notes" }],
  };
  const wf = workflowWithFormActions(withError);
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect(out.actions[0].form_meta.form_error).toEqual([
    { component: "text_area", key: "recovery_notes", required: false },
  ]);
});

test("makeWorkflowsConfig: form_meta recurses into controlled_list structural component", () => {
  const wf = workflowWithFormActions(proofOfInstallAction);
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect(out.actions[0].form_meta).toEqual({
    form: [
      {
        component: "controlled_list",
        key: "form.devices",
        required: true,
        title: "Devices",
        form: [
          { component: "label_value", key: "form.devices.$._id", required: false, title: "Device Number" },
          { component: "date_range_selector", key: "form.devices.$.warranty", required: true, title: "Warranty" },
        ],
      },
    ],
  });
});

test("makeWorkflowsConfig: check-kind action has no form_meta", () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect("form_meta" in out.actions[0]).toBe(false);
});

test("makeWorkflowsConfig: tracker-kind action has no form_meta", () => {
  const wf = workflowWithTracker({ child_workflow_type: "device-installation" });
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect("form_meta" in out.actions[0]).toBe(false);
});

// --- allow_not_required -----------------------------------------------------

test("makeWorkflowsConfig: allow_not_required defaults to false when absent (check-kind)", () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect(out.actions[0].allow_not_required).toBe(false);
});

test("makeWorkflowsConfig: allow_not_required: true flows through on a form-kind action", () => {
  const wf = workflowWithFormActions({ ...qualifyAction, allow_not_required: true });
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect(out.actions[0].allow_not_required).toBe(true);
});

test("makeWorkflowsConfig: allow_not_required: false flows through explicitly", () => {
  const wf = workflowWithFormActions({ ...qualifyAction, allow_not_required: false });
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect(out.actions[0].allow_not_required).toBe(false);
});

test("makeWorkflowsConfig: allow_not_required: true flows through on a tracker-kind action", () => {
  const wf = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "install-device", status: "action-required" }],
    actions: [
      {
        type: "install-device",
        kind: "tracker",
        tracker: { child_workflow_type: "device-installation" },
        allow_not_required: true,
      },
    ],
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect(out.actions[0].allow_not_required).toBe(true);
});

test("makeWorkflowsConfig: non-boolean allow_not_required hard-errors with makeWorkflowsConfig: message", () => {
  const wf = workflowWithFormActions({ ...qualifyAction, allow_not_required: "yes" });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /makeWorkflowsConfig:/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /allow_not_required must be a boolean/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: non-boolean allow_not_required (number) hard-errors", () => {
  const wf = workflowWithFormActions({ ...qualifyAction, allow_not_required: 1 });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })).toThrow(
    /allow_not_required must be a boolean/,
  );
});

test("makeWorkflowsConfig: allow_not_required works on check-kind action too", () => {
  const wf = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "do-it", status: "action-required" }],
    actions: [{ type: "do-it", kind: "check", allow_not_required: true }],
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] });
  expect(out.actions[0].allow_not_required).toBe(true);
});

// --- validateTrackerChildWorkflowType + validateTrackerEdges (Part 48 D6) ---

function trackerWorkflow(overrides = {}) {
  return {
    type: "parent",
    entity_collection: "parents-collection",
    entity_ref_key: "parent_ids",
    starting_actions: [{ type: "track-it", status: "action-required" }],
    actions: [
      {
        type: "track-it",
        kind: "tracker",
        tracker: { child_workflow_type: "child" },
        ...overrides,
      },
    ],
  };
}

const childStub = {
  type: "child",
  entity_collection: "children-collection",
  entity_ref_key: "child_ids",
};

test("validateTrackerChildWorkflowType: valid child_workflow_type resolving to a declared type passes", () => {
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [trackerWorkflow(), childStub] })
  ).not.toThrow();
});

test("validateTrackerChildWorkflowType: missing child_workflow_type hard-errors", () => {
  const wf = {
    type: "parent",
    entity_collection: "parents-collection",
    entity_ref_key: "parent_ids",
    starting_actions: [{ type: "track-it", status: "action-required" }],
    actions: [{ type: "track-it", kind: "tracker", tracker: {} }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, childStub] })).toThrow(
    /tracker\.child_workflow_type must be a non-empty string/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, childStub] })).toThrow(
    /parent/,
  );
});

test("validateTrackerChildWorkflowType: empty-string child_workflow_type hard-errors", () => {
  const wf = {
    type: "parent",
    entity_collection: "parents-collection",
    entity_ref_key: "parent_ids",
    starting_actions: [{ type: "track-it", status: "action-required" }],
    actions: [{ type: "track-it", kind: "tracker", tracker: { child_workflow_type: "" } }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, childStub] })).toThrow(
    /tracker\.child_workflow_type must be a non-empty string/,
  );
});

test("validateTrackerChildWorkflowType: non-string child_workflow_type hard-errors", () => {
  const wf = {
    type: "parent",
    entity_collection: "parents-collection",
    entity_ref_key: "parent_ids",
    starting_actions: [{ type: "track-it", status: "action-required" }],
    actions: [{ type: "track-it", kind: "tracker", tracker: { child_workflow_type: 42 } }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, childStub] })).toThrow(
    /tracker\.child_workflow_type must be a non-empty string/,
  );
});

test("validateTrackerChildWorkflowType: legacy tracker.workflow_type key hard-errors with rename hint", () => {
  const wf = {
    type: "parent",
    entity_collection: "parents-collection",
    entity_ref_key: "parent_ids",
    starting_actions: [{ type: "track-it", status: "action-required" }],
    actions: [
      { type: "track-it", kind: "tracker", tracker: { workflow_type: "child" } },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, childStub] })).toThrow(
    /tracker\.workflow_type is renamed/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, childStub] })).toThrow(
    /tracker\.child_workflow_type/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf, childStub] })).toThrow(
    /Part 48 D6/,
  );
});

test("validateTrackerEdges: child_workflow_type not matching any declared workflow type hard-errors", () => {
  const wf = trackerWorkflow(); // references "child" which is not in the workflows array
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /child_workflow_type "child" which is not a declared workflow type/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /parent/,
  );
});

test("validateTrackerEdges: no cycle — linear parent → child passes", () => {
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [trackerWorkflow(), childStub] })
  ).not.toThrow();
});

test("validateTrackerEdges: direct cycle (a → b → a) hard-errors naming the path", () => {
  const a = {
    type: "a",
    entity_collection: "a-collection",
    entity_ref_key: "a_ids",
    starting_actions: [{ type: "track-b", status: "action-required" }],
    actions: [{ type: "track-b", kind: "tracker", tracker: { child_workflow_type: "b" } }],
  };
  const b = {
    type: "b",
    entity_collection: "b-collection",
    entity_ref_key: "b_ids",
    starting_actions: [{ type: "track-a", status: "action-required" }],
    actions: [{ type: "track-a", kind: "tracker", tracker: { child_workflow_type: "a" } }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [a, b] })).toThrow(
    /tracker cycle/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [a, b] })).toThrow(
    /a.*b.*a|b.*a.*b/,
  );
});

test("validateTrackerEdges: longer cycle (a → b → c → a) hard-errors naming the path", () => {
  const a = {
    type: "a",
    entity_collection: "a-collection",
    entity_ref_key: "a_ids",
    starting_actions: [{ type: "track-b", status: "action-required" }],
    actions: [{ type: "track-b", kind: "tracker", tracker: { child_workflow_type: "b" } }],
  };
  const b = {
    type: "b",
    entity_collection: "b-collection",
    entity_ref_key: "b_ids",
    starting_actions: [{ type: "track-c", status: "action-required" }],
    actions: [{ type: "track-c", kind: "tracker", tracker: { child_workflow_type: "c" } }],
  };
  const c = {
    type: "c",
    entity_collection: "c-collection",
    entity_ref_key: "c_ids",
    starting_actions: [{ type: "track-a", status: "action-required" }],
    actions: [{ type: "track-a", kind: "tracker", tracker: { child_workflow_type: "a" } }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [a, b, c] })).toThrow(
    /tracker cycle/,
  );
});

// --- validateEvent: mirror signals (Part 48 D4) --------------------------------

test("makeWorkflowsConfig: tracker action with mirror-signal event key passes", () => {
  const wf = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    starting_actions: [{ type: "install-device", status: "action-required" }],
    actions: [
      {
        type: "install-device",
        kind: "tracker",
        tracker: { child_workflow_type: "device-installation" },
        event: {
          internal_mirror_child_completed: { display: { demo: { title: "Child completed" } } },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })
  ).not.toThrow();
});

test("makeWorkflowsConfig: form action with mirror-signal event key hard-errors with kind-restriction message", () => {
  const wf = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "form",
        form: [],
        event: {
          internal_mirror_child_completed: { display: { demo: { title: "x" } } },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })
  ).toThrow(/mirror signal/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })
  ).toThrow(/kind: tracker/);
});

test("makeWorkflowsConfig: check action with mirror-signal event key hard-errors with kind-restriction message", () => {
  const wf = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        event: {
          internal_mirror_child_active: { display: { demo: { title: "x" } } },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })
  ).toThrow(/mirror signal/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })
  ).toThrow(/kind: tracker/);
});

test("makeWorkflowsConfig: tracker action with unknown event key still hard-errors", () => {
  const wf = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    starting_actions: [{ type: "install-device", status: "action-required" }],
    actions: [
      {
        type: "install-device",
        kind: "tracker",
        tracker: { child_workflow_type: "device-installation" },
        event: {
          completely_unknown_signal: { display: { demo: { title: "x" } } },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })
  ).toThrow(/is not a known signal/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] })
  ).toThrow(/completely_unknown_signal/);
});

// --- validateWorkflowEvent: workflow-level event map (Part 48 D8) ------------

test("makeWorkflowsConfig: workflow-level event with lifecycle signal keys passes", () => {
  const wf = {
    ...validWorkflow,
    event: {
      started: { display: { demo: { title: "Onboarding started" } } },
      cancelled: { display: { demo: { title: "Onboarding cancelled" } } },
      closed: { display: { demo: { title: "Onboarding closed" } } },
    },
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf] })
  ).not.toThrow();
});

test("makeWorkflowsConfig: workflow-level event with unknown key hard-errors", () => {
  const wf = {
    ...validWorkflow,
    event: {
      started: { display: { demo: { title: "x" } } },
      submit: { display: { demo: { title: "x" } } },
    },
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf] })
  ).toThrow(/is not a known lifecycle signal/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf] })
  ).toThrow(/submit/);
});

test("makeWorkflowsConfig: workflow-level event is not present on the returned config blob", () => {
  const wf = {
    ...validWorkflow,
    event: {
      started: { display: { demo: { title: "x" } } },
    },
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [wf] });
  expect("event" in out).toBe(false);
});
