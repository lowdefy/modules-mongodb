/**
 * The change stream's recipient match (requests/match-recipient-change.yaml)
 * must pick the same records as the shared one (requests/match-recipient.yaml).
 * Both run here against the same records: the shared clauses on the records,
 * the change-stream clauses on the records wrapped as change events.
 */
import { readFileSync } from "fs";
import { dirname, join, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

import inMemoryMongo from "../../../plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js";

const moduleRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

function clauses(file, user) {
  const resolve = (value) => {
    if (Array.isArray(value)) return value.map(resolve);
    if (value === null || typeof value !== "object") return value;
    if (value._user) return user?.[value._user] ?? null;
    if (value._if_none) {
      const [candidate, fallback] = resolve(value._if_none);
      return candidate ?? fallback;
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolve(v)]),
    );
  };
  return resolve(
    loadYaml(readFileSync(join(moduleRoot, "requests", file), "utf8")),
  );
}

const records = [
  { _id: "by-user-id", contact_id: "C-1", user_id: "U-1" },
  { _id: "by-contact-id", contact_id: "U-1", user_id: null },
  { _id: "legacy", contact_id: "U-1" },
  { _id: "login-less", contact_id: "C-2", user_id: null },
  { _id: "other", contact_id: "C-3", user_id: "U-2" },
];

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
  await mongo.db.collection("records").insertMany(records);
  await mongo.db
    .collection("events")
    .insertMany(records.map((doc) => ({ _id: doc._id, fullDocument: doc })));
});

afterAll(async () => {
  await mongo.cleanup();
});

async function ids(collection, file, user) {
  const found = await mongo.db
    .collection(collection)
    .find({ $or: clauses(file, user) })
    .sort({ _id: 1 })
    .toArray();
  return found.map((doc) => doc._id);
}

test.each([
  ["a signed-in user", { id: "U-1" }],
  ["another user", { id: "U-2" }],
  ["no session", undefined],
])(
  "the change stream matches the same records as the inbox for %s",
  async (_, user) => {
    const shared = await ids("records", "match-recipient.yaml", user);
    const change = await ids("events", "match-recipient-change.yaml", user);
    expect(change).toEqual(shared);
  },
);

test("without a session nothing matches", async () => {
  expect(await ids("events", "match-recipient-change.yaml", undefined)).toEqual(
    [],
  );
});
