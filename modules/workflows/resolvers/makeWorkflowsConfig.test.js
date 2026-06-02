import makeWorkflowsConfig from "./makeWorkflowsConfig.js";

const validWorkflow = {
  type: "onboarding",
  entity_collection: "leads-collection",
  entity_ref_key: "lead_ids",
  display_order: 1,
  starting_actions: [{ type: "do-it", status: "action-required" }],
  actions: [{ type: "do-it", kind: "simple" }],
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
      { type: "qualify", kind: "simple" },
      { type: "send-quote", kind: "simple", blocked_by: ["qualify"] },
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
      { type: "qualify", kind: "simple", action_group: "phase-1" },
      { type: "send-quote", kind: "simple", blocked_by: ["phase-1"] },
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
      { type: "qualify", kind: "simple", action_group: "phase-1" },
      {
        type: "send-quote",
        kind: "simple",
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
      { type: "qualify", kind: "simple" },
      { type: "send-quote", kind: "simple" },
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
      { type: "qualify", kind: "simple" },
      { type: "send-quote", kind: "simple", blocked_by: ["nonexistent-entry"] },
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
      { type: "qualify", kind: "simple" },
      {
        type: "send-quote",
        kind: "simple",
        blocked_by: ["qualify", "nonexistent-entry"],
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /nonexistent-entry/,
  );
});

test("makeWorkflowsConfig: inline hook routine validates cleanly", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "simple",
        hooks: {
          submit_edit: {
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
        kind: "simple",
        hooks: { submit_edit: { pre: "some-api-id" } },
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
        kind: "simple",
        hooks: { submit_edit: { pre: { not_routine: [] } } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /must be an object with a routine: array/,
  );
});

test("makeWorkflowsConfig: unknown hook interaction fails", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    entity_ref_key: "lead_ids",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "simple",
        hooks: { surprise: { pre: { routine: [] } } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /is not a known interaction/,
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
    actions: [{ type: "qualify", kind: "simple", action_group: "phase-1" }],
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
    actions: [{ type: "qualify", kind: "simple", action_group: "phase-1" }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /on_complete is a string/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /legacy shape/,
  );
});

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
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).not.toThrow();
});

test("validateActionAccess: rejects the empty-list gate []", () => {
  const wf = workflowWithAccess({ demo: { view: true, edit: [] } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /empty list \[\] — invalid/,
  );
});

test("validateActionAccess: rejects the shorthand list form access.{app}: [verbs]", () => {
  const wf = workflowWithAccess({ demo: ["view", "edit"] });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /removed shorthand list form/,
  );
});

test("validateActionAccess: rejects the removed action-wide access.roles", () => {
  const wf = workflowWithAccess({ demo: { view: true }, roles: ["admin"] });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /access\.roles .* is removed/,
  );
});

test("validateActionAccess: rejects notification_roles nested under access", () => {
  const wf = workflowWithAccess({
    demo: { view: true },
    notification_roles: ["admin"],
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /notification_roles lives at the action root/,
  );
});

test("validateActionAccess: rejects an unknown verb key", () => {
  const wf = workflowWithAccess({ demo: { view: true, delete: true } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /unknown verb key "delete"/,
  );
});

test("validateActionAccess: rejects a gate that is neither true nor a role array", () => {
  const wf = workflowWithAccess({ demo: { view: "admin" } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
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
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).not.toThrow();
});

test("validateActionAccess: lint-warns (does not throw) on edit/review/error without view", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const wf = workflowWithAccess({ demo: { edit: ["account-manager"] } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).not.toThrow();
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
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).not.toThrow();
});

test("validateStatusMapCells: rejects link: on a built-in kind", () => {
  const wf = workflowWithStatusMap({
    done: { demo: { message: "Done.", link: { pageId: "x" } } },
  });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /link is engine-managed for kind: form/,
  );
});

test("validateStatusMapCells: rejects an invalid stage key", () => {
  const wf = workflowWithStatusMap({ "not-a-stage": { demo: { message: "x" } } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /is not a member of action_statuses/,
  );
});

test("validateStatusMapCells: rejects a non-string/null status_title", () => {
  const wf = workflowWithStatusMap({ done: { status_title: 42 } });
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /status_title must be a string or null/,
  );
});
