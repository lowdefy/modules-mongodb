import inMemoryMongo from "../shared/inMemoryMongo.js";
import bulkWriteActions from "./bulkWriteActions.js";

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("actions").deleteMany({});
});

test("applies mixed insert + update operations", async () => {
  await mongo.db
    .collection("actions")
    .insertOne({ _id: "a1", stage: "blocked" });
  const result = await bulkWriteActions({
    mongoDb: mongo.db,
    collection: "actions",
    operations: [
      {
        updateOne: {
          filter: { _id: "a1" },
          update: { $set: { stage: "done" } },
        },
      },
      { insertOne: { document: { _id: "a2", stage: "action-required" } } },
    ],
  });
  expect(result.modifiedCount).toBe(1);
  expect(result.insertedCount).toBe(1);
  expect(
    (await mongo.db.collection("actions").findOne({ _id: "a1" })).stage,
  ).toBe("done");
  expect(
    (await mongo.db.collection("actions").findOne({ _id: "a2" })).stage,
  ).toBe("action-required");
});

test("no-ops on an empty operations array", async () => {
  const result = await bulkWriteActions({
    mongoDb: mongo.db,
    collection: "actions",
    operations: [],
  });
  expect(result.insertedCount).toBe(0);
  expect(result.modifiedCount).toBe(0);
});
