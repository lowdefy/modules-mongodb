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

describe("resolveTargetStatus — pre-hook override layer (last wins)", () => {
  test("pre-hook status wins over engine default", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: formAction,
        params: {},
        preHookStatus: "changes-required",
      }),
    ).toBe("changes-required");
  });

  test("pre-hook status undefined falls through to engine default", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: formAction,
        params: {},
        preHookStatus: undefined,
      }),
    ).toBe("done");
  });

  test("task submit_edit still requires current_status when pre-hook status absent", () => {
    expect(() =>
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig: taskAction,
        params: {},
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

describe("resolveTargetStatus — pre-hook status enum-membership check", () => {
  const actionConfig = { ...formAction, type: "qualify" };

  test("valid pre-hook status passes through without throwing", () => {
    expect(
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig,
        params: {},
        preHookStatus: "done",
      }),
    ).toBe("done");
  });

  test("invalid pre-hook status throws UserError(isReject: false)", () => {
    let caught;
    try {
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig,
        params: {},
        preHookStatus: "not-a-real-stage",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.name).toBe("UserError");
    expect(caught.isReject).toBe(false);
    expect(caught.message).toContain("not-a-real-stage");
    expect(caught.message).toContain("qualify");
  });

  test("pre-hook status undefined skips the enum check", () => {
    expect(() =>
      resolveTargetStatus({
        interaction: "submit_edit",
        actionConfig,
        params: {},
        preHookStatus: undefined,
      }),
    ).not.toThrow();
  });
});
