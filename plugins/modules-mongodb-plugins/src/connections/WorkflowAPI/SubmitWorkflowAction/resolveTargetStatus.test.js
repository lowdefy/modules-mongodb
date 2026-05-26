import resolveTargetStatus from "./resolveTargetStatus.js";

const formAction = {
  kind: "form",
  access: { "my-app": ["view", "edit"], roles: ["account-manager"] },
};

const reviewableFormAction = {
  kind: "form",
  access: {
    "my-app": ["view", "edit", "review"],
    roles: ["account-manager"],
  },
};

const taskAction = {
  kind: "task",
  access: { "my-app": ["view", "edit"], roles: ["account-manager"] },
};

describe("resolveTargetStatus — engine default layer", () => {
  test("submit_edit on form action without review verb → done", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: formAction,
        params: {},
      }),
    ).toBe("done");
  });

  test("submit_edit on form action with review verb → in-review", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: reviewableFormAction,
        params: {},
      }),
    ).toBe("in-review");
  });

  test("submit_edit on task uses caller-supplied current_status", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: taskAction,
        params: { current_status: "in-progress" },
      }),
    ).toBe("in-progress");
  });

  test("submit_edit on task throws when current_status is missing", () => {
    expect(() =>
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: taskAction,
        params: {},
      }),
    ).toThrow(/task submit_edit requires caller-supplied current_status/);
  });

  test("not_required → not-required", () => {
    expect(
      resolveTargetStatus({
        interaction: "not_required",
        actionConfig: formAction,
        params: {},
      }),
    ).toBe("not-required");
  });

  test("resolve_error without review verb → done", () => {
    expect(
      resolveTargetStatus({
        interaction: "resolve_error",
        actionConfig: formAction,
        params: {},
      }),
    ).toBe("done");
  });

  test("resolve_error with review verb → in-review", () => {
    expect(
      resolveTargetStatus({
        interaction: "resolve_error",
        actionConfig: reviewableFormAction,
        params: {},
      }),
    ).toBe("in-review");
  });

  test("approve → done", () => {
    expect(
      resolveTargetStatus({
        interaction: "approve",
        actionConfig: reviewableFormAction,
        params: {},
      }),
    ).toBe("done");
  });

  test("request_changes → changes-required", () => {
    expect(
      resolveTargetStatus({
        interaction: "request_changes",
        actionConfig: reviewableFormAction,
        params: {},
      }),
    ).toBe("changes-required");
  });

  test("unknown interaction throws", () => {
    expect(() =>
      resolveTargetStatus({
        interaction: "bogus",
        actionConfig: formAction,
        params: {},
      }),
    ).toThrow(/unknown interaction "bogus"/);
  });
});

describe("resolveTargetStatus — YAML override layer", () => {
  test("YAML override wins over engine default", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: formAction,
        params: {},
        yamlInteractions: { submit_edit: { status: "in-review" } },
      }),
    ).toBe("in-review");
  });

  test("YAML override for a different interaction does not leak", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: formAction,
        params: {},
        yamlInteractions: { approve: { status: "in-review" } },
      }),
    ).toBe("done");
  });

  test("YAML override missing status key falls through to engine default", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: formAction,
        params: {},
        yamlInteractions: { submit_edit: {} },
      }),
    ).toBe("done");
  });
});

describe("resolveTargetStatus — pre-hook override layer (last wins)", () => {
  test("pre-hook status wins over YAML override", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: formAction,
        params: {},
        yamlInteractions: { submit_edit: { status: "in-review" } },
        preHookStatus: "done",
      }),
    ).toBe("done");
  });

  test("pre-hook status wins over engine default when no YAML override", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: formAction,
        params: {},
        preHookStatus: "changes-required",
      }),
    ).toBe("changes-required");
  });

  test("pre-hook status undefined falls through to lower layers", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: formAction,
        params: {},
        yamlInteractions: { submit_edit: { status: "in-review" } },
        preHookStatus: undefined,
      }),
    ).toBe("in-review");
  });

  test("task submit_edit still requires current_status when overrides present", () => {
    expect(() =>
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: taskAction,
        params: {},
        yamlInteractions: { submit_edit: { status: "in-progress" } },
        preHookStatus: "in-progress",
      }),
    ).toThrow(/task submit_edit requires caller-supplied current_status/);
  });

  test("task submit_edit pre-hook status overrides current_status engine resolution", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: taskAction,
        params: { current_status: "in-progress" },
        preHookStatus: "done",
      }),
    ).toBe("done");
  });
});
