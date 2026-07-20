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

describe("tenant scoping", () => {
  const tenant = { field: "organization_id", value: "org-a" };

  beforeEach(async () => {
    await mongo.db.collection("actions").insertMany([
      { _id: "mine", stage: "blocked", organization_id: "org-a" },
      { _id: "theirs", stage: "blocked", organization_id: "org-b" },
    ]);
  });

  test("insertOne documents are stamped with the tenant field", async () => {
    await bulkWriteActions({
      mongoDb: mongo.db,
      collection: "actions",
      operations: [{ insertOne: { document: { _id: "new", stage: "done" } } }],
      tenant,
    });
    expect(
      await mongo.db.collection("actions").findOne({ _id: "new" }),
    ).toMatchObject({ organization_id: "org-a" });
  });

  test("updateOne filters are tenant-merged — another org's doc is untouched", async () => {
    const result = await bulkWriteActions({
      mongoDb: mongo.db,
      collection: "actions",
      operations: [
        {
          updateOne: {
            filter: { _id: "mine" },
            update: { $set: { stage: "done" } },
          },
        },
        {
          updateOne: {
            filter: { _id: "theirs" },
            update: { $set: { stage: "done" } },
          },
        },
      ],
      tenant,
    });
    expect(result.matchedCount).toBe(1);
    expect(
      (await mongo.db.collection("actions").findOne({ _id: "mine" })).stage,
    ).toBe("done");
    expect(
      (await mongo.db.collection("actions").findOne({ _id: "theirs" })).stage,
    ).toBe("blocked");
  });

  test("updateMany / deleteOne / deleteMany filters are tenant-merged", async () => {
    await bulkWriteActions({
      mongoDb: mongo.db,
      collection: "actions",
      operations: [
        {
          updateMany: {
            filter: { stage: "blocked" },
            update: { $set: { touched: true } },
          },
        },
        { deleteOne: { filter: { _id: "theirs" } } },
        { deleteMany: { filter: { stage: "gone" } } },
      ],
      tenant,
    });
    // updateMany only touched org-a; deleteOne missed the cross-org target.
    expect(
      (await mongo.db.collection("actions").findOne({ _id: "mine" })).touched,
    ).toBe(true);
    const theirs = await mongo.db
      .collection("actions")
      .findOne({ _id: "theirs" });
    expect(theirs).not.toBeNull();
    expect(theirs).not.toHaveProperty("touched");
  });

  test("replaceOne filter is tenant-merged and the replacement is stamped", async () => {
    await bulkWriteActions({
      mongoDb: mongo.db,
      collection: "actions",
      operations: [
        {
          replaceOne: {
            filter: { _id: "mine" },
            replacement: { stage: "replaced" },
          },
        },
      ],
      tenant,
    });
    expect(
      await mongo.db.collection("actions").findOne({ _id: "mine" }),
    ).toMatchObject({ stage: "replaced", organization_id: "org-a" });
  });

  test("unknown op kinds throw (no silent hole in the wall)", async () => {
    await expect(
      bulkWriteActions({
        mongoDb: mongo.db,
        collection: "actions",
        operations: [{ updateSome: { filter: {}, update: {} } }],
        tenant,
      }),
    ).rejects.toThrow('unknown bulk operation kind "updateSome"');
  });

  test("null tenant leaves operations unchanged (cross-org update applies)", async () => {
    await bulkWriteActions({
      mongoDb: mongo.db,
      collection: "actions",
      operations: [
        {
          updateOne: {
            filter: { _id: "theirs" },
            update: { $set: { stage: "done" } },
          },
        },
      ],
      tenant: null,
    });
    expect(
      (await mongo.db.collection("actions").findOne({ _id: "theirs" })).stage,
    ).toBe("done");
  });
});
