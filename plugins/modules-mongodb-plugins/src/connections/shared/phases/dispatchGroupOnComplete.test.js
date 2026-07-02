import dispatchGroupOnComplete from "./dispatchGroupOnComplete.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// A completed-group dispatch entry: the group's workflow_type + id, paired with
// its committed workflow doc (the shape handleSubmit / runTrackerCascade build).
function entry({ workflow_type = "onboarding", id, workflowDoc } = {}) {
  return {
    workflow_id: workflowDoc?._id ?? "W1",
    workflow_type,
    id,
    on_complete: {},
    workflow: workflowDoc ?? {
      _id: "W1",
      workflow_type,
      entity: { id: "lead-42" },
    },
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
  test("no-op on an empty completed-groups list", async () => {
    const callApi = jest.fn();
    await dispatchGroupOnComplete(
      [],
      { onboarding: { "phase-1": "some-id" } },
      user,
      callApi,
    );
    expect(callApi).not.toHaveBeenCalled();
  });

  test("no-op when completedGroups is undefined", async () => {
    const callApi = jest.fn();
    await dispatchGroupOnComplete(undefined, {}, user, callApi);
    expect(callApi).not.toHaveBeenCalled();
  });

  test("skips a group whose type/id is absent from the id map (no on_complete)", async () => {
    const callApi = jest.fn();
    await dispatchGroupOnComplete(
      [entry({ id: "phase-2" })],
      // map only carries phase-1
      { onboarding: { "phase-1": "onboarding-group-phase-1-on-complete" } },
      user,
      callApi,
    );
    expect(callApi).not.toHaveBeenCalled();
  });

  test("skips when the whole workflow_type is absent from the id map", async () => {
    const callApi = jest.fn();
    await dispatchGroupOnComplete(
      [entry({ workflow_type: "renewal", id: "phase-1" })],
      { onboarding: { "phase-1": "ep" } },
      user,
      callApi,
    );
    expect(callApi).not.toHaveBeenCalled();
  });

  test("no-op when the id map is undefined", async () => {
    const callApi = jest.fn();
    await dispatchGroupOnComplete(
      [entry({ id: "phase-1" })],
      undefined,
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
  test("fires the type-resolved endpoint id with the group-completion payload", async () => {
    const callApi = jest.fn(async () => ({ notified: true }));
    const workflowDoc = {
      _id: "W1",
      workflow_type: "onboarding",
      entity: { id: "lead-42" },
    };
    await dispatchGroupOnComplete(
      [entry({ id: "phase-1", workflowDoc })],
      { onboarding: { "phase-1": "workflows/onboarding-group-phase-1-on-complete" } },
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
        context: { workflow: workflowDoc },
      },
    });
  });

  test("payload.context.workflow is the entry's OWN committed doc (parent for a parent-level group)", async () => {
    const callApi = jest.fn(async () => ({}));
    const parentDoc = {
      _id: "PARENT-1",
      workflow_type: "program",
      entity: { id: "program-7" },
    };
    await dispatchGroupOnComplete(
      [entry({ workflow_type: "program", id: "rollout", workflowDoc: parentDoc })],
      { program: { rollout: "workflows/program-group-rollout-on-complete" } },
      user,
      callApi,
    );
    const { payload } = callApi.mock.calls[0][0];
    expect(payload.workflow_id).toBe("PARENT-1");
    expect(payload.context.workflow.entity.id).toBe("program-7");
  });

  test("fires once per resolvable group across the originating + parent union, in order", async () => {
    const callApi = jest.fn(async () => ({}));
    await dispatchGroupOnComplete(
      [
        entry({ workflow_type: "onboarding", id: "phase-1" }), // originating
        entry({ workflow_type: "onboarding", id: "phase-2" }), // no endpoint
        entry({ workflow_type: "program", id: "rollout" }), // parent-level
      ],
      {
        onboarding: { "phase-1": "ep-onb-1" },
        program: { rollout: "ep-prog-rollout" },
      },
      user,
      callApi,
    );
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(callApi.mock.calls[0][0].endpointId).toBe("ep-onb-1");
    expect(callApi.mock.calls[1][0].endpointId).toBe("ep-prog-rollout");
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
        [entry({ id: "phase-1" })],
        { onboarding: { "phase-1": "ep" } },
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
        [entry({ id: "phase-1" }), entry({ id: "phase-3" })],
        { onboarding: { "phase-1": "ep-1", "phase-3": "ep-3" } },
        user,
        callApi,
      ),
    ).rejects.toThrow("boom");
    expect(callApi).toHaveBeenCalledTimes(1);
  });
});
