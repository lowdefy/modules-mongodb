import inMemoryMongo from "../shared/inMemoryMongo.js";
import insertManyDocs from "./insertManyDocs.js";

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("log-changes").deleteMany({});
});

test("inserts multiple docs", async () => {
  const result = await insertManyDocs({
    mongoDb: mongo.db,
    collection: "log-changes",
    docs: [{ _id: "c1" }, { _id: "c2" }],
  });
  expect(result.insertedCount).toBe(2);
  expect(await mongo.db.collection("log-changes").countDocuments()).toBe(2);
});

test("no-ops on an empty docs array (insertMany would otherwise throw)", async () => {
  const result = await insertManyDocs({
    mongoDb: mongo.db,
    collection: "log-changes",
    docs: [],
  });
  expect(result.insertedCount).toBe(0);
  expect(await mongo.db.collection("log-changes").countDocuments()).toBe(0);
});

describe("tenant scoping", () => {
  const tenant = { field: "organizationId", value: "org-a" };

  test("stamps the tenant field onto every inserted doc", async () => {
    await insertManyDocs({
      mongoDb: mongo.db,
      collection: "log-changes",
      docs: [{ _id: "c1" }, { _id: "c2" }],
      tenant,
    });
    const docs = await mongo.db
      .collection("log-changes")
      .find({ organizationId: "org-a" })
      .toArray();
    expect(docs.map((d) => d._id).sort()).toEqual(["c1", "c2"]);
  });

  test("null tenant inserts the docs unstamped", async () => {
    await insertManyDocs({
      mongoDb: mongo.db,
      collection: "log-changes",
      docs: [{ _id: "c1" }],
      tenant: null,
    });
    const doc = await mongo.db.collection("log-changes").findOne({ _id: "c1" });
    expect(doc).not.toHaveProperty("organizationId");
  });
});
