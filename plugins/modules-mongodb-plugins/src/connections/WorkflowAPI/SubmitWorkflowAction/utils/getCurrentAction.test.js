import createMongoDBConnection from "../../../shared/createMongoDBConnection.js";
import inMemoryMongo from "../../../shared/inMemoryMongo.js";
import getCurrentAction from "./getCurrentAction.js";

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
  await mongo.db.collection("actions").deleteMany({});
});

test("getCurrentAction: returns the action doc when found", async () => {
  const doc = {
    _id: "action-1",
    workflow_id: "wf-1",
    type: "qualify",
    kind: "form",
    key: null,
    status: [{ stage: "action-required", created: new Date() }],
  };
  await mongo.db.collection("actions").insertOne(doc);

  const result = await getCurrentAction(
    { mongoDBConnection },
    { actionId: "action-1" },
  );

  expect(result).not.toBeNull();
  expect(result._id).toBe("action-1");
  expect(result.type).toBe("qualify");
  expect(result.status[0].stage).toBe("action-required");
});

test("getCurrentAction: returns null when no action matches", async () => {
  const result = await getCurrentAction(
    { mongoDBConnection },
    { actionId: "missing-action" },
  );
  expect(result).toBeNull();
});
