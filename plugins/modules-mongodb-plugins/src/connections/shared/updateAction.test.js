import createMongoDBConnection from "./createMongoDBConnection.js";
import inMemoryMongo from "./inMemoryMongo.js";
import updateAction from "./updateAction.js";

const actionsEnum = {
  "not-required": { priority: 0 },
  done: { priority: 3 },
  "in-review": { priority: 4 },
  "changes-required": { priority: 5 },
  "action-required": { priority: 6 },
  blocked: { priority: 7 },
  error: { priority: 8 },
};

const changeStamp = { timestamp: new Date("2026-05-20T00:00:00Z"), user: { id: "u1" } };

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
  context = { mongoDBConnection, actionsEnum, changeStamp };
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("actions").deleteMany({});
});

async function seedAction({ _id, type = "qualify", key = null, stage }) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id: "wf-1",
    type,
    kind: "form",
    key,
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
  });
}

async function readAction(actionId) {
  return mongo.db.collection("actions").findOne({ _id: actionId });
}

test("updateAction: force:true writes regardless of priority (in-review → done)", async () => {
  await seedAction({ _id: "a1", stage: "in-review" });

  const result = await updateAction(context, {
    actionId: "a1",
    newStage: "done",
    eventId: "e1",
    force: true,
  });

  expect(result).toBeTruthy();
  const after = await readAction("a1");
  expect(after.status[0].stage).toBe("done");
  expect(after.status[0].event_id).toBe("e1");
  expect(after.status).toHaveLength(2);
});

test("updateAction: non-force same-stage on non-self entry → no write, returns null", async () => {
  await seedAction({ _id: "a2", stage: "done" });

  const result = await updateAction(context, {
    actionId: "a2",
    newStage: "done",
    eventId: "e2",
    currentActionId: "different-id",
    force: false,
  });

  expect(result).toBeNull();
  const after = await readAction("a2");
  expect(after.status).toHaveLength(1);
});

test("updateAction: non-force same-stage on currentActionId self-exception → writes audit entry", async () => {
  await seedAction({ _id: "self-1", stage: "in-review" });

  const result = await updateAction(context, {
    actionId: "self-1",
    newStage: "in-review",
    eventId: "e3",
    currentActionId: "self-1",
    force: false,
  });

  expect(result).toBeTruthy();
  const after = await readAction("self-1");
  expect(after.status).toHaveLength(2);
  expect(after.status[0].stage).toBe("in-review");
  expect(after.status[0].event_id).toBe("e3");
});

test("updateAction: non-force allows lower-priority transition (action-required → in-review)", async () => {
  await seedAction({ _id: "a3", stage: "action-required" });

  const result = await updateAction(context, {
    actionId: "a3",
    newStage: "in-review",
    eventId: "e4",
    currentActionId: "a3",
    force: false,
  });

  expect(result).toBeTruthy();
  const after = await readAction("a3");
  expect(after.status[0].stage).toBe("in-review");
});

test("updateAction: non-force rejects higher-priority transition (done → action-required)", async () => {
  await seedAction({ _id: "a4", stage: "done" });

  const result = await updateAction(context, {
    actionId: "a4",
    newStage: "action-required",
    eventId: "e5",
    currentActionId: "other-id",
    force: false,
  });

  expect(result).toBeNull();
  const after = await readAction("a4");
  expect(after.status).toHaveLength(1);
});

test("updateAction: force:true with currentActionId:null on same-stage action lands (task-13 path)", async () => {
  await seedAction({ _id: "err-1", stage: "in-review" });

  const result = await updateAction(context, {
    actionId: "err-1",
    newStage: "error",
    eventId: "e6",
    currentActionId: null,
    force: true,
  });

  expect(result).toBeTruthy();
  const after = await readAction("err-1");
  expect(after.status[0].stage).toBe("error");
});

test("updateAction: non-force on missing action throws precise error", async () => {
  await expect(
    updateAction(context, {
      actionId: "missing",
      newStage: "done",
      currentActionId: null,
      force: false,
    }),
  ).rejects.toThrow(/updateAction: action missing not found/);
});

test("updateAction: force:true sets additional fields ($set) on the action doc", async () => {
  await seedAction({ _id: "a5", stage: "action-required" });

  await updateAction(context, {
    actionId: "a5",
    newStage: "done",
    eventId: null,
    fields: { child_workflow_id: "wf-child-1" },
    force: true,
  });

  const after = await readAction("a5");
  expect(after.child_workflow_id).toBe("wf-child-1");
  expect(after.status[0].stage).toBe("done");
});
