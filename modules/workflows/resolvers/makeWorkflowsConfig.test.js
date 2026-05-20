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
