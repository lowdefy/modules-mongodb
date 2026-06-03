import invokePostHook from "./invokePostHook.js";

function makeContext(overrides = {}) {
  return {
    params: {
      action_id: "A1",
      interaction: "approve",
      current_key: null,
      form: {},
      form_review: {},
      fields: {},
      current_status: null,
      comment: null,
      hooks: undefined,
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
    callApi: overrides.callApi ?? jest.fn(async () => ({ ok: true })),
  };
}

const result = {
  action_ids: ["A1"],
  completed_groups: [],
  event_id: "EV-1",
  tracker_fired: [],
};

describe("invokePostHook — skip cases", () => {
  test("returns null when params.hooks is undefined", async () => {
    const ctx = makeContext();
    expect(await invokePostHook(ctx, result)).toBeNull();
    expect(ctx.callApi).not.toHaveBeenCalled();
  });

  test("returns null when params.hooks[interaction] is undefined", async () => {
    const ctx = makeContext({
      params: { hooks: { submit_edit: { post: "id" } } },
    });
    expect(await invokePostHook(ctx, result)).toBeNull();
    expect(ctx.callApi).not.toHaveBeenCalled();
  });

  test("returns null when params.hooks[interaction].post is undefined (only .pre declared)", async () => {
    const ctx = makeContext({
      params: { hooks: { approve: { pre: "pre-id" } } },
    });
    expect(await invokePostHook(ctx, result)).toBeNull();
    expect(ctx.callApi).not.toHaveBeenCalled();
  });
});

describe("invokePostHook — dispatch", () => {
  test("dispatches the pre-scoped hook id verbatim and payload includes result bag", async () => {
    const callApi = jest.fn(async () => ({ logged: true }));
    const ctx = makeContext({
      params: {
        // Pre-scoped by the build (_module.endpointId) — passed verbatim.
        hooks: { approve: { post: "workflows/onboarding-qualify-approve-post" } },
      },
      callApi,
    });

    const response = await invokePostHook(ctx, result);

    expect(response).toEqual({ logged: true });
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith({
      endpointId: "workflows/onboarding-qualify-approve-post",
      payload: expect.objectContaining({
        workflow_id: "W1",
        action_id: "A1",
        interaction: "approve",
      }),
    });
    const { payload } = callApi.mock.calls[0][0];
    expect(payload.result).toBe(result);
  });

  test("payload.result reflects empty tracker_fired", async () => {
    const callApi = jest.fn(async () => ({}));
    const ctx = makeContext({
      params: { hooks: { approve: { post: "h" } } },
      callApi,
    });
    const r = {
      action_ids: [],
      completed_groups: [],
      event_id: null,
      tracker_fired: [],
    };
    await invokePostHook(ctx, r);
    expect(callApi.mock.calls[0][0].payload.result).toEqual(r);
  });

  test("throw from callApi propagates unchanged", async () => {
    const callApi = jest.fn(async () => {
      throw new Error("post-hook boom");
    });
    const ctx = makeContext({
      params: { hooks: { approve: { post: "h" } } },
      callApi,
    });
    await expect(invokePostHook(ctx, result)).rejects.toThrow("post-hook boom");
  });

  test("successful response is returned verbatim", async () => {
    const response = { foo: "bar", extra: [1, 2] };
    const callApi = jest.fn(async () => response);
    const ctx = makeContext({
      params: { hooks: { approve: { post: "h" } } },
      callApi,
    });
    expect(await invokePostHook(ctx, result)).toBe(response);
  });
});
