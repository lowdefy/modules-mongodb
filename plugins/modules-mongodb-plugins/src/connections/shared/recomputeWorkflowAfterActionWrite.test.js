import createMongoDBConnection from "./createMongoDBConnection.js";
import inMemoryMongo from "./inMemoryMongo.js";
import recomputeWorkflowAfterActionWrite from "./recomputeWorkflowAfterActionWrite.js";

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
let mongoDBConnection;

beforeAll(async () => {
  mongo = await inMemoryMongo();
  mongoDBConnection = createMongoDBConnection({
    blockId: "test-block",
    connection: { databaseUri: mongo.uri },
    connectionId: "test-conn",
    pageId: "test-page",
    requestId: "test-req",
  });
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
});

const onboardingConfig = {
  type: "onboarding",
  entity_collection: "leads-collection",
  action_groups: [{ id: "phase-1" }, { id: "phase-2" }],
  actions: [
    { type: "qualify", kind: "form", action_group: "phase-1" },
    { type: "kickoff", kind: "form", action_group: "phase-2" },
  ],
};

function makeContext(overrides = {}) {
  return {
    mongoDBConnection,
    actionsEnum,
    workflowsConfig: [onboardingConfig],
    changeStamp,
    eventId: overrides.eventId ?? "event-1",
    ...overrides,
  };
}

async function seedWorkflow({
  _id = "wf-1",
  stage = "active",
  groups = [],
} = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id,
    workflow_type: "onboarding",
    entity_id: "lead-1",
    entity_collection: "leads-collection",
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups,
    form_data: {},
  });
}

async function seedAction({
  _id,
  type,
  stage = "action-required",
  workflow_id = "wf-1",
  action_group = null,
  kind = "form",
}) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    type,
    kind,
    key: null,
    action_group,
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
  });
}

test("returns shouldPushCompleted:false when one action is non-terminal; writes $set but no $push", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "done", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "kickoff", stage: "action-required", action_group: "phase-2" });

  const result = await recomputeWorkflowAfterActionWrite(makeContext(), {
    workflowId: "wf-1",
  });

  expect(result.shouldPushCompleted).toBe(false);
  expect(result.summary).toEqual({ done: 1, not_required: 0, total: 2 });
  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status).toHaveLength(1);
  expect(wf.status[0].stage).toBe("active");
  expect(wf.summary).toEqual({ done: 1, not_required: 0, total: 2 });
});

test("returns shouldPushCompleted:true when every action terminal; pushes completed at status[0]", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "done", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "kickoff", stage: "not-required", action_group: "phase-2" });

  const result = await recomputeWorkflowAfterActionWrite(makeContext({ eventId: "E1" }), {
    workflowId: "wf-1",
  });

  expect(result.shouldPushCompleted).toBe(true);
  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status[0].stage).toBe("completed");
  expect(wf.status[0].event_id).toBe("E1");
});

test("already-completed workflow with all terminal actions → shouldPushCompleted:false; no $push", async () => {
  await seedWorkflow({ stage: "completed" });
  await seedAction({ _id: "a1", type: "qualify", stage: "done", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "kickoff", stage: "done", action_group: "phase-2" });

  const result = await recomputeWorkflowAfterActionWrite(makeContext(), {
    workflowId: "wf-1",
  });

  expect(result.shouldPushCompleted).toBe(false);
  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status).toHaveLength(1);
  expect(wf.status[0].stage).toBe("completed");
});

test("already-cancelled workflow with all terminal actions → shouldPushCompleted:false; no $push", async () => {
  await seedWorkflow({ stage: "cancelled" });
  await seedAction({ _id: "a1", type: "qualify", stage: "not-required", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "kickoff", stage: "not-required", action_group: "phase-2" });

  const result = await recomputeWorkflowAfterActionWrite(makeContext(), {
    workflowId: "wf-1",
  });

  expect(result.shouldPushCompleted).toBe(false);
  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status).toHaveLength(1);
  expect(wf.status[0].stage).toBe("cancelled");
});

test("reevaluateBlockedActions pushes action-required on newly-unblocked actions; reEvaluatedActionIds populated; second-pass groupsAfter reflects walk", async () => {
  const config = {
    type: "onboarding",
    action_groups: [{ id: "phase-1" }],
    actions: [
      { type: "qualify", kind: "form", action_group: "phase-1" },
      {
        type: "kickoff",
        kind: "form",
        action_group: "phase-1",
        blocked_by: ["qualify"],
      },
    ],
  };
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "done", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "kickoff", stage: "blocked", action_group: "phase-1" });

  const result = await recomputeWorkflowAfterActionWrite(
    makeContext({ workflowsConfig: [config] }),
    { workflowId: "wf-1" },
  );

  expect(result.reEvaluatedActionIds).toEqual(["a2"]);
  const kickoff = await mongo.db.collection("actions").findOne({ _id: "a2" });
  expect(kickoff.status[0].stage).toBe("action-required");
  // Group is still in-progress (qualify done + kickoff action-required).
  expect(result.groupsAfter.find((g) => g.id === "phase-1").status).toBe("in-progress");
});

test("groupsBefore reflects the doc's pre-call groups[]; groupsAfter is what got written", async () => {
  const preGroups = [
    { id: "phase-1", status: "blocked", summary: { done: 0, not_required: 0, total: 1 } },
    { id: "phase-2", status: "blocked", summary: { done: 0, not_required: 0, total: 1 } },
  ];
  await seedWorkflow({ groups: preGroups });
  await seedAction({ _id: "a1", type: "qualify", stage: "done", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "kickoff", stage: "action-required", action_group: "phase-2" });

  const result = await recomputeWorkflowAfterActionWrite(makeContext(), {
    workflowId: "wf-1",
  });

  expect(result.groupsBefore).toEqual(preGroups);
  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.groups).toEqual(result.groupsAfter);
});

test("workflow not found → throws", async () => {
  await expect(
    recomputeWorkflowAfterActionWrite(makeContext(), { workflowId: "missing" }),
  ).rejects.toThrow(/workflow missing not found/);
});

test("workflow_type not in workflowsConfig → throws", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "done", action_group: "phase-1" });

  await expect(
    recomputeWorkflowAfterActionWrite(makeContext({ workflowsConfig: [] }), {
      workflowId: "wf-1",
    }),
  ).rejects.toThrow(/workflow_type "onboarding" not in workflowsConfig/);
});
