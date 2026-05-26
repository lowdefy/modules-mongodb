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

  test("YAML override on metadata.foo does NOT clobber default metadata.comment (regression: layer 3 folded into layer 1)", () => {
    const withComment = {
      ...defaultPayload,
      metadata: { ...defaultPayload.metadata, comment: "hello" },
    };
    const result = mergeEventOverrides({
      defaultPayload: withComment,
      yamlOverride: { metadata: { foo: "bar" } },
    });
    expect(result.metadata.comment).toBe("hello");
    expect(result.metadata.foo).toBe("bar");
  });

  test("pre-hook override on metadata.comment overrides layer-1 runtime comment", () => {
    const withComment = {
      ...defaultPayload,
      metadata: { ...defaultPayload.metadata, comment: "hello" },
    };
    const result = mergeEventOverrides({
      defaultPayload: withComment,
      preHookOverride: { metadata: { comment: "SCRUBBED" } },
    });
    expect(result.metadata.comment).toBe("SCRUBBED");
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

  test("pre-hook override on display.{appName} replaces just that key (one-level deep)", () => {
    const result = mergeEventOverrides({
      defaultPayload,
      preHookOverride: {
        display: {
          demo: { title: { _nunjucks: { template: "custom" } } },
        },
      },
    });
    expect(result.display.demo.title._nunjucks.template).toBe("custom");
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
