/**
 * Runs the inbox's list, rail-count and mark-all requests against a real
 * MongoDB, with the Lowdefy operators they use resolved here, to pin that the
 * inbox filter (requests/stages/filter-conditions.yaml) narrows the list and
 * Mark all as read to the same records, and only the caller's own.
 */
import { readFileSync } from "fs";
import { dirname, join, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

import inMemoryMongo from "../../../plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js";

const moduleRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const appName = "test-app";

function readYaml(relativePath) {
  return loadYaml(readFileSync(join(moduleRoot, relativePath), "utf8"));
}

const getPath = (object, path) =>
  String(path)
    .split(".")
    .reduce((value, key) => (value == null ? undefined : value[key]), object);

// Resolves the operators these requests use. Anything else throws, so a new
// operator in a request fails the test instead of passing through unresolved.
function resolve(value, ctx) {
  if (Array.isArray(value)) return value.map((v) => resolve(v, ctx));
  if (value === null || typeof value !== "object") return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0].startsWith("_") && keys[0] !== "_id") {
    const [op] = keys;
    const params = value[op];
    const r = (v) => resolve(v, ctx);
    switch (op) {
      case "_ref":
        return r(readYaml(params));
      case "_user":
        return ctx.user?.[params] ?? null;
      case "_payload":
        return getPath(ctx.payload, params) ?? null;
      case "_if_none": {
        const [candidate, fallback] = r(params);
        return candidate ?? fallback;
      }
      case "_if":
        return r(params.test) ? r(params.then) : r(params.else);
      case "_eq": {
        const [a, b] = r(params);
        return a === b;
      }
      case "_ne": {
        const [a, b] = r(params);
        return a !== b;
      }
      case "_gt": {
        const [a, b] = r(params);
        return a > b;
      }
      case "_array.concat":
        return [].concat(...r(params));
      case "_array.length":
        return r(params).length;
      case "_string.trim":
        return r(params).trim();
      case "_string.toLowerCase":
        return r(params).toLowerCase();
      default:
        throw new Error(`Unhandled operator ${op}`);
    }
  }
  return Object.fromEntries(keys.map((key) => [key, resolve(value[key], ctx)]));
}

const me = { id: "U-1" };

const records = [
  { _id: "a1", type: "quote-approved", title: "Quote approved", read: false },
  // An app's own insert carrying both: the notification id wins.
  {
    _id: "a2",
    type: "quote-approved",
    event_type: "action-approve",
    title: "Second quote approved",
    read: false,
  },
  { _id: "a3", type: "quote-approved", title: "Old approval", read: true },
  {
    _id: "s1",
    type: "support-reply",
    title: "Reply on ENC-162",
    preview: "Fixed the CSV (export.*) bug",
    read: false,
  },
  // Legacy record: only event_type, description instead of preview.
  {
    _id: "l1",
    event_type: "support-reply",
    title: "Legacy reply",
    description: "Price $title check",
    read: false,
  },
  // Another user's approval.
  {
    _id: "o1",
    type: "quote-approved",
    title: "Someone else's",
    user_id: "U-2",
    contact_id: "C-2",
    read: false,
  },
].map((record) => ({
  user_id: "U-1",
  contact_id: "C-1",
  ...record,
  created: { app_name: appName, timestamp: new Date() },
}));

let mongo;
let collection;

beforeAll(async () => {
  mongo = await inMemoryMongo();
  collection = mongo.db.collection("notifications");
});

beforeEach(async () => {
  await collection.deleteMany({});
  await collection.insertMany(records);
});

afterAll(async () => {
  await mongo.cleanup();
});

async function list(filter, user = me) {
  const request = readYaml("requests/get-notifications.yaml");
  const pipeline = resolve(request.properties.pipeline, {
    user,
    payload: {
      filter,
      pagination: { skip: 0, pageSize: 1000 },
      app_name: appName,
    },
  });
  const [result] = await collection.aggregate(pipeline).toArray();
  return {
    ids: result.notifications.map((n) => n._id).sort(),
    total: result.total_count[0]?.total ?? 0,
    unread: result.unread_count[0]?.total ?? 0,
    first: result.notifications[0],
  };
}

async function markAll(filter, user = me) {
  const request = readYaml("requests/update-notifications.yaml");
  const props = resolve(request.properties, {
    user,
    payload: { filter, app_name: appName },
  });
  await collection.updateMany(props.filter, props.update);
  const unread = await collection
    .find({ read: false }, { projection: { _id: 1 } })
    .toArray();
  return unread.map((r) => r._id).sort();
}

test("status unread, all and read narrow the list", async () => {
  expect((await list({ status: "unread" })).ids).toEqual([
    "a1",
    "a2",
    "l1",
    "s1",
  ]);
  expect((await list({ status: "all" })).total).toBe(5);
  expect((await list({ status: "read" })).ids).toEqual(["a3"]);
});

test("a view's types match type before event_type, legacy records by event_type", async () => {
  expect(
    (await list({ status: "all", types: ["quote-approved"] })).ids,
  ).toEqual(["a1", "a2", "a3"]);
  expect(
    (await list({ status: "all", types: ["action-approve"] })).ids,
  ).toEqual([]);
  expect((await list({ status: "all", types: ["support-reply"] })).ids).toEqual(
    ["l1", "s1"],
  );
});

test("search is a case-insensitive substring of title, preview or description, taken literally", async () => {
  expect((await list({ status: "all", search: "  APPROVED " })).ids).toEqual([
    "a1",
    "a2",
  ]);
  expect((await list({ status: "all", search: "export.*" })).ids).toEqual([
    "s1",
  ]);
  expect((await list({ status: "all", search: "$title" })).ids).toEqual(["l1"]);
  expect((await list({ status: "all", search: "" })).total).toBe(5);
});

test("unread_count ignores the status but follows the other filters", async () => {
  const result = await list({ status: "read", types: ["quote-approved"] });
  expect(result.ids).toEqual(["a3"]);
  expect(result.unread).toBe(2);
});

test("the list returns list fields only", async () => {
  const { first } = await list({ status: "all", types: ["support-reply"] });
  expect(Object.keys(first).sort()).toEqual(
    expect.not.arrayContaining(["body", "data", "contact", "user_id"]),
  );
});

test("mark all as read in a view marks only that view's unread records of the caller", async () => {
  expect(
    await markAll({ status: "unread", types: ["quote-approved"] }),
  ).toEqual(["l1", "o1", "s1"]);
});

test("mark all as read with a search marks only the matches", async () => {
  expect(await markAll({ status: "unread", search: "reply" })).toEqual([
    "a1",
    "a2",
    "o1",
  ]);
});

test("mark all as read with no filter marks every unread record of the caller and no one else's", async () => {
  expect(await markAll({ status: "unread" })).toEqual(["o1"]);
});

test("mark all as read without a session marks nothing", async () => {
  expect(await markAll({ status: "unread" }, null)).toEqual([
    "a1",
    "a2",
    "l1",
    "o1",
    "s1",
  ]);
});

test("rail counts group by type before event_type", async () => {
  const request = readYaml("requests/get-notification-facets.yaml");
  const pipeline = resolve(request.properties.pipeline, {
    user: me,
    payload: { app_name: appName },
  });
  expect(await collection.aggregate(pipeline).toArray()).toEqual([
    { _id: "quote-approved", total: 3, unread: 2 },
    { _id: "support-reply", total: 2, unread: 2 },
  ]);
});
