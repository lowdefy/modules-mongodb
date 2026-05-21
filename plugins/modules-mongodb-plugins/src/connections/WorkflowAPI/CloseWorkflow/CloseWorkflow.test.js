import inMemoryMongo from "../../shared/inMemoryMongo.js";
import CloseWorkflow from "./CloseWorkflow.js";
import WorkflowAPI from "../WorkflowAPI.js";

const actionsEnum = {
  "not-required": { priority: 0 },
  done: { priority: 3 },
  "in-review": { priority: 4 },
  "changes-required": { priority: 5 },
  "action-required": { priority: 6 },
  blocked: { priority: 7 },
  error: { priority: 8 },
};

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1" },
};

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
});

function makeLowdefyContext({ workflowsConfig, request }) {
  return {
    blockId: "test-block",
    connection: {
      databaseUri: mongo.uri,
      workflowsConfig,
      actionsEnum,
      changeStamp,
    },
    connectionId: "test-conn",
    pageId: "test-page",
    requestId: "test-req",
    request,
  };
}

async function seedWorkflow({
  _id = "wf-1",
  stage = "active",
  parent_action_id = null,
  workflow_type = "onboarding",
} = {}) {
  const doc = {
    _id,
    workflow_type,
    entity_id: "lead-1",
    entity_collection: "leads-collection",
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  };
  if (parent_action_id != null) doc.parent_action_id = parent_action_id;
  await mongo.db.collection("workflows").insertOne(doc);
}

async function seedAction({
  _id,
  type,
  action_group = null,
  stage = "action-required",
  workflow_id = "wf-1",
  kind = "task",
  key = null,
}) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    type,
    kind,
    key,
    action_group,
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
  });
}

const baseConfig = {
  type: "onboarding",
  entity_collection: "leads-collection",
  action_groups: [{ id: "phase-1" }, { id: "phase-2" }],
  actions: [
    { type: "qualify", kind: "task", action_group: "phase-1" },
    { type: "kickoff", kind: "task", action_group: "phase-2" },
  ],
};

// ===========================================================================
// Task 1 — Scaffold & registration
// ===========================================================================

test("Task 1: throws when payload is missing workflow_id", async () => {
  await expect(
    CloseWorkflow(
      makeLowdefyContext({
        workflowsConfig: [],
        request: {},
      }),
    ),
  ).rejects.toThrow("CloseWorkflow: workflow_id is required");
});

test("Task 1: registered on WorkflowAPI.requests", () => {
  expect(WorkflowAPI.requests.CloseWorkflow).toBe(CloseWorkflow);
});

// ===========================================================================
// Task 2 — Payload + stage gate
// ===========================================================================

test("Task 2: throws when workflow does not exist", async () => {
  await expect(
    CloseWorkflow(
      makeLowdefyContext({
        workflowsConfig: [baseConfig],
        request: { workflow_id: "missing-wf" },
      }),
    ),
  ).rejects.toThrow("CloseWorkflow: workflow missing-wf not found");
});

test("Task 2: already-completed workflow is a silent no-op (returns empty shape, no writes)", async () => {
  await seedWorkflow({ stage: "completed" });

  const result = await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  expect(result).toEqual({
    action_ids: [],
    event_id: null,
    tracker_fired: [],
  });
  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  // Original status array length 1 — no extra push.
  expect(wf.status).toHaveLength(1);
  expect(wf.status[0].stage).toBe("completed");
});

test("Task 2: already-cancelled workflow rejects", async () => {
  await seedWorkflow({ stage: "cancelled" });

  await expect(
    CloseWorkflow(
      makeLowdefyContext({
        workflowsConfig: [baseConfig],
        request: { workflow_id: "wf-1" },
      }),
    ),
  ).rejects.toThrow(
    "CloseWorkflow: workflow wf-1 is cancelled; cannot close",
  );
});

test("Task 2: active workflow proceeds (does not throw)", async () => {
  await seedWorkflow();

  await expect(
    CloseWorkflow(
      makeLowdefyContext({
        workflowsConfig: [baseConfig],
        request: { workflow_id: "wf-1" },
      }),
    ),
  ).resolves.toBeDefined();
});

// ===========================================================================
// Task 3 — Status push + RESERVED_WORKFLOW_KEYS reference defense
// ===========================================================================

test("Task 3: pushes completed entry at status[0] preserving previous active entry", async () => {
  await seedWorkflow();

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status[0].stage).toBe("completed");
  expect(wf.status[0].created).toEqual(changeStamp);
  expect(wf.status[1].stage).toBe("active");
});

test("Task 3: reason propagated when present in payload", async () => {
  await seedWorkflow();

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1", reason: "lead went cold" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status[0].reason).toBe("lead went cold");
});

test("Task 3: reason omitted when not provided (no empty/null field)", async () => {
  await seedWorkflow();

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect("reason" in wf.status[0]).toBe(false);
});

test("Task 3: references spread onto the workflow doc", async () => {
  await seedWorkflow();

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: {
        workflow_id: "wf-1",
        references: { company_ids: ["c1"], region_ids: ["r1"] },
      },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.company_ids).toEqual(["c1"]);
  expect(wf.region_ids).toEqual(["r1"]);
});

test("Task 3: reserved-key collision blocked (references.status / references.summary ignored)", async () => {
  await seedWorkflow();

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: {
        workflow_id: "wf-1",
        references: {
          status: [{ stage: "injected" }],
          summary: { hax: true },
        },
      },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  // Real status push lands, not the injected one.
  expect(wf.status[0].stage).toBe("completed");
  // Summary is recomputed (Task 5) — never the injected payload.
  expect(wf.summary).toEqual({ done: 0, not_required: 0, total: 0 });
});

test("Task 3: workflow doc's updated reflects the change stamp", async () => {
  await seedWorkflow();

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.updated).toEqual(changeStamp);
});

// ===========================================================================
// Task 4 — Conditional action sweep
// ===========================================================================

test("Task 4: blanket sweep of non-terminal actions when no required_after_close flags set", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "kickoff", action_group: "phase-2" });
  await seedAction({
    _id: "a3",
    type: "qualify",
    action_group: "phase-1",
    stage: "done",
  });

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const a1 = await mongo.db.collection("actions").findOne({ _id: "a1" });
  const a2 = await mongo.db.collection("actions").findOne({ _id: "a2" });
  const a3 = await mongo.db.collection("actions").findOne({ _id: "a3" });

  expect(a1.status[0].stage).toBe("not-required");
  expect(a2.status[0].stage).toBe("not-required");
  // done untouched
  expect(a3.status).toHaveLength(1);
  expect(a3.status[0].stage).toBe("done");
});

test("Task 4: required_after_close: true action survives close when non-blocked", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });

  const configWithFlag = {
    ...baseConfig,
    actions: [
      {
        type: "qualify",
        kind: "task",
        action_group: "phase-1",
        required_after_close: true,
      },
      { type: "kickoff", kind: "task", action_group: "phase-2" },
    ],
  };

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [configWithFlag],
      request: { workflow_id: "wf-1" },
    }),
  );

  const a1 = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(a1.status).toHaveLength(1);
  expect(a1.status[0].stage).toBe("action-required");
});

test("Task 4: required_after_close: true + blocked → still swept (blocked-action exception)", async () => {
  await seedWorkflow();
  await seedAction({
    _id: "a1",
    type: "qualify",
    action_group: "phase-1",
    stage: "blocked",
  });

  const configWithFlag = {
    ...baseConfig,
    actions: [
      {
        type: "qualify",
        kind: "task",
        action_group: "phase-1",
        required_after_close: true,
      },
    ],
  };

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [configWithFlag],
      request: { workflow_id: "wf-1" },
    }),
  );

  const a1 = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(a1.status[0].stage).toBe("not-required");
});

test("Task 4: mixed (no-flag, flag, flag+blocked, done) — only no-flag and flag+blocked are swept", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-noflag", type: "kickoff" });
  await seedAction({ _id: "a-flag", type: "qualify" });
  await seedAction({ _id: "a-flag-blocked", type: "qualify", stage: "blocked" });
  await seedAction({ _id: "a-done", type: "kickoff", stage: "done" });

  const configWithFlag = {
    ...baseConfig,
    actions: [
      { type: "qualify", kind: "task", required_after_close: true },
      { type: "kickoff", kind: "task" },
    ],
  };

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [configWithFlag],
      request: { workflow_id: "wf-1" },
    }),
  );

  const noflag = await mongo.db.collection("actions").findOne({ _id: "a-noflag" });
  const flag = await mongo.db.collection("actions").findOne({ _id: "a-flag" });
  const flagBlocked = await mongo.db
    .collection("actions")
    .findOne({ _id: "a-flag-blocked" });
  const done = await mongo.db.collection("actions").findOne({ _id: "a-done" });

  expect(noflag.status[0].stage).toBe("not-required");
  expect(flag.status[0].stage).toBe("action-required");
  expect(flagBlocked.status[0].stage).toBe("not-required");
  expect(done.status).toHaveLength(1);
  expect(done.status[0].stage).toBe("done");
});

test("Task 4: empty sweep when all actions already terminal — no writes pushed", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "done" });
  await seedAction({ _id: "a2", type: "kickoff", stage: "not-required" });

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const a1 = await mongo.db.collection("actions").findOne({ _id: "a1" });
  const a2 = await mongo.db.collection("actions").findOne({ _id: "a2" });
  expect(a1.status).toHaveLength(1);
  expect(a2.status).toHaveLength(1);
});

test("Task 4: missing config for workflow_type defaults to blanket sweep", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [],
      request: { workflow_id: "wf-1" },
    }),
  );

  const a1 = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(a1.status[0].stage).toBe("not-required");
});

test("Task 4: pre-existing not-required action untouched by $nin filter", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "not-required" });

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const a1 = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(a1.status).toHaveLength(1);
});

// ===========================================================================
// Task 5 — Recompute summary + groups
// ===========================================================================

test("Task 5: summary counts reflect post-sweep state (swept count toward not_required)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "kickoff", action_group: "phase-2" });
  await seedAction({
    _id: "a3",
    type: "qualify",
    action_group: "phase-1",
    stage: "done",
  });
  await seedAction({
    _id: "a4",
    type: "kickoff",
    action_group: "phase-2",
    stage: "not-required",
  });

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.summary).toEqual({ done: 1, not_required: 3, total: 4 });
});

test("Task 5: summary asymmetry — required_after_close survivor counts in total but not terminal buckets", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "kickoff", action_group: "phase-2" });
  await seedAction({ _id: "a2", type: "qualify", action_group: "phase-1" });

  const configWithFlag = {
    ...baseConfig,
    actions: [
      {
        type: "qualify",
        kind: "task",
        action_group: "phase-1",
        required_after_close: true,
      },
      { type: "kickoff", kind: "task", action_group: "phase-2" },
    ],
  };

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [configWithFlag],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  // a1 swept → not_required, a2 survives at action-required → only total.
  expect(wf.summary).toEqual({ done: 0, not_required: 1, total: 2 });
});

test("Task 5: every action terminal post-sweep → all groups land done (parity with cancel)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "qualify", action_group: "phase-1" });

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  const phase1 = wf.groups.find((g) => g.id === "phase-1");
  expect(phase1).toEqual({
    id: "phase-1",
    status: "done",
    summary: { done: 0, not_required: 2, total: 2 },
  });
});

test("Task 5: surviving non-blocked required_after_close action → group lands non-done (design.md:34 asymmetry)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });

  const configWithFlag = {
    ...baseConfig,
    actions: [
      {
        type: "qualify",
        kind: "task",
        action_group: "phase-1",
        required_after_close: true,
      },
    ],
  };

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [configWithFlag],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  const phase1 = wf.groups.find((g) => g.id === "phase-1");
  expect(phase1.status).not.toBe("done");
});

test("Task 5: blocked required_after_close action gets swept → group lands done (blocked-exception)", async () => {
  await seedWorkflow();
  await seedAction({
    _id: "a1",
    type: "qualify",
    action_group: "phase-1",
    stage: "blocked",
  });

  const configWithFlag = {
    ...baseConfig,
    actions: [
      {
        type: "qualify",
        kind: "task",
        action_group: "phase-1",
        required_after_close: true,
      },
    ],
  };

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [configWithFlag],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  const phase1 = wf.groups.find((g) => g.id === "phase-1");
  expect(phase1.status).toBe("done");
});

test("Task 5: empty group lands with default { status:'done', summary:{0,0,0} }", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  const phase2 = wf.groups.find((g) => g.id === "phase-2");
  expect(phase2).toEqual({
    id: "phase-2",
    status: "done",
    summary: { done: 0, not_required: 0, total: 0 },
  });
});

test("Task 5: status[] receives one completed push (no double-push from summary writeback)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });

  await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status).toHaveLength(2);
  expect(wf.status[0].stage).toBe("completed");
  expect(wf.status[1].stage).toBe("active");
});

// ===========================================================================
// Task 6 — Tracker subscription + return shape
// ===========================================================================

const parentChildBaseConfig = {
  type: "onboarding",
  entity_collection: "leads-collection",
  action_groups: [],
  actions: [
    { type: "qualify", kind: "form" },
    { type: "track-child", kind: "tracker" },
  ],
};

async function seedParentWithTracker({
  parentId = "wf-parent",
  trackerId = "p-tracker",
  trackerStage = "in-progress",
} = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id: parentId,
    workflow_type: "onboarding",
    entity_id: `${parentId}-entity`,
    entity_collection: "leads-collection",
    status: [{ stage: "active", created: new Date("2026-05-19T00:00:00Z") }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  });
  // Parent has a second non-tracker action so it does NOT auto-complete.
  await mongo.db.collection("actions").insertOne({
    _id: `${parentId}-approve`,
    workflow_id: parentId,
    type: "qualify",
    kind: "form",
    key: null,
    status: [
      { stage: "action-required", created: new Date("2026-05-19T00:00:00Z") },
    ],
  });
  await mongo.db.collection("actions").insertOne({
    _id: trackerId,
    workflow_id: parentId,
    type: "track-child",
    kind: "tracker",
    key: null,
    status: [
      { stage: trackerStage, created: new Date("2026-05-19T00:00:00Z") },
    ],
  });
}

test("Task 6: workflow without parent_action_id → tracker_fired: []", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const result = await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [parentChildBaseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  expect(result.tracker_fired).toEqual([]);
});

test("Task 6: child workflow with parent_action_id → parent tracker flips to done", async () => {
  await seedParentWithTracker();
  await seedWorkflow({
    _id: "wf-child",
    parent_action_id: "p-tracker",
  });
  await seedAction({
    _id: "child-a1",
    type: "qualify",
    workflow_id: "wf-child",
    kind: "form",
  });

  const result = await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [parentChildBaseConfig],
      request: { workflow_id: "wf-child" },
    }),
  );

  expect(result.tracker_fired).toHaveLength(1);
  expect(result.tracker_fired[0]).toEqual({
    parent_action_id: "p-tracker",
    parent_workflow_id: "wf-parent",
    new_status: "done",
  });
  const tracker = await mongo.db
    .collection("actions")
    .findOne({ _id: "p-tracker" });
  expect(tracker.status[0].stage).toBe("done");
  expect(tracker.status[0].event_id).toBeNull();
});

test("Task 6: tracker same-stage (parent already done) → tracker_fired: [], no parent write", async () => {
  await seedParentWithTracker({ trackerStage: "done" });
  await seedWorkflow({
    _id: "wf-child",
    parent_action_id: "p-tracker",
  });
  await seedAction({
    _id: "child-a1",
    type: "qualify",
    workflow_id: "wf-child",
    kind: "form",
  });

  const result = await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [parentChildBaseConfig],
      request: { workflow_id: "wf-child" },
    }),
  );

  expect(result.tracker_fired).toEqual([]);
  const tracker = await mongo.db
    .collection("actions")
    .findOne({ _id: "p-tracker" });
  expect(tracker.status).toHaveLength(1);
});

test("Task 6: already-completed close skips subscription (no parent write, tracker_fired: [])", async () => {
  await seedParentWithTracker();
  await seedWorkflow({
    _id: "wf-child",
    stage: "completed",
    parent_action_id: "p-tracker",
  });

  const result = await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [parentChildBaseConfig],
      request: { workflow_id: "wf-child" },
    }),
  );

  expect(result).toEqual({
    action_ids: [],
    event_id: null,
    tracker_fired: [],
  });
  const tracker = await mongo.db
    .collection("actions")
    .findOne({ _id: "p-tracker" });
  // Parent's pre-existing in-progress is untouched.
  expect(tracker.status).toHaveLength(1);
  expect(tracker.status[0].stage).toBe("in-progress");
});

test("Task 6: return shape always has event_id: null and action_ids array", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const result = await CloseWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  expect(result.event_id).toBeNull();
  expect(Array.isArray(result.action_ids)).toBe(true);
  expect(result.action_ids).toContain("a1");
});
