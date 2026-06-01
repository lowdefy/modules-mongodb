import createMongoDBConnection from "../../shared/createMongoDBConnection.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import reevaluateBlockedActions from "./reevaluateBlockedActions.js";

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

async function seedAction({ _id, type, stage, key = null, action_group = null }) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id: "wf-1",
    type,
    kind: "simple",
    key,
    action_group,
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
  });
}

async function readAction(id) {
  return mongo.db.collection("actions").findOne({ _id: id });
}

test("reevaluateBlockedActions: empty input → empty array, no writes", async () => {
  const pushed = await reevaluateBlockedActions(context, {
    workflowActions: [],
    actionsConfig: [],
    groups: [],
    declaredGroups: [],
    eventId: "e1",
  });
  expect(pushed).toEqual([]);
});

test("reevaluateBlockedActions: blocked action with empty blocked_by → pushed immediately", async () => {
  await seedAction({ _id: "a1", type: "x", stage: "blocked" });
  const workflowActions = [
    { _id: "a1", type: "x", status: [{ stage: "blocked" }] },
  ];

  const pushed = await reevaluateBlockedActions(context, {
    workflowActions,
    actionsConfig: [{ type: "x" }],
    groups: [],
    declaredGroups: [],
    eventId: "e1",
  });

  expect(pushed).toEqual(["a1"]);
  const after = await readAction("a1");
  expect(after.status[0].stage).toBe("action-required");
  expect(after.status[0].event_id).toBe("e1");
});

test("reevaluateBlockedActions: blocked action with group-id blocked_by, group is done → pushed", async () => {
  await seedAction({ _id: "a1", type: "x", stage: "blocked" });
  const workflowActions = [
    { _id: "a1", type: "x", status: [{ stage: "blocked" }] },
  ];

  const pushed = await reevaluateBlockedActions(context, {
    workflowActions,
    actionsConfig: [{ type: "x", blocked_by: ["phase-1"] }],
    groups: [
      {
        id: "phase-1",
        status: "done",
        summary: { done: 1, not_required: 0, total: 1 },
      },
    ],
    declaredGroups: [{ id: "phase-1" }],
    eventId: "e1",
  });

  expect(pushed).toEqual(["a1"]);
});

test("reevaluateBlockedActions: blocked action with group-id blocked_by, group in-progress → not pushed", async () => {
  await seedAction({ _id: "a1", type: "x", stage: "blocked" });
  const workflowActions = [
    { _id: "a1", type: "x", status: [{ stage: "blocked" }] },
  ];

  const pushed = await reevaluateBlockedActions(context, {
    workflowActions,
    actionsConfig: [{ type: "x", blocked_by: ["phase-1"] }],
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
    declaredGroups: [{ id: "phase-1" }],
    eventId: "e1",
  });

  expect(pushed).toEqual([]);
  const after = await readAction("a1");
  expect(after.status[0].stage).toBe("blocked");
});

test("reevaluateBlockedActions: action-type blocked_by, every doc terminal → pushed", async () => {
  await seedAction({ _id: "dep", type: "qualify", stage: "done" });
  await seedAction({ _id: "a1", type: "x", stage: "blocked" });
  const workflowActions = [
    { _id: "dep", type: "qualify", status: [{ stage: "done" }] },
    { _id: "a1", type: "x", status: [{ stage: "blocked" }] },
  ];

  const pushed = await reevaluateBlockedActions(context, {
    workflowActions,
    actionsConfig: [
      { type: "qualify" },
      { type: "x", blocked_by: ["qualify"] },
    ],
    groups: [],
    declaredGroups: [],
    eventId: "e1",
  });

  expect(pushed).toEqual(["a1"]);
});

test("reevaluateBlockedActions: mixed blocked_by — both satisfied → pushed", async () => {
  await seedAction({ _id: "dep", type: "qualify", stage: "done" });
  await seedAction({ _id: "a1", type: "x", stage: "blocked" });
  const workflowActions = [
    { _id: "dep", type: "qualify", status: [{ stage: "done" }] },
    { _id: "a1", type: "x", status: [{ stage: "blocked" }] },
  ];

  const pushed = await reevaluateBlockedActions(context, {
    workflowActions,
    actionsConfig: [
      { type: "qualify" },
      { type: "x", blocked_by: ["phase-1", "qualify"] },
    ],
    groups: [
      {
        id: "phase-1",
        status: "done",
        summary: { done: 0, not_required: 0, total: 0 },
      },
    ],
    declaredGroups: [{ id: "phase-1" }],
    eventId: "e1",
  });

  expect(pushed).toEqual(["a1"]);
});

test("reevaluateBlockedActions: mixed blocked_by — one unsatisfied → not pushed", async () => {
  await seedAction({ _id: "dep", type: "qualify", stage: "in-progress" });
  await seedAction({ _id: "a1", type: "x", stage: "blocked" });
  const workflowActions = [
    { _id: "dep", type: "qualify", status: [{ stage: "in-progress" }] },
    { _id: "a1", type: "x", status: [{ stage: "blocked" }] },
  ];

  const pushed = await reevaluateBlockedActions(context, {
    workflowActions,
    actionsConfig: [
      { type: "qualify" },
      { type: "x", blocked_by: ["phase-1", "qualify"] },
    ],
    groups: [
      {
        id: "phase-1",
        status: "done",
        summary: { done: 0, not_required: 0, total: 0 },
      },
    ],
    declaredGroups: [{ id: "phase-1" }],
    eventId: "e1",
  });

  expect(pushed).toEqual([]);
});

test("reevaluateBlockedActions: unresolved blocked_by entry → defensive skip, no throw, not pushed", async () => {
  await seedAction({ _id: "a1", type: "x", stage: "blocked" });
  const workflowActions = [
    { _id: "a1", type: "x", status: [{ stage: "blocked" }] },
  ];

  const pushed = await reevaluateBlockedActions(context, {
    workflowActions,
    actionsConfig: [{ type: "x", blocked_by: ["resolves-to-nothing"] }],
    groups: [],
    declaredGroups: [],
    eventId: "e1",
  });

  expect(pushed).toEqual([]);
});

test("reevaluateBlockedActions: walk is single-pass — newly-pushed action doesn't fan out within the same call", async () => {
  // Two actions: A (blocked on empty blocked_by → gets pushed). B (blocked on action-type A).
  // Within one walk, B should still see A as 'blocked' in the in-memory list, so B stays blocked.
  await seedAction({ _id: "a", type: "a", stage: "blocked" });
  await seedAction({ _id: "b", type: "b", stage: "blocked" });
  const workflowActions = [
    { _id: "a", type: "a", status: [{ stage: "blocked" }] },
    { _id: "b", type: "b", status: [{ stage: "blocked" }] },
  ];

  const pushed = await reevaluateBlockedActions(context, {
    workflowActions,
    actionsConfig: [
      { type: "a" },
      { type: "b", blocked_by: ["a"] },
    ],
    groups: [],
    declaredGroups: [],
    eventId: "e1",
  });

  expect(pushed).toEqual(["a"]);
  const afterB = await readAction("b");
  expect(afterB.status[0].stage).toBe("blocked");
});

test("reevaluateBlockedActions: idempotent — same call on a workflow whose blocked actions are already action-required no-ops", async () => {
  await seedAction({ _id: "a1", type: "x", stage: "action-required" });
  const workflowActions = [
    { _id: "a1", type: "x", status: [{ stage: "action-required" }] },
  ];

  const pushed = await reevaluateBlockedActions(context, {
    workflowActions,
    actionsConfig: [{ type: "x" }],
    groups: [],
    declaredGroups: [],
    eventId: "e1",
  });

  expect(pushed).toEqual([]);
});
