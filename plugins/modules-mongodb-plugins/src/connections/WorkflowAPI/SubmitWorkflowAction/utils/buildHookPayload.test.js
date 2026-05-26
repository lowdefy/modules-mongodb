import buildHookPayload from "./buildHookPayload.js";

function baseContext(overrides = {}) {
  return {
    params: {
      action_id: "A1",
      interaction: "submit_edit",
      current_key: null,
      form: { a: 1 },
      form_review: { b: 2 },
      fields: { c: 3 },
      current_status: null,
      comment: "looks ok",
      ...(overrides.params ?? {}),
    },
    workflow: overrides.workflow ?? {
      _id: "W1",
      workflow_type: "onboarding",
    },
    action: overrides.action ?? { _id: "A1", type: "qualify" },
    user: overrides.user ?? {
      id: "u1",
      profile: { name: "Sam" },
      roles: ["account-manager"],
    },
  };
}

describe("buildHookPayload", () => {
  test("builds the full payload shape (no result)", () => {
    const payload = buildHookPayload(baseContext());
    expect(payload).toEqual({
      workflow_id: "W1",
      workflow_type: "onboarding",
      action_id: "A1",
      action_type: "qualify",
      current_key: null,
      interaction: "submit_edit",
      form: { a: 1 },
      form_review: { b: 2 },
      fields: { c: 3 },
      current_status: null,
      comment: "looks ok",
      user: {
        id: "u1",
        profile: { name: "Sam" },
        roles: ["account-manager"],
      },
      context: {
        workflow: { _id: "W1", workflow_type: "onboarding" },
        action: { _id: "A1", type: "qualify" },
      },
    });
    expect(payload).not.toHaveProperty("result");
  });

  test("includes result when provided", () => {
    const result = {
      action_ids: ["A1"],
      completed_groups: [],
      event_id: "EV-1",
      tracker_fired: [],
    };
    const payload = buildHookPayload(baseContext(), result);
    expect(payload.result).toBe(result);
  });

  test("current_status passes through when string", () => {
    const payload = buildHookPayload(
      baseContext({ params: { current_status: "in-progress" } }),
    );
    expect(payload.current_status).toBe("in-progress");
  });

  test("current_status is null when params.current_status is undefined", () => {
    const ctx = baseContext();
    delete ctx.params.current_status;
    expect(buildHookPayload(ctx).current_status).toBeNull();
  });

  test("comment defaults to null when params.comment is undefined", () => {
    const ctx = baseContext();
    delete ctx.params.comment;
    expect(buildHookPayload(ctx).comment).toBeNull();
  });

  test("context.workflow and context.action are the same references (not copies)", () => {
    const ctx = baseContext();
    const payload = buildHookPayload(ctx);
    expect(payload.context.workflow).toBe(ctx.workflow);
    expect(payload.context.action).toBe(ctx.action);
  });
});
