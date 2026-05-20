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
