import planWorkflowRecompute from "./planWorkflowRecompute.js";

const now = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1" },
};
const event_id = "event-1";

const workflowConfig = {
  type: "onboarding",
  action_groups: [{ id: "phase-1" }, { id: "phase-2" }],
  actions: [
    { type: "qualify", kind: "form", action_group: "phase-1" },
    { type: "kickoff", kind: "form", action_group: "phase-2" },
  ],
};

function makeWorkflow(overrides = {}) {
  return {
    _id: "wf-1",
    workflow_type: "onboarding",
    entity_id: "lead-1",
    entity_collection: "leads-collection",
    status: [{ stage: "active", created: new Date("2026-05-19T00:00:00Z") }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: { qualify: { score: 7 } },
    updated: {
      timestamp: new Date("2026-05-19T00:00:00Z"),
      user: { id: "u0" },
    },
    ...overrides,
  };
}

function makeAction({ type, stage, action_group = null }) {
  return {
    _id: `a-${type}`,
    workflow_id: "wf-1",
    type,
    action_group,
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
  };
}

function makeLoadedState(overrides = {}) {
  return { workflow: makeWorkflow(), workflowConfig, ...overrides };
}

test("recomputes summary and groups against planned action states", () => {
  const plannedActions = [
    makeAction({ type: "qualify", stage: "done", action_group: "phase-1" }),
    makeAction({
      type: "kickoff",
      stage: "action-required",
      action_group: "phase-2",
    }),
  ];

  const doc = planWorkflowRecompute({
    loadedState: makeLoadedState(),
    plannedActions,
    event_id,
    now,
  });

  expect(doc.summary).toEqual({ done: 1, not_required: 0, total: 2 });
  expect(doc.groups).toEqual([
    {
      id: "phase-1",
      status: "done",
      summary: { done: 1, not_required: 0, total: 1 },
    },
    {
      id: "phase-2",
      status: "in-progress",
      summary: { done: 0, not_required: 0, total: 1 },
    },
  ]);
});

test("groups reflect an unblock-style planned state (blocked → action-required flips the label)", () => {
  // Post-fixpoint planned state: kickoff was loaded `blocked` but the plan
  // holds `action-required` — the final recompute must read the planned stage.
  const plannedActions = [
    makeAction({ type: "qualify", stage: "done", action_group: "phase-1" }),
    makeAction({
      type: "kickoff",
      stage: "action-required",
      action_group: "phase-1",
    }),
  ];

  const doc = planWorkflowRecompute({
    loadedState: makeLoadedState(),
    plannedActions,
    event_id,
    now,
  });

  expect(doc.groups.find((g) => g.id === "phase-1").status).toBe(
    "in-progress",
  );
});

test("all actions terminal → pushes completed at status[0] with event_id + created stamp", () => {
  const plannedActions = [
    makeAction({ type: "qualify", stage: "done", action_group: "phase-1" }),
    makeAction({
      type: "kickoff",
      stage: "not-required",
      action_group: "phase-2",
    }),
  ];

  const doc = planWorkflowRecompute({
    loadedState: makeLoadedState(),
    plannedActions,
    event_id,
    now,
  });

  expect(doc.status).toHaveLength(2);
  expect(doc.status[0]).toEqual({ stage: "completed", event_id, created: now });
  expect(doc.status[1].stage).toBe("active");
});

test("one non-terminal action → no completed push", () => {
  const plannedActions = [
    makeAction({ type: "qualify", stage: "done", action_group: "phase-1" }),
    makeAction({
      type: "kickoff",
      stage: "in-review",
      action_group: "phase-2",
    }),
  ];

  const doc = planWorkflowRecompute({
    loadedState: makeLoadedState(),
    plannedActions,
    event_id,
    now,
  });

  expect(doc.status).toHaveLength(1);
  expect(doc.status[0].stage).toBe("active");
});

test("empty workflow (total: 0) never auto-completes", () => {
  const doc = planWorkflowRecompute({
    loadedState: makeLoadedState(),
    plannedActions: [],
    event_id,
    now,
  });

  expect(doc.summary).toEqual({ done: 0, not_required: 0, total: 0 });
  expect(doc.status).toHaveLength(1);
  expect(doc.status[0].stage).toBe("active");
});

test("already-completed workflow with all terminal actions → no second completed push", () => {
  const loadedState = makeLoadedState({
    workflow: makeWorkflow({
      status: [
        { stage: "completed", created: new Date("2026-05-19T12:00:00Z") },
        { stage: "active", created: new Date("2026-05-19T00:00:00Z") },
      ],
    }),
  });
  const plannedActions = [
    makeAction({ type: "qualify", stage: "done", action_group: "phase-1" }),
    makeAction({ type: "kickoff", stage: "done", action_group: "phase-2" }),
  ];

  const doc = planWorkflowRecompute({
    loadedState,
    plannedActions,
    event_id,
    now,
  });

  expect(doc.status).toHaveLength(2);
  expect(doc.status[0].stage).toBe("completed");
});

test("already-cancelled workflow with all terminal actions → no completed push (mutual exclusion)", () => {
  const loadedState = makeLoadedState({
    workflow: makeWorkflow({
      status: [
        { stage: "cancelled", created: new Date("2026-05-19T12:00:00Z") },
        { stage: "active", created: new Date("2026-05-19T00:00:00Z") },
      ],
    }),
  });
  const plannedActions = [
    makeAction({
      type: "qualify",
      stage: "not-required",
      action_group: "phase-1",
    }),
    makeAction({
      type: "kickoff",
      stage: "not-required",
      action_group: "phase-2",
    }),
  ];

  const doc = planWorkflowRecompute({
    loadedState,
    plannedActions,
    event_id,
    now,
  });

  expect(doc.status).toHaveLength(2);
  expect(doc.status[0].stage).toBe("cancelled");
  expect(doc.status.some((s) => s.stage === "completed")).toBe(false);
});

describe("lifecyclePush", () => {
  test("non-terminal actions: pushes exactly the declared entry, never the auto completed", () => {
    // Close's required_after_close survivor case — the action set is
    // non-terminal but the declared push lands regardless (skip-entirely).
    const plannedActions = [
      makeAction({ type: "qualify", stage: "done", action_group: "phase-1" }),
      makeAction({
        type: "kickoff",
        stage: "action-required",
        action_group: "phase-2",
      }),
    ];

    const doc = planWorkflowRecompute({
      loadedState: makeLoadedState(),
      plannedActions,
      lifecyclePush: { stage: "cancelled", reason: "duplicate record" },
      event_id,
      now,
    });

    expect(doc.status).toHaveLength(2);
    expect(doc.status[0]).toEqual({
      stage: "cancelled",
      event_id,
      created: now,
      reason: "duplicate record",
    });
    expect(doc.status[1].stage).toBe("active");
    expect(doc.status.some((s) => s.stage === "completed")).toBe(false);
  });

  test("all-terminal actions: the auto-complete is skipped entirely — exactly one new entry", () => {
    // Cancel's sweep makes everything terminal; without the skip the auto
    // completed would land under the declared cancelled.
    const plannedActions = [
      makeAction({
        type: "qualify",
        stage: "not-required",
        action_group: "phase-1",
      }),
      makeAction({
        type: "kickoff",
        stage: "not-required",
        action_group: "phase-2",
      }),
    ];

    const doc = planWorkflowRecompute({
      loadedState: makeLoadedState(),
      plannedActions,
      lifecyclePush: { stage: "cancelled", reason: "no longer needed" },
      event_id,
      now,
    });

    expect(doc.status).toHaveLength(2);
    expect(doc.status[0].stage).toBe("cancelled");
    expect(doc.status.some((s) => s.stage === "completed")).toBe(false);
  });

  test("Close's completed push lands once, even with all actions terminal", () => {
    const plannedActions = [
      makeAction({ type: "qualify", stage: "done", action_group: "phase-1" }),
      makeAction({
        type: "kickoff",
        stage: "not-required",
        action_group: "phase-2",
      }),
    ];

    const doc = planWorkflowRecompute({
      loadedState: makeLoadedState(),
      plannedActions,
      lifecyclePush: { stage: "completed" },
      event_id,
      now,
    });

    expect(doc.status).toHaveLength(2);
    expect(doc.status.filter((s) => s.stage === "completed")).toHaveLength(1);
    expect(doc.status[0]).toEqual({ stage: "completed", event_id, created: now });
  });

  test("omitted reason → no reason key on the entry", () => {
    const doc = planWorkflowRecompute({
      loadedState: makeLoadedState(),
      plannedActions: [],
      lifecyclePush: { stage: "cancelled" },
      event_id,
      now,
    });

    expect(doc.status[0]).toEqual({ stage: "cancelled", event_id, created: now });
    expect("reason" in doc.status[0]).toBe(false);
  });
});

test("composes the whole doc: passthrough fields survive, updated: now, formData lands as form_data", () => {
  const loadedState = makeLoadedState();
  const plannedActions = [
    makeAction({ type: "qualify", stage: "done", action_group: "phase-1" }),
  ];
  const formData = { qualify: { score: 9, notes: "ok" } };

  const doc = planWorkflowRecompute({
    loadedState,
    plannedActions,
    formData,
    event_id,
    now,
  });

  expect(doc._id).toBe("wf-1");
  expect(doc.workflow_type).toBe("onboarding");
  expect(doc.entity_id).toBe("lead-1");
  expect(doc.entity_collection).toBe("leads-collection");
  // CAS soundness (D15): every commit must advance the stored
  // updated.timestamp — never carry the loaded `updated` through.
  expect(doc.updated).toBe(now);
  expect(doc.updated.timestamp).not.toEqual(
    loadedState.workflow.updated.timestamp,
  );
  expect(doc.form_data).toBe(formData);
});

test("omitted formData carries the loaded form_data through unchanged", () => {
  const loadedState = makeLoadedState();

  const doc = planWorkflowRecompute({
    loadedState,
    plannedActions: [],
    event_id,
    now,
  });

  expect(doc.form_data).toEqual({ qualify: { score: 7 } });
});

test("does not mutate loadedState", () => {
  const loadedState = makeLoadedState();
  const plannedActions = [
    makeAction({ type: "qualify", stage: "done", action_group: "phase-1" }),
    makeAction({
      type: "kickoff",
      stage: "not-required",
      action_group: "phase-2",
    }),
  ];
  const snapshot = structuredClone(loadedState);

  planWorkflowRecompute({ loadedState, plannedActions, event_id, now });

  expect(loadedState).toEqual(snapshot);
  // The completed push must not have unshifted onto the loaded status array.
  expect(loadedState.workflow.status).toHaveLength(1);
});
