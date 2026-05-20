import inMemoryMongo from "../../shared/inMemoryMongo.js";
import CancelWorkflow from "./CancelWorkflow.js";

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

async function seedWorkflow({ _id = "wf-1" } = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id,
    workflow_type: "onboarding",
    entity_id: "lead-1",
    entity_collection: "leads-collection",
    status: [{ stage: "active", created: new Date("2026-05-19T00:00:00Z") }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  });
}

async function seedAction({ _id, type, action_group = null, stage = "action-required", workflow_id = "wf-1" }) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    type,
    kind: "task",
    key: null,
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

test("CancelWorkflow: groups all land at done with not_required counts after cancel", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "kickoff", action_group: "phase-2" });

  await CancelWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.groups).toEqual([
    {
      id: "phase-1",
      status: "done",
      summary: { done: 0, not_required: 1, total: 1 },
    },
    {
      id: "phase-2",
      status: "done",
      summary: { done: 0, not_required: 1, total: 1 },
    },
  ]);
});

test("CancelWorkflow: empty group lands as { status:'done', summary:{0,0,0} }", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
  // phase-2 has no actions — should land as empty done group.

  await CancelWorkflow(
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

test("CancelWorkflow: summary reflects pre-existing done + newly-cancelled not_required", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1", stage: "done" });
  await seedAction({ _id: "a2", type: "kickoff", action_group: "phase-2", stage: "action-required" });

  await CancelWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.summary).toEqual({ done: 1, not_required: 1, total: 2 });
  expect(wf.groups.every((g) => g.status === "done")).toBe(true);
});

test("CancelWorkflow: return shape has no completed_groups key", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });

  const result = await CancelWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  expect(result).toEqual({
    action_ids: ["a1"],
    event_id: null,
    // No parent_action_id on the workflow; subscription returns [].
    tracker_fired: [],
  });
  expect("completed_groups" in result).toBe(false);
});

test("CancelWorkflow: status[] gets one 'cancelled' push (not double-pushed by summary $set)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });

  await CancelWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status).toHaveLength(2);
  expect(wf.status[0].stage).toBe("cancelled");
  expect(wf.status[1].stage).toBe("active");
});

// ===========================================================================
// Part 10 — Tracker subscription wiring
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
    status: [{ stage: "action-required", created: new Date("2026-05-19T00:00:00Z") }],
  });
  await mongo.db.collection("actions").insertOne({
    _id: trackerId,
    workflow_id: parentId,
    type: "track-child",
    kind: "tracker",
    key: null,
    status: [{ stage: trackerStage, created: new Date("2026-05-19T00:00:00Z") }],
  });
}

test("part 10: cancel workflow with parent_action_id:null → tracker_fired:[]; no parent action writes", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const result = await CancelWorkflow(
    makeLowdefyContext({
      workflowsConfig: [parentChildBaseConfig],
      request: { workflow_id: "wf-1" },
    }),
  );

  expect(result.tracker_fired).toEqual([]);
});

test("part 10: cancel workflow with valid parent_action_id → tracker flips to not-required with event_id:null", async () => {
  await seedParentWithTracker();
  // Child workflow points back at parent's tracker.
  await mongo.db.collection("workflows").insertOne({
    _id: "wf-child",
    workflow_type: "onboarding",
    entity_id: "lead-child",
    entity_collection: "leads-collection",
    parent_action_id: "p-tracker",
    status: [{ stage: "active", created: new Date("2026-05-19T00:00:00Z") }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  });
  await mongo.db.collection("actions").insertOne({
    _id: "child-a1",
    workflow_id: "wf-child",
    type: "qualify",
    kind: "form",
    key: null,
    status: [{ stage: "action-required", created: new Date("2026-05-19T00:00:00Z") }],
  });

  const result = await CancelWorkflow(
    makeLowdefyContext({
      workflowsConfig: [parentChildBaseConfig],
      request: { workflow_id: "wf-child" },
    }),
  );

  expect(result.tracker_fired).toHaveLength(1);
  expect(result.tracker_fired[0]).toEqual({
    parent_action_id: "p-tracker",
    parent_workflow_id: "wf-parent",
    new_status: "not-required",
  });
  const tracker = await mongo.db.collection("actions").findOne({ _id: "p-tracker" });
  expect(tracker.status[0].stage).toBe("not-required");
  expect(tracker.status[0].event_id).toBeNull();
});

test("part 10: same-stage guard fires (parent already not-required) → tracker_fired:[]; no parent write", async () => {
  await seedParentWithTracker({ trackerStage: "not-required" });
  await mongo.db.collection("workflows").insertOne({
    _id: "wf-child",
    workflow_type: "onboarding",
    entity_id: "lead-child",
    entity_collection: "leads-collection",
    parent_action_id: "p-tracker",
    status: [{ stage: "active", created: new Date("2026-05-19T00:00:00Z") }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  });
  await mongo.db.collection("actions").insertOne({
    _id: "child-a1",
    workflow_id: "wf-child",
    type: "qualify",
    kind: "form",
    key: null,
    status: [{ stage: "action-required", created: new Date("2026-05-19T00:00:00Z") }],
  });

  const result = await CancelWorkflow(
    makeLowdefyContext({
      workflowsConfig: [parentChildBaseConfig],
      request: { workflow_id: "wf-child" },
    }),
  );

  expect(result.tracker_fired).toEqual([]);
  const tracker = await mongo.db.collection("actions").findOne({ _id: "p-tracker" });
  expect(tracker.status).toHaveLength(1); // no new push
});
