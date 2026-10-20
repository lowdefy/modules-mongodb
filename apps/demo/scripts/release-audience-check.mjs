// Posts signed release.audience deliveries to a running dev server's support webhook
// and checks the counts the release-notes module answers. Runs against `lowdefy dev`
// of apps/demo (policy pinned) or apps/tenant-demo (policy tenant), since Lowdefy's
// e2e server has no webhook route.
//
//   node scripts/release-audience-check.mjs <app url> <mongodb uri> <webhook secret> <pinned|tenant>
//
// The dev server must run with the same MONGODB_URI and SUPPORT_WEBHOOK_SECRET, and
// the app's release-notes audiences must be the demo's (managers, team-alpha). It
// seeds and removes rows of its own (ids starting audience-check-), compares each
// count with the same call made before seeding, and refuses a database that is not
// on this machine.
import { createHmac, randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

const [appUrl, mongoUri, secret, policy] = process.argv.slice(2);
if (!appUrl || !mongoUri || !secret || !["pinned", "tenant"].includes(policy)) {
  console.error(
    "Usage: node scripts/release-audience-check.mjs <app url> <mongodb uri> <webhook secret> <pinned|tenant>",
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
const id = (name) => `audience-check-${RUN}-${name}`;

const client = new MongoClient(mongoUri);
await client.connect();
const db = client.db();
const users = db.collection("users");
const members = db.collection("user-members");
const organizations = db.collection("user-organizations");
const preferences = db.collection("release-notes-preferences");

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

const audience = (selection) =>
  deliver({
    event: "release.audience",
    at: new Date().toISOString(),
    selection,
  });

const count = (answer, audienceId) =>
  answer.body?.audiences?.find((entry) => entry.id === audienceId)?.count;
const organization = (answer, organizationId) =>
  answer.body?.organizations?.find((entry) => entry.id === organizationId);

function checkDelta(name, before, after, read, expected) {
  const delta = read(after) - read(before);
  check(`${name} (${expected})`, delta === expected, { delta });
}

// Organisations: the pinned app's own one, or three of the check's own under tenant.
let A;
let B;
let C;
let OTHER;
if (policy === "pinned") {
  const pinned = await organizations.findOne({ slug: "demo" });
  if (!pinned) {
    console.error(
      "The pinned organisation (slug demo) is not in the database yet.",
    );
    process.exit(2);
  }
  A = pinned._id;
  B = pinned._id;
  C = pinned._id;
  OTHER = id("org-other");
} else {
  A = id("org-a");
  B = id("org-b");
  C = id("org-c");
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

const everyone = { audiences: null, organizations: { mode: "all", ids: [] } };

try {
  const base = {
    everyone: await audience(everyone),
    managersExceptA: await audience({
      audiences: ["managers"],
      organizations: { mode: "except", ids: [A] },
    }),
    onlyC: await audience({
      audiences: null,
      organizations: { mode: "only", ids: [C] },
    }),
  };
  check(
    "release.audience answers 200",
    base.everyone.status === 200,
    base.everyone,
  );

  if (policy === "tenant") {
    await organizations.insertMany([
      { _id: A, name: `Check A ${RUN}`, slug: id("a") },
      { _id: B, name: `Check B ${RUN}`, slug: id("b") },
      { _id: C, name: `Check C ${RUN}`, slug: id("c") },
    ]);
  }
  // one: a manager in Team Alpha, in A and (tenant) B. two: a manager who turned
  // email off. three: Team Alpha, no email. four: a plain member of C. five: a
  // manager whose user row is gone. Pinned adds six, in another organisation.
  await users.insertMany([
    { _id: id("one"), name: "One", email: `one-${RUN}@example.com` },
    { _id: id("two"), name: "Two", email: `two-${RUN}@example.com` },
    { _id: id("three"), name: "Three" },
    { _id: id("four"), name: "Four", email: `four-${RUN}@example.com` },
    { _id: id("six"), name: "Six", email: `six-${RUN}@example.com` },
  ]);
  const rows = [
    member(
      "one-a",
      "one",
      A,
      { app_roles: ["manager"], attributes: { team: "alpha" } },
      1,
    ),
    member("two-a", "two", A, { app_roles: ["manager"] }, 2),
    member("three-b", "three", B, { attributes: { team: "alpha" } }, 3),
    member("four-c", "four", C, {}, 4),
    member("five-a", "five", A, { app_roles: ["manager"] }, 5),
  ];
  if (policy === "tenant") {
    rows.push(
      member(
        "one-b",
        "one",
        B,
        { app_roles: ["manager"], attributes: { team: "alpha" } },
        6,
      ),
    );
  } else {
    rows.push(member("six-other", "six", OTHER, { app_roles: ["manager"] }, 6));
  }
  await members.insertMany(rows);
  await preferences.insertOne({
    _id: id("two"),
    email: false,
    updated: new Date(),
  });

  const all = await audience(everyone);
  check("answers within 5 seconds", all.ms < 5000, { ms: all.ms });
  check(
    "the answer has version, audiences, organizations and totals",
    all.body &&
      "version" in all.body &&
      Array.isArray(all.body.audiences) &&
      Array.isArray(all.body.organizations) &&
      typeof all.body.totals?.app === "number",
    all.body,
  );
  check(
    "audiences list the declared ones with labels",
    JSON.stringify(
      all.body?.audiences?.map(({ id: key, label }) => [key, label]),
    ) ===
      JSON.stringify([
        ["managers", "Managers"],
        ["team-alpha", "Team Alpha"],
      ]),
    all.body?.audiences,
  );
  checkDelta(
    "everyone reaches each person once",
    base.everyone,
    all,
    (a) => a.body.totals.app,
    4,
  );
  checkDelta(
    "people who turned email off",
    base.everyone,
    all,
    (a) => a.body.totals.opted_out,
    1,
  );
  checkDelta(
    "people emailed leave out opted-out and addressless",
    base.everyone,
    all,
    (a) => a.body.totals.email,
    2,
  );
  checkDelta(
    "a manager in two organisations counts once",
    base.everyone,
    all,
    (a) => count(a, "managers"),
    2,
  );
  checkDelta(
    "a person in two audiences counts once in each",
    base.everyone,
    all,
    (a) => count(a, "team-alpha"),
    2,
  );

  if (policy === "tenant") {
    check(
      "organisation A counts its people",
      organization(all, A)?.count === 2,
      organization(all, A),
    );
    check(
      "organisations carry their names",
      organization(all, A)?.name === `Check A ${RUN}`,
      organization(all, A),
    );
    check(
      "organisation B counts its people",
      organization(all, B)?.count === 2,
      organization(all, B),
    );
    check(
      "organisation C counts its people",
      organization(all, C)?.count === 1,
      organization(all, C),
    );

    const managersExceptA = await audience({
      audiences: ["managers"],
      organizations: { mode: "except", ids: [A] },
    });
    checkDelta(
      "except leaves the named organisation out",
      base.managersExceptA,
      managersExceptA,
      (a) => a.body.totals.app,
      1,
    );
    checkDelta(
      "audience counts follow the selection's organisations",
      base.managersExceptA,
      managersExceptA,
      (a) => count(a, "team-alpha"),
      2,
    );
    check(
      "organisations count the picked audiences in every organisation",
      organization(managersExceptA, A)?.count === 2 &&
        organization(managersExceptA, B)?.count === 1 &&
        organization(managersExceptA, C) === undefined,
      managersExceptA.body?.organizations,
    );
    const onlyC = await audience({
      audiences: null,
      organizations: { mode: "only", ids: [C] },
    });
    checkDelta(
      "only keeps the named organisations",
      base.onlyC,
      onlyC,
      (a) => a.body.totals.app,
      1,
    );
  } else {
    check(
      "pinned answers no organisations",
      all.body?.organizations?.length === 0,
      all.body,
    );
    const managersExceptA = await audience({
      audiences: ["managers"],
      organizations: { mode: "except", ids: [A] },
    });
    checkDelta(
      "pinned ignores the organisations sent",
      base.managersExceptA,
      managersExceptA,
      (a) => a.body.totals.app,
      2,
    );
    checkDelta(
      "pinned leaves other organisations' members out",
      base.everyone,
      all,
      (a) => a.body.totals.app,
      4,
    );
  }

  const unknownAudience = await audience({
    audiences: ["nope"],
    organizations: { mode: "all", ids: [] },
  });
  check(
    "an unknown audience answers 400 naming the field",
    unknownAudience.status === 400 &&
      unknownAudience.body?.error?.message?.includes("selection.audiences"),
    unknownAudience,
  );
  const badMode = await audience({
    audiences: null,
    organizations: { mode: "some", ids: [] },
  });
  check(
    "a bad mode answers 400 naming the field",
    badMode.status === 400 &&
      badMode.body?.error?.message?.includes("selection.organizations.mode"),
    badMode,
  );
  const unknownEvent = await deliver({
    event: "release.test",
    at: new Date().toISOString(),
  });
  check(
    "another release event answers 400",
    unknownEvent.status === 400 &&
      unknownEvent.body?.error?.message === "Unknown release event",
    unknownEvent,
  );
} finally {
  await members.deleteMany({ _id: { $regex: `^audience-check-${RUN}-` } });
  await users.deleteMany({ _id: { $regex: `^audience-check-${RUN}-` } });
  await organizations.deleteMany({
    _id: { $regex: `^audience-check-${RUN}-` },
  });
  await preferences.deleteMany({ _id: { $regex: `^audience-check-${RUN}-` } });
  await client.close();
}

console.log(
  failures.length === 0
    ? "\nAll checks passed."
    : `\n${failures.length} failed.`,
);
process.exit(failures.length === 0 ? 0 : 1);
