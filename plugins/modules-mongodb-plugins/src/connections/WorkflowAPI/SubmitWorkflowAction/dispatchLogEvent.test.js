import dispatchLogEvent, {
  buildDefaultLogEventPayload,
} from "./dispatchLogEvent.js";

const SPEC_TEMPLATE =
  "{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}";

function baseArgs(overrides = {}) {
  return {
    workflow: {
      _id: "W1",
      workflow_type: "onboarding",
      entity_id: "L1",
      entity_collection: "leads-collection",
    },
    action: { _id: "A1", type: "qualify", key: null },
    actionConfig: { kind: "form", access: { roles: ["account-manager"] } },
    interaction: "submit_edit",
    current_key: null,
    status_before: "action-required",
    status_after: "done",
    appName: "demo",
    ...overrides,
  };
}

describe("buildDefaultLogEventPayload", () => {
  test.each([
    "submit_edit",
    "not_required",
    "resolve_error",
    "approve",
    "request_changes",
  ])("type is action-%s for interaction %s", (interaction) => {
    const result = buildDefaultLogEventPayload(baseArgs({ interaction }));
    expect(result.type).toBe(`action-${interaction}`);
  });

  test("display is keyed by appName with the spec Nunjucks template", () => {
    const result = buildDefaultLogEventPayload(baseArgs({ appName: "demo" }));
    expect(result.display).toEqual({
      demo: {
        title: {
          _nunjucks: {
            template: SPEC_TEMPLATE,
            on: { user: true, action_type: true, status_after: true },
          },
        },
      },
    });
  });

  test("throws when appName is missing", () => {
    expect(() =>
      buildDefaultLogEventPayload(baseArgs({ appName: undefined })),
    ).toThrow(/app_name plumbing/);
  });

  test("throws when appName is an empty string", () => {
    expect(() =>
      buildDefaultLogEventPayload(baseArgs({ appName: "" })),
    ).toThrow(/app_name plumbing/);
  });

  test("references derives leads_ids from leads-collection", () => {
    const result = buildDefaultLogEventPayload(baseArgs());
    expect(result.references).toEqual({
      workflow_ids: ["W1"],
      action_ids: ["A1"],
      leads_ids: ["L1"],
    });
  });

  test("references derives tickets_ids from tickets-collection", () => {
    const result = buildDefaultLogEventPayload(
      baseArgs({
        workflow: {
          _id: "W2",
          workflow_type: "ticket-handling",
          entity_id: "T1",
          entity_collection: "tickets-collection",
        },
        action: { _id: "A2", type: "triage", key: null },
      }),
    );
    expect(result.references).toEqual({
      workflow_ids: ["W2"],
      action_ids: ["A2"],
      tickets_ids: ["T1"],
    });
  });

  test("metadata carries all six fields", () => {
    const result = buildDefaultLogEventPayload(
      baseArgs({
        interaction: "approve",
        current_key: "device-1",
        status_before: "in-review",
        status_after: "done",
      }),
    );
    expect(result.metadata).toEqual({
      action_type: "qualify",
      workflow_type: "onboarding",
      interaction: "approve",
      current_key: "device-1",
      status_before: "in-review",
      status_after: "done",
    });
  });

  test("metadata defaults current_key and status_before to null", () => {
    const result = buildDefaultLogEventPayload(
      baseArgs({ current_key: undefined, status_before: undefined }),
    );
    expect(result.metadata.current_key).toBeNull();
    expect(result.metadata.status_before).toBeNull();
  });

  test("status_before reflects the pre-step-4 stage passed in", () => {
    const result = buildDefaultLogEventPayload(
      baseArgs({ status_before: "action-required" }),
    );
    expect(result.metadata.status_before).toBe("action-required");
  });
});

describe("dispatchLogEvent", () => {
  function makeContext({ callApi, connection, eventId } = {}) {
    return {
      workflow: {
        _id: "W1",
        workflow_type: "onboarding",
        entity_id: "L1",
        entity_collection: "leads-collection",
      },
      action: { _id: "A1", type: "qualify", key: null },
      actionConfig: { kind: "form", access: { roles: ["account-manager"] } },
      user: { id: "u1", profile: { name: "Test User" }, roles: ["admin"] },
      eventId: eventId ?? "EV-1",
      connection: connection ?? { app_name: "demo" },
      callApi:
        callApi ??
        jest.fn(async () => ({
          success: true,
          response: { eventId: "EV-1" },
        })),
    };
  }

  const inputBag = {
    interaction: "submit_edit",
    current_key: null,
    status_before: "action-required",
    status_after: "done",
  };

  test("calls callApi with the new-event endpoint reference", async () => {
    const callApi = jest.fn(async () => ({ success: true, response: {} }));
    const context = makeContext({ callApi });

    await dispatchLogEvent(context, inputBag);

    expect(callApi).toHaveBeenCalledTimes(1);
    const [endpoint] = callApi.mock.calls[0];
    expect(endpoint).toEqual({ id: "new-event", module: "events" });
  });

  test("passes _id: context.eventId on the payload alongside the assembled bag", async () => {
    const callApi = jest.fn(async () => ({ success: true, response: {} }));
    const context = makeContext({ callApi, eventId: "EV-99" });

    await dispatchLogEvent(context, inputBag);

    const [, payload] = callApi.mock.calls[0];
    expect(payload._id).toBe("EV-99");
    expect(payload.type).toBe("action-submit_edit");
    expect(payload.display).toBeDefined();
    expect(payload.references).toBeDefined();
    expect(payload.metadata).toBeDefined();
  });

  test("passes user via options", async () => {
    const callApi = jest.fn(async () => ({ success: true, response: {} }));
    const context = makeContext({ callApi });

    await dispatchLogEvent(context, inputBag);

    const [, , options] = callApi.mock.calls[0];
    expect(options).toEqual({ user: context.user });
  });

  test("reads appName from context.connection.app_name", async () => {
    const callApi = jest.fn(async () => ({ success: true, response: {} }));
    const context = makeContext({
      callApi,
      connection: { app_name: "fixture-app" },
    });

    await dispatchLogEvent(context, inputBag);

    const [, payload] = callApi.mock.calls[0];
    expect(payload.display["fixture-app"]).toBeDefined();
  });

  test("returns context.eventId, ignoring callApi response eventId", async () => {
    const callApi = jest.fn(async () => ({
      success: true,
      response: { eventId: "OTHER-ID" },
    }));
    const context = makeContext({ callApi, eventId: "EV-CORRECT" });

    const result = await dispatchLogEvent(context, inputBag);

    expect(result).toBe("EV-CORRECT");
  });

  test("throws with step + cause on callApi failure", async () => {
    const callApi = jest.fn(async () => ({
      success: false,
      error: { message: "insert failed" },
    }));
    const context = makeContext({ callApi });

    await expect(dispatchLogEvent(context, inputBag)).rejects.toMatchObject({
      message: expect.stringMatching(/new-event failed: insert failed/),
      step: "dispatch-log-event",
      cause: { message: "insert failed" },
    });
  });
});
