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
