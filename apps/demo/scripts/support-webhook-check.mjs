// Posts signed webhook deliveries to a running demo dev server and checks what the
// support module's webhook stores and notifies. Lowdefy's e2e server has no
// webhook route, so this runs against `lowdefy dev` instead.
//
//   node scripts/support-webhook-check.mjs <app url> <mongodb uri> <webhook secret>
//
// The dev server must run with the same MONGODB_URI and SUPPORT_WEBHOOK_SECRET.
// It seeds and removes rows of its own (ids starting webhook-check-), and refuses
// a database that is not on this machine.
import { createHmac, randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

const [appUrl, mongoUri, secret] = process.argv.slice(2);
if (!appUrl || !mongoUri || !secret) {
  console.error(
    "Usage: node scripts/support-webhook-check.mjs <app url> <mongodb uri> <webhook secret>",
  );
  process.exit(2);
}
const host = new URL(mongoUri.replace(/^mongodb(\+srv)?:/, "http:")).hostname;
if (!["127.0.0.1", "localhost"].includes(host)) {
  console.error(
    `Refusing ${host}: the check writes test rows, so it runs on a local database only.`,
  );
  process.exit(2);
}

const WEBHOOK = `${appUrl}/api/endpoints/support/webhook`;
const RUN = randomUUID().slice(0, 8);
const USER_ID = `webhook-check-user-${RUN}`;
const ORG_USER_ID = `webhook-check-org-user-${RUN}`;

const client = new MongoClient(mongoUri);
await client.connect();
const db = client.db();
const tickets = db.collection("support-tickets");
const notifications = db.collection("notifications");
const users = db.collection("users");

const failures = [];
function check(name, ok, detail) {
  console.log(
    `${ok ? "pass" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`,
  );
  if (!ok) failures.push(name);
}

function sign(
  body,
  { timestamp = Math.floor(Date.now() / 1000), key = secret } = {},
) {
  const signature = createHmac("sha256", key)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return { timestamp: String(timestamp), signature: `sha256=${signature}` };
}

async function deliver(payload, options) {
  const body = JSON.stringify(payload);
  const { timestamp, signature } = sign(body, options);
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "pelican-timestamp": timestamp,
      "pelican-signature": signature,
    },
    body,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const message = (id, from, text, extra = {}) => ({
  id: `webhook-check-${RUN}-${id}`,
  from,
  author: {
    name: from === "team" ? "Ann Team" : "Jane Reporter",
    initials: "AT",
  },
  at: "2026-10-07T10:00:00.000Z",
  text,
  files: [],
  deleted: false,
  ...extra,
});

const view = (id, version, messages) => ({
  id: `webhook-check-${RUN}-${id}`,
  key: `CHK-${id}`,
  title: `Webhook check ${id}`,
  type: "bug",
  version,
  stage: "In progress",
  created: "2026-10-07T09:00:00.000Z",
  updated: `2026-10-07T10:0${version}:00.000Z`,
  messages,
});

const delivery = (event, userId, ticket) => ({
  event,
  at: new Date().toISOString(),
  delivery_id: randomUUID(),
  user_id: userId,
  ticket,
});

const repliesFor = (ticketId) =>
  notifications
    .find({
      type: "support/support-reply",
      key: { $regex: `^support-reply:webhook-check-${RUN}-` },
      "data.links.button.urlQuery.ticket": ticketId,
    })
    .toArray();

try {
  await notifications.createIndex(
    { key: 1 },
    {
      unique: true,
      partialFilterExpression: { key: { $type: "string" } },
      name: "notification_key_unique",
    },
  );
  await users.insertMany([
    { _id: USER_ID, email: `jane-${RUN}@example.com`, name: "Jane Reporter" },
    { _id: ORG_USER_ID, email: `sam-${RUN}@example.com`, name: "Sam Reporter" },
  ]);

  // test: verified, answers 200, writes nothing.
  const before = await tickets.countDocuments();
  const test = await deliver({
    event: "test",
    at: new Date().toISOString(),
    delivery_id: randomUUID(),
    user_id: null,
    ticket: null,
  });
  check("test answers 200", test.status === 200, test);
  check("test writes nothing", (await tickets.countDocuments()) === before);

  // A bad signature and a stale timestamp answer 401.
  const t1 = view("T1", 2, [
    message("m1", "reporter", "The report page is blank."),
    message("m2", "team", "Which browser are you on?"),
    message("m3", "team", "x".repeat(260)),
  ]);
  const bad = await deliver(delivery("ticket.message", USER_ID, t1), {
    key: "not-the-secret",
  });
  check("a bad signature answers 401", bad.status === 401, bad);
  const stale = await deliver(delivery("ticket.message", USER_ID, t1), {
    timestamp: Math.floor(Date.now() / 1000) - 360,
  });
  check("a six-minute-old timestamp answers 401", stale.status === 401, stale);
  check(
    "a refused delivery writes nothing",
    (await tickets.countDocuments({ _id: t1.id })) === 0,
  );

  // A malformed body is refused with 400.
  const malformed = await deliver({
    event: "ticket.message",
    user_id: USER_ID,
    ticket: { id: t1.id },
  });
  check(
    "a ticket without a version answers 400",
    malformed.status === 400,
    malformed,
  );

  // A ticket.message for a ticket the copy lacks creates the row and notifies once per team message.
  const first = await deliver(delivery("ticket.message", USER_ID, t1));
  check("ticket.message answers 200", first.status === 200, first);
  const row = await tickets.findOne({ _id: t1.id });
  check(
    "the row is created for the body's user",
    row?.user_id === USER_ID,
    row,
  );
  check(
    "the row holds the view",
    row?.view?.version === 2 && row?.view?.messages?.length === 3,
    row?.view,
  );
  check(
    "a new row has no organisation",
    row?.organization === null,
    row?.organization,
  );
  let replies = await repliesFor(t1.key);
  check(
    "one notification per team message",
    replies.length === 2,
    replies.map((r) => r.key),
  );
  const reply = replies.find(
    (r) => r.key === `support-reply:${t1.messages[1].id}`,
  );
  check(
    "the notification goes to the app's email for the user",
    reply?.email === `jane-${RUN}@example.com`,
    reply?.email,
  );
  check(
    "the notification names the user",
    reply?.user_id === USER_ID,
    reply?.user_id,
  );
  check(
    "the button opens the ticket on the support page",
    reply?.data?.links?.button?.pageId === "support/support",
    reply?.data?.links,
  );
  const long = replies.find(
    (r) => r.key === `support-reply:${t1.messages[2].id}`,
  );
  check(
    "the preview stops at 200 characters",
    long?.data?.preview?.length === 200,
    long?.data?.preview?.length,
  );

  // The same delivery again sends nothing and changes nothing.
  const again = await deliver(delivery("ticket.message", USER_ID, t1));
  check("a repeat answers 200", again.status === 200, again);
  const rowAgain = await tickets.findOne({ _id: t1.id });
  check(
    "a repeat changes nothing",
    JSON.stringify(rowAgain) === JSON.stringify(row),
  );
  replies = await repliesFor(t1.key);
  check("a repeat sends nothing", replies.length === 2, replies.length);

  // A lower version leaves the row.
  const older = view("T1", 1, [
    message("m1", "reporter", "The report page is blank."),
  ]);
  const lower = await deliver(delivery("ticket.message", USER_ID, older));
  check("a lower version answers 200", lower.status === 200, lower);
  check(
    "a lower version leaves the row",
    (await tickets.findOne({ _id: t1.id }))?.view?.version === 2,
  );

  // A deleted message is stored as deleted; the thread shows it as Removed.
  const t1Deleted = view("T1", 3, [
    t1.messages[0],
    { ...t1.messages[1], text: null, deleted: true },
    t1.messages[2],
  ]);
  const deleted = await deliver(
    delivery("ticket.message_deleted", USER_ID, t1Deleted),
  );
  check("ticket.message_deleted answers 200", deleted.status === 200, deleted);
  const deletedRow = await tickets.findOne({ _id: t1.id });
  const removed = deletedRow?.view?.messages?.[1];
  check(
    "the message is stored as deleted",
    removed?.deleted === true && removed?.text === null,
    removed,
  );
  check("a deletion sends nothing", (await repliesFor(t1.key)).length === 2);

  // A new team message on a row filed from an organisation dispatches bound to it.
  // The demo's pinned policy walls nothing, so the record carries no organization_id
  // here; under policy: tenant the wall stamps it.
  const t2v1 = view("T2", 1, [message("o1", "reporter", "Export fails.")]);
  await tickets.insertOne({
    _id: t2v1.id,
    user_id: ORG_USER_ID,
    organization: { id: "demo", name: "Demo" },
    read_at: null,
    view: t2v1,
  });
  const t2v2 = view("T2", 2, [
    ...t2v1.messages,
    message("o2", "team", "Fixed in the next release."),
  ]);
  const orgReply = await deliver(delivery("ticket.message", ORG_USER_ID, t2v2));
  check(
    "a reply on an organisation's ticket answers 200",
    orgReply.status === 200,
    orgReply,
  );
  const orgReplies = await repliesFor(t2v2.key);
  check(
    "the bound dispatch notifies once",
    orgReplies.length === 1,
    orgReplies.length,
  );
  check(
    "the row keeps its organisation",
    (await tickets.findOne({ _id: t2v2.id }))?.organization?.id === "demo",
  );

  // Another event writes the view without notifying.
  const t2v3 = { ...t2v2, version: 3, stage: "Resolved" };
  const stage = await deliver(delivery("ticket.stage", ORG_USER_ID, t2v3));
  check("ticket.stage answers 200", stage.status === 200, stage);
  check(
    "ticket.stage writes the view",
    (await tickets.findOne({ _id: t2v3.id }))?.view?.stage === "Resolved",
  );
} finally {
  await tickets.deleteMany({ _id: { $regex: `^webhook-check-${RUN}-` } });
  await notifications.deleteMany({
    key: { $regex: `^support-reply:webhook-check-${RUN}-` },
  });
  await users.deleteMany({ _id: { $in: [USER_ID, ORG_USER_ID] } });
  await client.close();
}

console.log(
  failures.length === 0
    ? "\nAll checks passed."
    : `\n${failures.length} failed.`,
);
process.exit(failures.length === 0 ? 0 : 1);
