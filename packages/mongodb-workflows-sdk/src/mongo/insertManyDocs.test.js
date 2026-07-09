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
