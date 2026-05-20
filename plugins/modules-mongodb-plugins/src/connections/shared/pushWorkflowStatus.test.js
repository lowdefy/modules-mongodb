import createMongoDBConnection from "./createMongoDBConnection.js";
import inMemoryMongo from "./inMemoryMongo.js";
import pushWorkflowStatus from "./pushWorkflowStatus.js";

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1" },
};

let mongo;
let context;

beforeAll(async () => {
  mongo = await inMemoryMongo();
  const mongoDBConnection = createMongoDBConnection({
    blockId: "test-block",
    connection: { databaseUri: mongo.uri },
    connectionId: "test-conn",
    pageId: "test-page",
    requestId: "test-req",
  });
  context = { mongoDBConnection, changeStamp };
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("workflows").deleteMany({});
});

async function seedWorkflow({ _id, stage }) {
  await mongo.db.collection("workflows").insertOne({
    _id,
    workflow_type: "onboarding",
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
  });
}

async function readWorkflow(workflowId) {
  return mongo.db.collection("workflows").findOne({ _id: workflowId });
}

test("pushWorkflowStatus: push onto active workflow lands, new entry at index 0", async () => {
  await seedWorkflow({ _id: "wf-1", stage: "active" });

  const result = await pushWorkflowStatus(context, {
    workflowId: "wf-1",
    newStage: "completed",
    eventId: "e1",
  });

  expect(result).toEqual({ pushed: true, stage: "completed" });
  const after = await readWorkflow("wf-1");
  expect(after.status).toHaveLength(2);
  expect(after.status[0].stage).toBe("completed");
  expect(after.status[0].event_id).toBe("e1");
  expect(after.status[1].stage).toBe("active");
});

test("pushWorkflowStatus: same-stage guard returns { pushed: false } without writing", async () => {
  await seedWorkflow({ _id: "wf-2", stage: "completed" });

  const result = await pushWorkflowStatus(context, {
    workflowId: "wf-2",
    newStage: "completed",
    eventId: "e2",
  });

  expect(result).toEqual({ pushed: false, stage: "completed" });
  const after = await readWorkflow("wf-2");
  expect(after.status).toHaveLength(1);
});

test("pushWorkflowStatus: caller-supplied currentStage is trusted (matches → no write)", async () => {
  await seedWorkflow({ _id: "wf-3", stage: "active" });

  const result = await pushWorkflowStatus(context, {
    workflowId: "wf-3",
    newStage: "active",
    currentStage: "active",
  });

  expect(result).toEqual({ pushed: false, stage: "active" });
  const after = await readWorkflow("wf-3");
  expect(after.status).toHaveLength(1);
});

test("pushWorkflowStatus: event_id propagates into pushed entry", async () => {
  await seedWorkflow({ _id: "wf-4", stage: "active" });

  await pushWorkflowStatus(context, {
    workflowId: "wf-4",
    newStage: "completed",
    eventId: "evt-xyz",
  });

  const after = await readWorkflow("wf-4");
  expect(after.status[0].event_id).toBe("evt-xyz");
});
