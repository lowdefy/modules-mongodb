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

  test("metadata.comment is set when comment is a non-empty string", () => {
    const result = buildDefaultLogEventPayload(
      baseArgs({ comment: "looks good" }),
    );
    expect(result.metadata.comment).toBe("looks good");
  });

  test("metadata.comment is omitted when comment is null", () => {
    const result = buildDefaultLogEventPayload(baseArgs({ comment: null }));
    expect(result.metadata).not.toHaveProperty("comment");
  });

  test("metadata.comment is omitted when comment is an empty string", () => {
    const result = buildDefaultLogEventPayload(baseArgs({ comment: "" }));
    expect(result.metadata).not.toHaveProperty("comment");
  });

  test("metadata.comment is omitted when comment is undefined", () => {
    const result = buildDefaultLogEventPayload(
      baseArgs({ comment: undefined }),
    );
    expect(result.metadata).not.toHaveProperty("comment");
  });
});

describe("dispatchLogEvent", () => {
  // Shipped contract: callApi({ endpointId, payload }) resolves new-event's
  // :return value ({ eventId }) and throws on failure.
  function makeContext({ callApi, eventId } = {}) {
    return {
      user: { id: "u1", profile: { name: "Test User" }, roles: ["admin"] },
      eventId: eventId ?? "EV-1",
      connection: { endpoints: { new_event: "events/new-event" } },
      callApi: callApi ?? jest.fn(async () => ({ eventId: "EV-1" })),
    };
  }

  const samplePayload = {
    type: "action-submit_edit",
    display: { demo: { title: { _nunjucks: { template: "t" } } } },
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

  test("calls callApi with the pre-scoped new-event endpoint id", async () => {
    const callApi = jest.fn(async () => ({ eventId: "EV-1" }));
    const context = makeContext({ callApi });

    await dispatchLogEvent(context, samplePayload);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith({
      endpointId: "events/new-event",
      payload: expect.objectContaining({ _id: "EV-1" }),
    });
  });

  test("passes _id: context.eventId on the payload alongside the assembled bag", async () => {
    const callApi = jest.fn(async () => ({ eventId: "EV-99" }));
    const context = makeContext({ callApi, eventId: "EV-99" });

    await dispatchLogEvent(context, samplePayload);

    const { payload } = callApi.mock.calls[0][0];
    expect(payload._id).toBe("EV-99");
    expect(payload.type).toBe("action-submit_edit");
    expect(payload.display).toEqual(samplePayload.display);
    expect(payload.references).toEqual(samplePayload.references);
    expect(payload.metadata).toEqual(samplePayload.metadata);
  });

  test("returns context.eventId, ignoring callApi response eventId", async () => {
    const callApi = jest.fn(async () => ({ eventId: "OTHER-ID" }));
    const context = makeContext({ callApi, eventId: "EV-CORRECT" });

    const result = await dispatchLogEvent(context, samplePayload);

    expect(result).toBe("EV-CORRECT");
  });

  test("a callApi throw propagates raw to the request layer", async () => {
    const boom = new Error("insert failed");
    const callApi = jest.fn(async () => {
      throw boom;
    });
    const context = makeContext({ callApi });

    await expect(dispatchLogEvent(context, samplePayload)).rejects.toBe(boom);
  });

  test("passes through the payload unchanged (no mutation, no rebuild)", async () => {
    const callApi = jest.fn(async () => ({ eventId: "EV-1" }));
    const context = makeContext({ callApi });

    const customised = {
      ...samplePayload,
      metadata: { ...samplePayload.metadata, comment: "from-handler" },
    };
    await dispatchLogEvent(context, customised);

    const { payload } = callApi.mock.calls[0][0];
    expect(payload.metadata.comment).toBe("from-handler");
  });
});
