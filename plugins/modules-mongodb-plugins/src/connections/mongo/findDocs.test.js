import inMemoryMongo from "../shared/inMemoryMongo.js";
import findDocs from "./findDocs.js";

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

test("returns all matching docs as an array", async () => {
  await mongo.db.collection("actions").insertMany([
    { _id: "a1", workflow_id: "w1" },
    { _id: "a2", workflow_id: "w1" },
    { _id: "a3", workflow_id: "w2" },
  ]);
  const docs = await findDocs({
    mongoDb: mongo.db,
    collection: "actions",
    query: { workflow_id: "w1" },
  });
  expect(docs.map((d) => d._id).sort()).toEqual(["a1", "a2"]);
});

test("returns an empty array when nothing matches", async () => {
  const docs = await findDocs({
    mongoDb: mongo.db,
    collection: "actions",
    query: { workflow_id: "none" },
  });
  expect(docs).toEqual([]);
});

describe("tenant scoping", () => {
  const tenant = { field: "organizationId", value: "org-a" };

  beforeEach(async () => {
    await mongo.db.collection("actions").insertMany([
      { _id: "a1", workflow_id: "w1", organizationId: "org-a" },
      { _id: "a2", workflow_id: "w1", organizationId: "org-b" },
      { _id: "a3", workflow_id: "w2", organizationId: "org-a" },
    ]);
  });

  test("tenant verdict merges into the query — other org's docs invisible", async () => {
    const docs = await findDocs({
      mongoDb: mongo.db,
      collection: "actions",
      query: { workflow_id: "w1" },
      tenant,
    });
    expect(docs.map((d) => d._id)).toEqual(["a1"]);
  });

  test("empty query with a tenant returns only the tenant's docs", async () => {
    const docs = await findDocs({
      mongoDb: mongo.db,
      collection: "actions",
      tenant,
    });
    expect(docs.map((d) => d._id).sort()).toEqual(["a1", "a3"]);
  });

  test("null tenant leaves the query unchanged (both orgs visible)", async () => {
    const docs = await findDocs({
      mongoDb: mongo.db,
      collection: "actions",
      query: { workflow_id: "w1" },
      tenant: null,
    });
    expect(docs.map((d) => d._id).sort()).toEqual(["a1", "a2"]);
  });
});
