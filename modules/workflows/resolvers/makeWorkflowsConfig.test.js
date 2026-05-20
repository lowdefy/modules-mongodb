import makeWorkflowsConfig from "./makeWorkflowsConfig.js";

const validWorkflow = {
  type: "onboarding",
  entity_collection: "leads-collection",
  display_order: 1,
  starting_actions: [{ type: "do-it", status: "action-required" }],
  actions: [{ type: "do-it", kind: "task" }],
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

test("makeWorkflowsConfig: blocked_by referencing a declared action type passes", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "task" },
      { type: "send-quote", kind: "task", blocked_by: ["qualify"] },
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
    display_order: 1,
    action_groups: [{ id: "phase-1" }, { id: "phase-2" }],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "task", action_group: "phase-1" },
      { type: "send-quote", kind: "task", blocked_by: ["phase-1"] },
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
    display_order: 1,
    action_groups: [{ id: "phase-1" }],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "task", action_group: "phase-1" },
      {
        type: "send-quote",
        kind: "task",
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
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "task" },
      { type: "send-quote", kind: "task" },
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
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "task" },
      { type: "send-quote", kind: "task", blocked_by: ["nonexistent-entry"] },
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
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "task" },
      {
        type: "send-quote",
        kind: "task",
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
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "task",
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
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "task",
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
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "task",
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
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "task",
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
    actions: [{ type: "qualify", kind: "task", action_group: "phase-1" }],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: legacy string on_complete fails with migration message", () => {
  const workflow = {
    type: "onboarding",
    entity_collection: "leads-collection",
    display_order: 1,
    action_groups: [
      {
        id: "phase-1",
        on_complete: "workflow_config/onboarding/api/phase-1-complete.yaml",
      },
    ],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [{ type: "qualify", kind: "task", action_group: "phase-1" }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /on_complete is a string/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /legacy shape/,
  );
});
