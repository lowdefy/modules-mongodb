import mergeEventOverrides from "./mergeEventOverrides.js";

const defaultPayload = {
  type: "action-submit_edit",
  display: {
    demo: {
      title: { _nunjucks: { template: "default title" } },
    },
  },
  references: {
    workflow_ids: ["W1"],
    action_ids: ["A1"],
    leads_ids: ["L1"],
  },
  metadata: {
    action_type: "qualify",
    workflow_type: "onboarding",
    interaction: "submit_edit",
    current_key: null,
    status_before: "action-required",
    status_after: "done",
  },
};

describe("mergeEventOverrides", () => {
  test("no overrides returns defaultPayload unchanged", () => {
    expect(
      mergeEventOverrides({
        defaultPayload,
        yamlOverride: undefined,
        preHookOverride: undefined,
      }),
    ).toEqual(defaultPayload);
  });

  test("YAML override on metadata.foo keeps default metadata.action_type", () => {
    const result = mergeEventOverrides({
      defaultPayload,
      yamlOverride: { metadata: { foo: "yaml-foo" } },
    });
    expect(result.metadata.foo).toBe("yaml-foo");
    expect(result.metadata.action_type).toBe("qualify");
  });

  test("pre-hook override on type replaces default type", () => {
    const result = mergeEventOverrides({
      defaultPayload,
      preHookOverride: { type: "custom-event" },
    });
    expect(result.type).toBe("custom-event");
  });

  test("empty-string pre-hook type does NOT replace default", () => {
    const result = mergeEventOverrides({
      defaultPayload,
      preHookOverride: { type: "" },
    });
    expect(result.type).toBe("action-submit_edit");
  });

  test("deep-merge under app key: author title override wins, sibling keys survive", () => {
    const base = {
      ...defaultPayload,
      display: { demo: { title: "Engine title", info: "kept" } },
    };
    const result = mergeEventOverrides({
      defaultPayload: base,
      preHookOverride: { display: { demo: { title: "Custom" } } },
    });
    expect(result.display.demo.title).toBe("Custom");
    expect(result.display.demo.info).toBe("kept");
  });

  test("override under a different app key adds its bucket, keeps the engine bucket", () => {
    const base = {
      ...defaultPayload,
      display: { demo: { title: "Engine title" } },
    };
    const result = mergeEventOverrides({
      defaultPayload: base,
      yamlOverride: { display: { portal: { title: "Generic" } } },
    });
    expect(result.display.portal.title).toBe("Generic");
    expect(result.display.demo.title).toBe("Engine title");
  });

  test("description on a merged app bucket is stripped (comment-only, D4)", () => {
    const base = {
      ...defaultPayload,
      display: { demo: { title: "Engine title" } },
    };
    const result = mergeEventOverrides({
      defaultPayload: base,
      preHookOverride: { display: { demo: { description: "Custom" } } },
    });
    expect(result.display.demo).not.toHaveProperty("description");
    expect(result.display.demo.title).toBe("Engine title");
  });

  test("YAML + pre-hook combined: pre-hook wins on collision; non-colliding YAML fields remain", () => {
    const result = mergeEventOverrides({
      defaultPayload,
      yamlOverride: { metadata: { yaml_field: "y", shared: "from-yaml" } },
      preHookOverride: { metadata: { shared: "from-prehook" } },
    });
    expect(result.metadata.yaml_field).toBe("y");
    expect(result.metadata.shared).toBe("from-prehook");
    expect(result.metadata.action_type).toBe("qualify");
  });

  test("override of references adds key while keeping default ref keys", () => {
    const result = mergeEventOverrides({
      defaultPayload,
      preHookOverride: { references: { extra_ids: ["X1"] } },
    });
    expect(result.references.extra_ids).toEqual(["X1"]);
    expect(result.references.workflow_ids).toEqual(["W1"]);
  });
});
