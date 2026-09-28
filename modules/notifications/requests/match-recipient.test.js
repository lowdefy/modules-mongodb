/**
 * Runs the module's session-scoped notification queries against a real
 * MongoDB, with the few Lowdefy operators they use resolved here, to pin who
 * counts as a record's recipient (requests/match-recipient.yaml).
 */
import { readFileSync } from "fs";
import { dirname, join, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

import inMemoryMongo from "../../../plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js";

const moduleRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

const publicLinkTypes = ["invite-user", "resend-user-invite", "user-invite"];
const appName = "test-app";

function readYaml(relativePath) {
  return loadYaml(readFileSync(join(moduleRoot, relativePath), "utf8"));
}

// Resolves the operators these requests use. Anything else throws, so a new
// operator in a request fails the test instead of passing through unresolved.
function resolve(value, { user, payload }) {
  if (Array.isArray(value))
    return value.map((v) => resolve(v, { user, payload }));
  if (value === null || typeof value !== "object") return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0].startsWith("_")) {
    const [op] = keys;
    const params = value[op];
    switch (op) {
      case "_ref":
        return resolve(readYaml(params), { user, payload });
      case "_user":
        return user?.[params] ?? null;
      case "_payload":
        return payload[params] ?? null;
      case "_module.var":
        if (params !== "public_link_types")
          throw new Error(`Unexpected var ${params}`);
        return publicLinkTypes;
      case "_if_none": {
        const [candidate, fallback] = resolve(params, { user, payload });
        return candidate ?? fallback;
      }
      default:
        throw new Error(`Unhandled operator ${op}`);
    }
  }
  return Object.fromEntries(
    keys.map((key) => [key, resolve(value[key], { user, payload })]),
  );
}

const records = [
  // Per-organization contact row: contact_id is not the user id.
  {
    _id: "n-contact-row",
    type: "thing-assigned",
    contact_id: "C-1",
    user_id: "U-1",
    read: false,
    popup: true,
  },
  // App whose contact._id IS the user id; user_id not supplied.
  {
    _id: "n-contact-is-user",
    type: "thing-assigned",
    contact_id: "U-1",
    user_id: null,
    read: false,
    popup: true,
  },
  // Written before user_id was stored.
  {
    _id: "n-legacy",
    event_type: "thing-assigned",
    contact_id: "U-1",
    read: false,
    popup: true,
  },
  // Login-less contact.
  {
    _id: "n-login-less",
    type: "thing-assigned",
    contact_id: "C-2",
    user_id: null,
    read: false,
    popup: true,
  },
  // Someone else's.
  {
    _id: "n-other",
    type: "thing-assigned",
    contact_id: "C-3",
    user_id: "U-2",
    read: false,
    popup: true,
  },
  // Pre-auth invite addressed to a login-less contact.
  {
    _id: "n-invite",
    type: "user-invite",
    contact_id: "C-4",
    user_id: null,
    read: false,
    popup: true,
  },
].map((record) => ({ ...record, created: { app_name: appName } }));

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

async function linkResolves({ id, user }) {
  const request = readYaml("requests/get-notification-for-link.yaml");
  const pipeline = resolve(request.properties.pipeline, {
    user,
    payload: { _id: id, app_name: appName },
  });
  const result = await collection.aggregate(pipeline).toArray();
  return result.length === 1;
}

async function inboxIds({ user }) {
  const request = readYaml("requests/get-notifications.yaml");
  // The first stage is the recipient scope; the rest are UI filter stages.
  const [scope] = resolve(request.properties.pipeline.slice(0, 1), {
    user,
    payload: { app_name: appName },
  });
  const result = await collection
    .aggregate([scope, { $sort: { _id: 1 } }])
    .toArray();
  return result.map((record) => record._id);
}

test("landing link resolves for the signed-in user behind a per-organization contact row", async () => {
  expect(await linkResolves({ id: "n-contact-row", user: { id: "U-1" } })).toBe(
    true,
  );
});

test("landing link resolves by contact_id when the app's contact id is the user id", async () => {
  expect(
    await linkResolves({ id: "n-contact-is-user", user: { id: "U-1" } }),
  ).toBe(true);
  expect(await linkResolves({ id: "n-legacy", user: { id: "U-1" } })).toBe(
    true,
  );
});

test("landing link does not resolve for a different signed-in user", async () => {
  expect(await linkResolves({ id: "n-other", user: { id: "U-1" } })).toBe(
    false,
  );
  expect(await linkResolves({ id: "n-login-less", user: { id: "U-1" } })).toBe(
    false,
  );
});

test("landing link without a session does not resolve a login-less contact's record", async () => {
  expect(await linkResolves({ id: "n-login-less", user: undefined })).toBe(
    false,
  );
  expect(await linkResolves({ id: "n-contact-row", user: undefined })).toBe(
    false,
  );
});

test("landing link without a session resolves public link types", async () => {
  expect(await linkResolves({ id: "n-invite", user: undefined })).toBe(true);
});

test("inbox scope returns a user's records by user_id and by contact_id, and nothing else", async () => {
  expect(await inboxIds({ user: { id: "U-1" } })).toEqual([
    "n-contact-is-user",
    "n-contact-row",
    "n-legacy",
  ]);
});

test("inbox scope without a session returns nothing, not the null-user_id records", async () => {
  expect(await inboxIds({ user: undefined })).toEqual([]);
});

test("mark-read updates the record for the user behind a per-organization contact row", async () => {
  const request = readYaml("requests/update-selected-notification.yaml");
  const filter = resolve(request.properties.filter, {
    user: { id: "U-1" },
    payload: { selected_id: "n-contact-row", app_name: appName },
  });
  const result = await collection.updateOne(filter, request.properties.update);
  expect(result.modifiedCount).toBe(1);
});

test("every session-scoped request matches the recipient through match-recipient.yaml", () => {
  const files = [
    "requests/get-notification-for-link.yaml",
    "requests/get-notifications.yaml",
    "requests/get-notification-types.yaml",
    "requests/get-selected-notification.yaml",
    "requests/update-selected-notification.yaml",
    "requests/update-notifications.yaml",
    "components/unread-count-request.yaml",
    "components/popup-notifications-requests.yaml",
  ];
  files.forEach((file) => {
    const source = readFileSync(join(moduleRoot, file), "utf8");
    expect(source).toContain("_ref: requests/match-recipient.yaml");
    expect(source).not.toMatch(/contact_id:\s*\n\s*_user: id/);
  });
});
