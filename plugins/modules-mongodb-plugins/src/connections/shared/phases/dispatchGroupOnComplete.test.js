import dispatchGroupOnComplete from "./dispatchGroupOnComplete.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makePlan(overrides = {}) {
  return {
    workflow: {
      doc: overrides.workflowDoc ?? {
        _id: "W1",
        workflow_type: "onboarding",
        entity: { id: "lead-42" },
      },
      operation: "update",
      changeLog: { before: null, after: {} },
    },
    completedGroups: overrides.completedGroups ?? [],
  };
}

function makeParams(overrides = {}) {
  return {
    action_id: "A1",
    signal: "approve",
    group_on_complete: undefined,
    ...overrides,
  };
}

const user = {
  id: "u1",
  profile: { name: "Sam" },
  roles: ["account-manager"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Skip cases
// ─────────────────────────────────────────────────────────────────────────────

describe("dispatchGroupOnComplete — skip cases", () => {
  test("no-op when completedGroups is empty (cancel/close set it [])", async () => {
    const callApi = jest.fn();
    await dispatchGroupOnComplete(
      makePlan({ completedGroups: [] }),
      makeParams({ group_on_complete: { "phase-1": "some-id" } }),
      user,
      callApi,
    );
    expect(callApi).not.toHaveBeenCalled();
  });

  test("no-op when completedGroups is absent", async () => {
    const callApi = jest.fn();
    const plan = makePlan();
    delete plan.completedGroups;
    await dispatchGroupOnComplete(plan, makeParams(), user, callApi);
    expect(callApi).not.toHaveBeenCalled();
  });

  test("skips a completed group that declares no on_complete (absent from the id map)", async () => {
    const callApi = jest.fn();
    await dispatchGroupOnComplete(
      makePlan({
        completedGroups: [{ workflow_id: "W1", id: "phase-2", on_complete: null }],
      }),
      // id map only carries phase-1 — phase-2 has no on_complete endpoint.
      makeParams({
        group_on_complete: {
          "phase-1": "workflows/onboarding-group-phase-1-on-complete",
        },
      }),
      user,
      callApi,
    );
    expect(callApi).not.toHaveBeenCalled();
  });

  test("no-op when params.group_on_complete is undefined even if a group completed", async () => {
    const callApi = jest.fn();
    await dispatchGroupOnComplete(
      makePlan({
        completedGroups: [{ workflow_id: "W1", id: "phase-1", on_complete: {} }],
      }),
      makeParams({ group_on_complete: undefined }),
      user,
      callApi,
    );
    expect(callApi).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe("dispatchGroupOnComplete — dispatch", () => {
  test("fires the pre-scoped endpoint id with the group-completion payload", async () => {
    const callApi = jest.fn(async () => ({ notified: true }));
    const plan = makePlan({
      completedGroups: [{ workflow_id: "W1", id: "phase-1", on_complete: {} }],
    });
    await dispatchGroupOnComplete(
      plan,
      makeParams({
        group_on_complete: {
          "phase-1": "workflows/onboarding-group-phase-1-on-complete",
        },
      }),
      user,
      callApi,
    );

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith({
      endpointId: "workflows/onboarding-group-phase-1-on-complete",
      payload: {
        workflow_id: "W1",
        workflow_type: "onboarding",
        group_id: "phase-1",
        user: {
          id: "u1",
          profile: { name: "Sam" },
          roles: ["account-manager"],
        },
        context: { workflow: plan.workflow.doc },
      },
    });
  });

  test("payload.context.workflow is the committed workflow doc (reachable as context.workflow.entity.id)", async () => {
    const callApi = jest.fn(async () => ({}));
    await dispatchGroupOnComplete(
      makePlan({
        completedGroups: [{ workflow_id: "W1", id: "phase-1", on_complete: {} }],
      }),
      makeParams({ group_on_complete: { "phase-1": "h" } }),
      user,
      callApi,
    );
    const { payload } = callApi.mock.calls[0][0];
    expect(payload.context.workflow.entity.id).toBe("lead-42");
  });

  test("fires once per completed group that has an on_complete, in order", async () => {
    const callApi = jest.fn(async () => ({}));
    await dispatchGroupOnComplete(
      makePlan({
        completedGroups: [
          { workflow_id: "W1", id: "phase-1", on_complete: {} },
          { workflow_id: "W1", id: "phase-2", on_complete: null }, // no endpoint
          { workflow_id: "W1", id: "phase-3", on_complete: {} },
        ],
      }),
      makeParams({
        group_on_complete: {
          "phase-1": "ep-1",
          "phase-3": "ep-3",
        },
      }),
      user,
      callApi,
    );
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(callApi.mock.calls[0][0].endpointId).toBe("ep-1");
    expect(callApi.mock.calls[1][0].endpointId).toBe("ep-3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error propagation (post-commit, idempotent contract — same as post-hook)
// ─────────────────────────────────────────────────────────────────────────────

describe("dispatchGroupOnComplete — error propagation", () => {
  test("throw from callApi propagates unchanged (no try/catch)", async () => {
    const callApi = jest.fn(async () => {
      throw new Error("on_complete boom");
    });
    await expect(
      dispatchGroupOnComplete(
        makePlan({
          completedGroups: [{ workflow_id: "W1", id: "phase-1", on_complete: {} }],
        }),
        makeParams({ group_on_complete: { "phase-1": "h" } }),
        user,
        callApi,
      ),
    ).rejects.toThrow("on_complete boom");
  });

  test("a throw on the first group short-circuits later groups", async () => {
    const callApi = jest.fn(async () => {
      throw new Error("boom");
    });
    await expect(
      dispatchGroupOnComplete(
        makePlan({
          completedGroups: [
            { workflow_id: "W1", id: "phase-1", on_complete: {} },
            { workflow_id: "W1", id: "phase-3", on_complete: {} },
          ],
        }),
        makeParams({ group_on_complete: { "phase-1": "ep-1", "phase-3": "ep-3" } }),
        user,
        callApi,
      ),
    ).rejects.toThrow("boom");
    // Sequential await — the second group never dispatches.
    expect(callApi).toHaveBeenCalledTimes(1);
  });
});
