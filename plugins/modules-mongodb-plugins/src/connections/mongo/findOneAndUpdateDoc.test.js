import inMemoryMongo from "../shared/inMemoryMongo.js";
import findOneAndUpdateDoc from "./findOneAndUpdateDoc.js";

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("docs").deleteMany({});
});

test("returns the post-write document", async () => {
  await mongo.db.collection("docs").insertOne({ _id: "x", n: 1 });
  const doc = await findOneAndUpdateDoc({
    mongoDb: mongo.db,
    collection: "docs",
    filter: { _id: "x" },
    update: { $set: { n: 2 } },
  });
  expect(doc).toMatchObject({ _id: "x", n: 2 });
});

test("returns null when the filter matches zero docs (CAS miss)", async () => {
  await mongo.db.collection("docs").insertOne({ _id: "x", n: 1 });
  const doc = await findOneAndUpdateDoc({
    mongoDb: mongo.db,
    collection: "docs",
    filter: { _id: "x", n: 999 },
    update: { $set: { n: 2 } },
  });
  expect(doc).toBeNull();
  // The doc was not modified.
  const after = await mongo.db.collection("docs").findOne({ _id: "x" });
  expect(after.n).toBe(1);
});

describe("tenant scoping", () => {
  const tenant = { field: "organizationId", value: "org-a" };

  beforeEach(async () => {
    await mongo.db.collection("docs").insertMany([
      { _id: "mine", n: 1, organizationId: "org-a" },
      { _id: "theirs", n: 1, organizationId: "org-b" },
    ]);
  });

  test("updates the doc when it belongs to the tenant", async () => {
    const doc = await findOneAndUpdateDoc({
      mongoDb: mongo.db,
      collection: "docs",
      filter: { _id: "mine" },
      update: { $set: { n: 2 } },
      tenant,
    });
    expect(doc).toMatchObject({ _id: "mine", n: 2 });
  });

  test("returns null (miss) when the doc belongs to another org — no write", async () => {
    const doc = await findOneAndUpdateDoc({
      mongoDb: mongo.db,
      collection: "docs",
      filter: { _id: "theirs" },
      update: { $set: { n: 2 } },
      tenant,
    });
    expect(doc).toBeNull();
    const after = await mongo.db.collection("docs").findOne({ _id: "theirs" });
    expect(after.n).toBe(1);
  });

  test("null tenant leaves the filter unchanged", async () => {
    const doc = await findOneAndUpdateDoc({
      mongoDb: mongo.db,
      collection: "docs",
      filter: { _id: "theirs" },
      update: { $set: { n: 2 } },
      tenant: null,
    });
    expect(doc).toMatchObject({ _id: "theirs", n: 2 });
  });
});
