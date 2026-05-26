import invokePreHook from "./invokePreHook.js";

function makeContext(overrides = {}) {
  return {
    params: {
      action_id: "A1",
      interaction: "submit_edit",
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

describe("invokePreHook — skip cases", () => {
  test("returns null when params.hooks is undefined", async () => {
    const ctx = makeContext();
    expect(await invokePreHook(ctx)).toBeNull();
    expect(ctx.callApi).not.toHaveBeenCalled();
  });

  test("returns null when params.hooks[interaction] is undefined", async () => {
    const ctx = makeContext({
      params: { hooks: { approve: { pre: "id" } } },
    });
    expect(await invokePreHook(ctx)).toBeNull();
    expect(ctx.callApi).not.toHaveBeenCalled();
  });

  test("returns null when params.hooks[interaction].pre is undefined (only .post declared)", async () => {
    const ctx = makeContext({
      params: { hooks: { submit_edit: { post: "post-id" } } },
    });
    expect(await invokePreHook(ctx)).toBeNull();
    expect(ctx.callApi).not.toHaveBeenCalled();
  });
});

describe("invokePreHook — dispatch", () => {
  test("dispatches via { id, module: 'workflows' } with the full payload + user option", async () => {
    const callApi = jest.fn(async () => ({ status: "done" }));
    const ctx = makeContext({
      params: {
        hooks: {
          submit_edit: { pre: "update-action-qualify-submit_edit-pre" },
        },
        comment: "hi",
      },
      callApi,
    });

    const response = await invokePreHook(ctx);

    expect(response).toEqual({ status: "done" });
    expect(callApi).toHaveBeenCalledTimes(1);
    const [endpoint, payload, options] = callApi.mock.calls[0];
    expect(endpoint).toEqual({
      id: "update-action-qualify-submit_edit-pre",
      module: "workflows",
    });
    expect(payload).toMatchObject({
      workflow_id: "W1",
      workflow_type: "onboarding",
      action_id: "A1",
      action_type: "qualify",
      current_key: null,
      interaction: "submit_edit",
      current_status: null,
      comment: "hi",
      user: { id: "u1", profile: { name: "Sam" }, roles: ["account-manager"] },
    });
    expect(payload.context.workflow).toBe(ctx.workflow);
    expect(payload.context.action).toBe(ctx.action);
    expect(options).toEqual({ user: ctx.user });
  });

  test("payload current_status is null when not provided", async () => {
    const callApi = jest.fn(async () => ({}));
    const ctx = makeContext({
      params: { hooks: { submit_edit: { pre: "h" } } },
      callApi,
    });
    delete ctx.params.current_status;
    await invokePreHook(ctx);
    expect(callApi.mock.calls[0][1].current_status).toBeNull();
  });

  test("payload current_status passes through for task submit_edit", async () => {
    const callApi = jest.fn(async () => ({}));
    const ctx = makeContext({
      params: {
        hooks: { submit_edit: { pre: "h" } },
        current_status: "in-progress",
      },
      callApi,
    });
    await invokePreHook(ctx);
    expect(callApi.mock.calls[0][1].current_status).toBe("in-progress");
  });

  test("payload comment falls through params.comment ?? null", async () => {
    const callApi = jest.fn(async () => ({}));
    const ctx = makeContext({
      params: { hooks: { submit_edit: { pre: "h" } } },
      callApi,
    });
    delete ctx.params.comment;
    await invokePreHook(ctx);
    expect(callApi.mock.calls[0][1].comment).toBeNull();
  });

  test("generic throw from callApi propagates unchanged (no try/catch)", async () => {
    const callApi = jest.fn(async () => {
      throw new Error("boom");
    });
    const ctx = makeContext({
      params: { hooks: { submit_edit: { pre: "h" } } },
      callApi,
    });
    await expect(invokePreHook(ctx)).rejects.toThrow("boom");
  });

  test("UserError(isReject: true) propagates unchanged", async () => {
    class UserError extends Error {
      constructor(message, opts) {
        super(message);
        this.name = "UserError";
        this.isReject = opts?.isReject ?? false;
      }
    }
    const reject = new UserError("rejected by hook", { isReject: true });
    const callApi = jest.fn(async () => {
      throw reject;
    });
    const ctx = makeContext({
      params: { hooks: { submit_edit: { pre: "h" } } },
      callApi,
    });
    await expect(invokePreHook(ctx)).rejects.toBe(reject);
  });

  test("successful response is returned verbatim (no normalisation)", async () => {
    const response = { status: "done", actions: [{ type: "x" }], foo: "bar" };
    const callApi = jest.fn(async () => response);
    const ctx = makeContext({
      params: { hooks: { submit_edit: { pre: "h" } } },
      callApi,
    });
    expect(await invokePreHook(ctx)).toBe(response);
  });
});
