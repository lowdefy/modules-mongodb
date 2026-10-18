// Posts signed release.announced deliveries to a running server's support webhook and
// checks what the release-notes module stores and delivers: the answer and its time,
// the note and recipient rows, the release-note notifications, a repeat delivery, a
// second release of the same version, the email switches, a stalled chain the sweep
// finishes, a media file whose copy fails, and media sent with no url or content type. Runs against apps/demo (policy pinned)
// or apps/tenant-demo (policy tenant), served with `lowdefy dev` or `lowdefy start`.
//
//   node scripts/release-announced-check.mjs <app url> <mongodb uri> <webhook secret> <cron secret> <pinned|tenant>
//
// The server must run with the same MONGODB_URI, SUPPORT_WEBHOOK_SECRET and CRON_SECRET,
// and the notifications collection needs its unique index on key (see the notifications
// docs). It seeds and removes rows of its own (ids starting announced-check-), and
// refuses a database that is not on this machine.
import { createHmac, randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

const [appUrl, mongoUri, secret, cronSecret, policy] = process.argv.slice(2);
if (
  !appUrl ||
  !mongoUri ||
  !secret ||
  !cronSecret ||
  !["pinned", "tenant"].includes(policy)
) {
  console.error(
    "Usage: node scripts/release-announced-check.mjs <app url> <mongodb uri> <webhook secret> <cron secret> <pinned|tenant>",
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
const PREFIX = `announced-check-${RUN}-`;
const id = (name) => `${PREFIX}${name}`;
const REPOSITORY = `${PREFIX}org/app`;

const client = new MongoClient(mongoUri);
await client.connect();
const db = client.db();
const users = db.collection("users");
const members = db.collection("user-members");
const organizations = db.collection("user-organizations");
const preferences = db.collection("release-notes-preferences");
const notes = db.collection("release-notes");
const recipients = db.collection("release-notes-recipients");
const notifications = db.collection("notifications");

const failures = [];
function check(name, ok, detail) {
  console.log(
    `${ok ? "pass" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`,
  );
  if (!ok) failures.push(name);
}

async function deliver(payload) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const started = Date.now();
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "pelican-timestamp": timestamp,
      "pelican-signature": `sha256=${signature}`,
    },
    body,
  });
  return {
    status: res.status,
    body: await res.json().catch(() => null),
    ms: Date.now() - started,
  };
}

// The sweep is an InternalApi a schedule calls; the detached route runs it the same way.
async function sweep() {
  const res = await fetch(`${appUrl}/api/detached/release-notes/sweep`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({
      payload: {},
      principal: {
        user: null,
        system: true,
        organizationId: null,
        agent: null,
      },
      credentials: [],
    }),
  });
  return res.status;
}

const release = (version, extra = {}) => ({
  id: id(`release-${version}`),
  repository: REPOSITORY,
  version,
  released_at: "2026-10-18T00:00:00.000Z",
  title: `Release ${version}`,
  preview: `What changed in ${version}.`,
  body: `Some $dollar text and [[file:shot.png]] in ${version}.`,
  media: [],
  ...extra,
});
const announce = ({ version, audience, email = true, extra }) =>
  deliver({
    event: "release.announced",
    at: new Date().toISOString(),
    delivery_id: id(`delivery-${randomUUID().slice(0, 4)}`),
    release: release(version, extra),
    audience,
    email,
  });
const noteId = (version) => `${REPOSITORY}@${version}`;
const notices = (version) =>
  notifications
    .find({
      key: {
        $regex: `^release-note:${noteId(version).replace(/[.]/g, "\\.")}:`,
      },
    })
    .toArray();

async function waitFor(name, test, seconds = 120) {
  const until = Date.now() + seconds * 1000;
  let last;
  while (Date.now() < until) {
    last = await test();
    if (last === true) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  check(name, false, last);
  return false;
}

const at = (minutes) => new Date(Date.UTC(2026, 0, 1, 0, minutes));
const member = (name, user, organizationId, extra, minutes) => ({
  _id: id(`member-${name}`),
  user_id: id(user),
  organization_id: organizationId,
  role: "member",
  app_roles: [],
  attributes: {},
  created_at: at(minutes),
  ...extra,
});

let O1;
let O2;
let O3;
if (policy === "pinned") {
  const pinned = await organizations.findOne({ slug: "demo" });
  if (!pinned) {
    console.error(
      "The pinned organisation (slug demo) is not in the database yet.",
    );
    process.exit(2);
  }
  O1 = pinned._id;
  O2 = pinned._id;
  O3 = pinned._id;
} else {
  O1 = id("org-1");
  O2 = id("org-2");
  O3 = id("org-3");
}
// Everyone in this check: team "check" marks the check's own members.
const audiences = {
  audiences: ["team-alpha"],
  organizations: { mode: "all", ids: [] },
};

try {
  if (policy === "tenant") {
    await organizations.insertMany([
      { _id: O1, name: `Check 1 ${RUN}`, slug: id("1") },
      { _id: O2, name: `Check 2 ${RUN}`, slug: id("2") },
      { _id: O3, name: `Check 3 ${RUN}`, slug: id("3") },
    ]);
  }
  // 1000 people with no address, spread over the organisations, so the bells fill
  // without mail being sent. Then: multi, in all three organisations (earliest O2);
  // optout, who turned email off; mailed, with an address.
  const bulkUsers = Array.from({ length: 1000 }, (_, index) => ({
    _id: id(`bulk-${index}`),
    name: `Bulk ${index}`,
  }));
  await users.insertMany([
    ...bulkUsers,
    { _id: id("multi"), name: "Multi", email: `multi-${RUN}@example.com` },
    { _id: id("optout"), name: "Optout", email: `optout-${RUN}@example.com` },
    { _id: id("mailed"), name: "Mailed", email: `mailed-${RUN}@example.com` },
  ]);
  const alpha = { attributes: { team: "alpha" } };
  await members.insertMany([
    ...bulkUsers.map((user, index) =>
      member(
        `bulk-${index}`,
        `bulk-${index}`,
        [O1, O2, O3][index % 3],
        alpha,
        10,
      ),
    ),
    // One membership under pinned, where every row is the app's one organisation.
    ...(policy === "tenant"
      ? [
          member("multi-1", "multi", O1, alpha, 30),
          member("multi-2", "multi", O2, alpha, 20),
          member("multi-3", "multi", O3, alpha, 40),
        ]
      : [member("multi-1", "multi", O1, alpha, 30)]),
    member("optout", "optout", O1, alpha, 10),
    member("mailed", "mailed", O1, alpha, 10),
  ]);
  await preferences.insertOne({
    _id: id("optout"),
    email: false,
    updated: new Date(),
  });

  // 1. One announcement to 1003 people answers within 5 seconds; the bells fill after.
  const first = await announce({ version: "1.0.0", audience: audiences });
  check("release.announced answers 2xx", first.status === 200, first);
  check("it answers within 5 seconds", first.ms < 5000, { ms: first.ms });
  check(
    "it counts the people notified, emailed and opted out",
    first.body?.notified === 1003 &&
      first.body?.emailed === 2 &&
      first.body?.opted_out === 1,
    first.body,
  );
  const note = await notes.findOne({ _id: noteId("1.0.0") });
  check(
    "the note is stored under {repository}@{version} with its body as sent",
    note?.title === "Release 1.0.0" &&
      note?.body === "Some $dollar text and [[file:shot.png]] in 1.0.0." &&
      note?.created?.timestamp instanceof Date,
    note,
  );
  check(
    "a recipient row per person",
    (await recipients.countDocuments({ note_id: noteId("1.0.0") })) === 1003,
  );
  if (
    await waitFor(
      "every person gets a notification",
      async () => {
        const found = await notices("1.0.0");
        return found.length === 1003 || { notices: found.length };
      },
      300,
    )
  ) {
    check("every person gets a notification", true);
  }
  const rowsLeft = await recipients.countDocuments({
    note_id: noteId("1.0.0"),
    notified: false,
  });
  check("every recipient row is marked notified", rowsLeft === 0, { rowsLeft });
  const multi = await notifications
    .find({ key: `release-note:${noteId("1.0.0")}:${id("multi")}` })
    .toArray();
  check(
    "a person in three organisations gets one notification",
    multi.length === 1,
    multi.length,
  );
  if (policy === "tenant") {
    check(
      "in their earliest membership's organisation",
      multi[0]?.organization_id === O2,
      multi[0]?.organization_id,
    );
  }
  const optout = await notifications.findOne({
    key: `release-note:${noteId("1.0.0")}:${id("optout")}`,
  });
  const mailed = await notifications.findOne({
    key: `release-note:${noteId("1.0.0")}:${id("mailed")}`,
  });
  check(
    "an opted-out person gets a bell and no email",
    optout?.send_email === false,
    optout?.send_email,
  );
  check(
    "a person with email on is emailed",
    mailed?.send_email === true,
    mailed?.send_email,
  );
  check(
    "the notice carries the headline and a link to What's new",
    mailed?.title === "Release 1.0.0" &&
      mailed?.data?.links?.button?.urlQuery?.note === noteId("1.0.0"),
    { title: mailed?.title, links: mailed?.data?.links },
  );

  // 2. The same delivery again adds nothing and answers zeros.
  const repeat = await announce({ version: "1.0.0", audience: audiences });
  check(
    "a repeated delivery answers zeros",
    repeat.status === 200 &&
      repeat.body?.notified === 0 &&
      repeat.body?.emailed === 0 &&
      repeat.body?.opted_out === 0,
    repeat,
  );
  await new Promise((resolve) => setTimeout(resolve, 5000));
  check(
    "and adds no rows or notifications",
    (await recipients.countDocuments({ note_id: noteId("1.0.0") })) === 1003 &&
      (await notices("1.0.0")).length === 1003,
  );

  // 3. A second release of the same version keeps the first note and reaches only
  // the people not owed it yet.
  await users.insertOne({
    _id: id("late"),
    name: "Late",
    email: `late-${RUN}@example.com`,
  });
  await members.insertOne(member("late", "late", O3, alpha, 50));
  const second = await announce({
    version: "1.0.0",
    audience: audiences,
    extra: { id: id("other-space-release"), title: "Another space's headline" },
  });
  check(
    "a second release of the version notifies only the new person",
    second.body?.notified === 1,
    second,
  );
  check(
    "the first release's note stays",
    (await notes.findOne({ _id: noteId("1.0.0") }))?.title === "Release 1.0.0",
  );
  if (
    await waitFor("the new person gets a notification", async () => {
      const found = await notices("1.0.0");
      return found.length === 1004 || { notices: found.length };
    })
  ) {
    check("the new person gets a notification", true);
  }

  // 4. email: false gives every person a bell and no email.
  const quiet = await announce({
    version: "1.1.0",
    audience: {
      audiences: ["team-alpha"],
      organizations: { mode: "only", ids: [O1] },
    },
    email: false,
  });
  check("email: false emails nobody", quiet.body?.emailed === 0, quiet.body);
  await waitFor("email: false still rings the bells", async () => {
    const found = await notices("1.1.0");
    return (
      (found.length === quiet.body?.notified && found.length > 0) || {
        notices: found.length,
      }
    );
  });
  const quietMailed = await notifications.findOne({
    key: `release-note:${noteId("1.1.0")}:${id("mailed")}`,
  });
  check(
    "with send_email false",
    quietMailed?.send_email === false,
    quietMailed?.send_email,
  );

  // 5. A chain that stopped: rows not notified, one of them already notified before
  // the stop, and no deliver call for 20 minutes. The sweep finishes it, once each.
  const stalled = noteId("1.2.0");
  const old = new Date(Date.now() - 20 * 60 * 1000);
  await notes.insertOne({
    ...release("1.2.0"),
    _id: stalled,
    release_id: id("release-1.2.0"),
    media: [],
    created: { timestamp: old },
    updated: { timestamp: old },
    delivering_at: old,
  });
  const stalledPeople = ["multi", "optout", "mailed", "late"];
  await recipients.insertMany(
    stalledPeople.map((person) => ({
      _id: `${stalled}:${id(person)}`,
      note_id: stalled,
      user_id: id(person),
      organization_id: policy === "pinned" ? null : O1,
      email: true,
      notified: false,
      opened_at: null,
      created: old,
    })),
  );
  // multi's notice went out before the chain stopped.
  await notifications.insertOne({
    _id: id("pre-sent"),
    key: `release-note:${stalled}:${id("multi")}`,
    type: "release-notes/release-note",
    contact_id: id("multi"),
    user_id: id("multi"),
    created: { timestamp: old },
    ...(policy === "tenant" ? { organization_id: O1 } : {}),
  });
  check("the sweep answers", (await sweep()) === 202);
  if (
    await waitFor("the sweep finishes a stalled chain", async () => {
      const left = await recipients.countDocuments({
        note_id: stalled,
        notified: false,
      });
      return left === 0 || { left };
    })
  ) {
    check("the sweep finishes a stalled chain", true);
  }
  const stalledNotices = await notices("1.2.0");
  check(
    "with one notification per person",
    stalledNotices.length === 4 &&
      new Set(stalledNotices.map((notice) => notice.key)).size === 4,
    stalledNotices.length,
  );

  // 6. A media file whose copy fails is logged and left; the notices still go.
  const withMedia = await announce({
    version: "1.3.0",
    audience: {
      audiences: ["team-alpha"],
      organizations: { mode: "only", ids: [O3] },
    },
    extra: {
      media: [
        {
          name: "shot.png",
          content_type: "image/png",
          url: "https://127.0.0.1/shot.png",
        },
      ],
    },
  });
  check(
    "an announcement with media answers 2xx",
    withMedia.status === 200,
    withMedia,
  );
  await waitFor("its notices go though the copy fails", async () => {
    const found = await notices("1.3.0");
    return (
      (found.length === withMedia.body?.notified && found.length > 0) || {
        notices: found.length,
      }
    );
  });
  const mediaNote = await notes.findOne({ _id: noteId("1.3.0") });
  check(
    "the file keeps its public key and stays not copied",
    mediaNote?.media?.[0]?.key ===
      `release-notes/${noteId("1.3.0")}/shot.png` &&
      mediaNote?.media?.[0]?.copied === false,
    mediaNote?.media,
  );

  // The sweep restarts a note whose media copy is still owed, once no deliver
  // call has worked on it for 10 minutes.
  await notes.updateOne(
    { _id: noteId("1.3.0") },
    { $set: { "updated.timestamp": old, delivering_at: old } },
  );
  check("the sweep answers again", (await sweep()) === 202);
  if (
    await waitFor("the sweep retries a media copy still owed", async () => {
      const found = await notes.findOne({ _id: noteId("1.3.0") });
      return (
        found.delivering_at > old || { delivering_at: found.delivering_at }
      );
    })
  ) {
    check("the sweep retries a media copy still owed", true);
  }

  // 7. Media Pelican cannot link (no url) or type (no content_type) is stored as not
  // copied and skipped, and the announcement still goes. A later delivery that
  // brings both refreshes them.
  const unlinked = await announce({
    version: "1.4.0",
    audience: {
      audiences: ["team-alpha"],
      organizations: { mode: "only", ids: [O3] },
    },
    extra: {
      media: [
        {
          name: "a.png",
          content_type: null,
          url: "https://127.0.0.1/a.png",
        },
        { name: "b.mp4", content_type: "video/mp4", url: null },
      ],
    },
  });
  check(
    "media with no url or content type answers 2xx with counts",
    unlinked.status === 200 && unlinked.body?.notified > 0,
    unlinked,
  );
  await waitFor("its notices go", async () => {
    const found = await notices("1.4.0");
    return (
      (found.length === unlinked.body?.notified && found.length > 0) || {
        notices: found.length,
      }
    );
  });
  const unlinkedNote = await notes.findOne({ _id: noteId("1.4.0") });
  const fileNamed = (found, name) =>
    found?.media?.find((file) => file.name === name);
  check(
    "each such file is stored as not copied",
    fileNamed(unlinkedNote, "a.png")?.content_type === null &&
      fileNamed(unlinkedNote, "a.png")?.copied === false &&
      fileNamed(unlinkedNote, "b.mp4")?.source_url === null &&
      fileNamed(unlinkedNote, "b.mp4")?.copied === false,
    unlinkedNote?.media,
  );
  // The sweep leaves a note whose only media owed cannot be fetched.
  await notes.updateOne(
    { _id: noteId("1.4.0") },
    { $set: { "updated.timestamp": old, delivering_at: old } },
  );
  check("the sweep answers a third time", (await sweep()) === 202);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const unswept = await notes.findOne({ _id: noteId("1.4.0") });
  check(
    "and leaves media with no url or content type alone",
    unswept?.delivering_at?.getTime() === old.getTime(),
    { delivering_at: unswept?.delivering_at },
  );
  const linked = await announce({
    version: "1.4.0",
    audience: {
      audiences: ["team-alpha"],
      organizations: { mode: "only", ids: [O3] },
    },
    extra: {
      media: [
        {
          name: "a.png",
          content_type: "image/png",
          url: "https://127.0.0.1/a-later.png",
        },
        {
          name: "b.mp4",
          content_type: "video/mp4",
          url: "https://127.0.0.1/b.mp4",
        },
      ],
    },
  });
  const relinked = await notes.findOne({ _id: noteId("1.4.0") });
  check(
    "a later delivery fills in the url and content type",
    linked.status === 200 &&
      fileNamed(relinked, "a.png")?.content_type === "image/png" &&
      fileNamed(relinked, "a.png")?.source_url ===
        "https://127.0.0.1/a-later.png" &&
      fileNamed(relinked, "b.mp4")?.source_url === "https://127.0.0.1/b.mp4",
    relinked?.media,
  );

  const bad = await deliver({
    event: "release.announced",
    at: new Date().toISOString(),
    release: { repository: REPOSITORY },
    audience: audiences,
  });
  check("a release with no version answers 400", bad.status === 400, bad);
} finally {
  const prefix = { $regex: `^${PREFIX}` };
  await members.deleteMany({ _id: prefix });
  await users.deleteMany({ _id: prefix });
  await organizations.deleteMany({ _id: prefix });
  await preferences.deleteMany({ _id: prefix });
  await notes.deleteMany({ _id: prefix });
  await recipients.deleteMany({ note_id: prefix });
  await notifications.deleteMany({
    key: { $regex: `^release-note:${PREFIX}` },
  });
  await notifications.deleteMany({ _id: prefix });
  await client.close();
}

console.log(
  failures.length === 0
    ? "\nAll checks passed."
    : `\n${failures.length} failed.`,
);
process.exit(failures.length === 0 ? 0 : 1);
