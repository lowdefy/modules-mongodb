import inMemoryMongo from "../shared/inMemoryMongo.js";
import insertOneDoc from "./insertOneDoc.js";

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("events").deleteMany({});
});

test("inserts a doc and returns the inserted id", async () => {
  const id = await insertOneDoc({
    mongoDb: mongo.db,
    collection: "events",
    doc: { _id: "e1", type: "workflow-started" },
  });
  expect(id).toBe("e1");
  expect(
    await mongo.db.collection("events").findOne({ _id: "e1" }),
  ).toMatchObject({
    type: "workflow-started",
  });
});

describe("tenant scoping", () => {
  const tenant = { field: "organizationId", value: "org-a" };

  test("stamps the tenant field onto the inserted doc", async () => {
    await insertOneDoc({
      mongoDb: mongo.db,
      collection: "events",
      doc: { _id: "e1", type: "workflow-started" },
      tenant,
    });
    expect(
      await mongo.db.collection("events").findOne({ _id: "e1" }),
    ).toMatchObject({ organizationId: "org-a" });
  });

  test("the verdict wins over a caller-authored tenant field", async () => {
    await insertOneDoc({
      mongoDb: mongo.db,
      collection: "events",
      doc: { _id: "e1", organizationId: "org-b" },
      tenant,
    });
    expect(
      (await mongo.db.collection("events").findOne({ _id: "e1" }))
        .organizationId,
    ).toBe("org-a");
  });

  test("null tenant inserts the doc unstamped", async () => {
    await insertOneDoc({
      mongoDb: mongo.db,
      collection: "events",
      doc: { _id: "e1" },
      tenant: null,
    });
    const doc = await mongo.db.collection("events").findOne({ _id: "e1" });
    expect(doc).not.toHaveProperty("organizationId");
  });
});
