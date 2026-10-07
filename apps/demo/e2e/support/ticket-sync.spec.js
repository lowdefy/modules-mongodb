import { test, expect } from "../fixtures.js";
import { createPelicanStub } from "./pelican-stub.js";

// sync-tickets, sync-ticket and mark-read against a stub Pelican: what they send,
// what they store in the user's copy, and how each Pelican answer comes back.

const TICKETS = "support-tickets";

const USER = {
  id: "e2e-support-user-id",
  sub: "e2e-support-user-sub",
  name: "Support User",
  email: "support@example.com",
  roles: ["admin"],
  profile: { name: "Support User" },
};

const OTHER_USER_ID = "e2e-support-other-user-id";

const message = ({ id, from, at, deleted = false }) => ({
  id,
  from,
  author: {
    name: from === "team" ? "Ann Team" : "Support User",
    initials: "AT",
  },
  at,
  text: deleted ? null : `Message ${id}`,
  files: [],
  deleted,
});

const view = ({ id, key, version, updated, messages }) => ({
  id,
  key,
  title: `Ticket ${key}`,
  type: "bug",
  version,
  stage: "Received",
  created: "2026-10-01T08:00:00.000Z",
  updated,
  ...(messages ? { messages } : {}),
});

// The reporter's ticket, with one message each way.
const OWN = view({
  id: "t-own",
  key: "ENC-1",
  version: 3,
  updated: "2026-10-02T10:00:00.000Z",
  messages: [
    message({ id: "m1", from: "reporter", at: "2026-10-02T09:00:00.000Z" }),
    message({ id: "m2", from: "team", at: "2026-10-02T10:00:00.000Z" }),
  ],
});

// A ticket the team logged for the reporter: no messages yet.
const LOGGED = view({
  id: "t-logged",
  key: "ENC-2",
  version: 1,
  updated: "2026-10-03T10:00:00.000Z",
  messages: [],
});

const withoutMessages = ({ messages, ...rest }) => rest;
const VIEWS = {
  "t-own": OWN,
  "ENC-1": OWN,
  "t-logged": LOGGED,
  "ENC-2": LOGGED,
};

function pelicanAnswering(views) {
  return ({ endpoint, body }) => {
    if (endpoint === "support-list-tickets") {
      return { status: 200, body: Object.values(views).map(withoutMessages) };
    }
    if (endpoint === "support-get-ticket") {
      const found = views[body.ticket];
      return found
        ? { status: 200, body: found }
        : {
            status: 404,
            body: { error: { code: "not_found", message: "No such ticket." } },
          };
    }
    return { status: 500, body: {} };
  };
}

const pelican = createPelicanStub();

test.beforeAll(() => pelican.start());
test.afterAll(() => pelican.stop());
test.beforeEach(() => pelican.reset());

async function call(page, endpoint, payload) {
  const raw = await page.request.post(`/api/endpoints/support/${endpoint}`, {
    data: { payload },
  });
  const body = await raw.json().catch(() => null);
  return body?.response;
}

const stored = (row) => ({
  _id: row.id,
  user_id: USER.id,
  organization: null,
  read_at: null,
  view: row,
  created: { timestamp: new Date("2026-10-01T08:00:00Z") },
  updated: { timestamp: new Date("2026-10-01T08:00:00Z") },
});

test("sync-tickets stores every ticket Pelican lists for the user, the team-logged one too", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  pelican.answer(pelicanAnswering({ "t-own": OWN, "t-logged": LOGGED }));

  const result = await call(page, "sync-tickets", {});

  expect(result.ok).toBe(true);
  expect(result.error).toBeNull();
  expect(result.tickets).toEqual([
    {
      id: "t-logged",
      key: "ENC-2",
      title: "Ticket ENC-2",
      type: "bug",
      stage: "Received",
      updated: "2026-10-03T10:00:00.000Z",
      organization: null,
      unread: false,
    },
    {
      id: "t-own",
      key: "ENC-1",
      title: "Ticket ENC-1",
      type: "bug",
      stage: "Received",
      updated: "2026-10-02T10:00:00.000Z",
      organization: null,
      unread: true,
    },
  ]);

  expect(pelican.calls.map((c) => [c.endpoint, c.body.ticket ?? null])).toEqual(
    [
      ["support-list-tickets", null],
      ["support-get-ticket", "t-own"],
      ["support-get-ticket", "t-logged"],
    ],
  );
  for (const c of pelican.calls) {
    expect(c.authorization).toBe("Bearer e2e-support-key");
    expect(c.body.user).toEqual({
      id: USER.id,
      name: USER.name,
      email: USER.email,
    });
  }

  const row = await mdb.collection(TICKETS).findOne({ _id: "t-own" });
  expect(row.user_id).toBe(USER.id);
  expect(row.organization).toBeNull();
  expect(row.read_at).toBeNull();
  expect(row.view).toEqual(OWN);
  expect(row.created.user.id).toBe(USER.id);
});

test("a second sync-tickets with nothing changed makes one Pelican call", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed(TICKETS, [stored(OWN), stored(LOGGED)]);
  pelican.answer(pelicanAnswering({ "t-own": OWN, "t-logged": LOGGED }));

  const result = await call(page, "sync-tickets", {});

  expect(result.ok).toBe(true);
  expect(result.tickets.map((t) => t.id)).toEqual(["t-logged", "t-own"]);
  expect(pelican.calls.map((c) => c.endpoint)).toEqual([
    "support-list-tickets",
  ]);
});

test("sync-tickets fetches only the ticket Pelican holds at a higher version", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed(TICKETS, [stored({ ...OWN, version: 2 }), stored(LOGGED)]);
  pelican.answer(pelicanAnswering({ "t-own": OWN, "t-logged": LOGGED }));

  await call(page, "sync-tickets", {});

  expect(pelican.calls.map((c) => [c.endpoint, c.body.ticket ?? null])).toEqual(
    [
      ["support-list-tickets", null],
      ["support-get-ticket", "t-own"],
    ],
  );
  const row = await mdb.collection(TICKETS).findOne({ _id: "t-own" });
  expect(row.view.version).toBe(3);
});

test("a failed list keeps the copy and returns it with the error", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed(TICKETS, [stored(OWN)]);
  pelican.answer(() => ({
    status: 429,
    body: {
      error: {
        code: "rate_limited",
        message: "Too many calls.",
        retry_after: 120,
      },
    },
  }));

  const result = await call(page, "sync-tickets", {});

  expect(result.ok).toBe(false);
  expect(result.error).toEqual({
    kind: "retry",
    status: 429,
    code: "rate_limited",
    message: "Too many calls.",
    retry_after: 120,
  });
  expect(result.tickets.map((t) => t.id)).toEqual(["t-own"]);
});

test("sync-ticket by key stores the view and marks it read", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed(TICKETS, [stored({ ...OWN, version: 2 })]);
  pelican.answer(pelicanAnswering(VIEWS));

  const result = await call(page, "sync-ticket", { ticket: "ENC-1" });

  expect(result.ok).toBe(true);
  expect(pelican.calls.map((c) => c.body.ticket)).toEqual(["ENC-1"]);
  expect(result.ticket._id).toBe("t-own");
  expect(result.ticket.view).toEqual(OWN);
  expect(result.ticket.read_at).not.toBeNull();

  const list = await call(page, "sync-tickets", {});
  expect(list.tickets.find((t) => t.id === "t-own").unread).toBe(false);
});

test("a stored view at an equal or higher version is never replaced", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  const newer = { ...OWN, version: 5, title: "Stored title" };
  await mdb.seed(TICKETS, [stored(newer)]);

  pelican.answer(pelicanAnswering({ "t-own": { ...OWN, version: 4 } }));
  expect(
    (await call(page, "sync-ticket", { ticket: "t-own" })).ticket.view,
  ).toEqual(newer);

  pelican.answer(
    pelicanAnswering({
      "t-own": { ...OWN, version: 5, title: "Same version" },
    }),
  );
  expect(
    (await call(page, "sync-ticket", { ticket: "t-own" })).ticket.view,
  ).toEqual(newer);

  pelican.answer(
    pelicanAnswering({ "t-own": { ...OWN, version: 6, title: "Newer" } }),
  );
  expect(
    (await call(page, "sync-ticket", { ticket: "t-own" })).ticket.view.title,
  ).toBe("Newer");
});

test("a failed sync-ticket returns the stored row with the error", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed(TICKETS, [stored(OWN)]);

  pelican.answer(() => ({ status: 500, body: {} }));
  let result = await call(page, "sync-ticket", { ticket: "ENC-1" });
  expect(result.ok).toBe(false);
  expect(result.error.kind).toBe("retry");
  expect(result.error.status).toBe(500);
  expect(result.ticket.view).toEqual(OWN);
  expect(result.ticket.read_at).toBeNull();

  pelican.answer(() => ({ hangUp: true }));
  result = await call(page, "sync-ticket", { ticket: "ENC-1" });
  expect(result.error).toEqual({
    kind: "retry",
    status: null,
    code: null,
    message: "Support did not answer. Try again in a moment.",
    retry_after: null,
  });
  expect(result.ticket._id).toBe("t-own");

  pelican.answer(() => ({
    status: 404,
    body: { error: { code: "not_found", message: "No such ticket." } },
  }));
  result = await call(page, "sync-ticket", { ticket: "ENC-1" });
  expect(result.error).toEqual({
    kind: "fix",
    status: 404,
    code: "not_found",
    message: "No such ticket.",
    retry_after: null,
  });
});

test("a wrong key makes support unavailable", async ({ ldf, page }) => {
  await ldf.user(USER);
  pelican.answer(() => ({
    status: 401,
    body: { error: { code: "unauthorized", message: "Unknown key." } },
  }));

  const result = await call(page, "sync-ticket", { ticket: "ENC-1" });

  expect(result.ok).toBe(false);
  expect(result.error).toEqual({
    kind: "unavailable",
    status: 401,
    code: "unauthorized",
    message: "Support is unavailable.",
    retry_after: null,
  });
  expect(result.ticket).toBeNull();
});

test("another user's ticket is never found or marked", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed(TICKETS, [{ ...stored(OWN), user_id: OTHER_USER_ID }]);
  pelican.answer(pelicanAnswering({}));

  const synced = await call(page, "sync-ticket", { ticket: "t-own" });
  expect(synced.ok).toBe(false);
  expect(synced.ticket).toBeNull();

  expect(await call(page, "mark-read", { ticket: "ENC-1" })).toEqual({
    ok: true,
  });
  const row = await mdb.collection(TICKETS).findOne({ _id: "t-own" });
  expect(row.read_at).toBeNull();

  const list = await call(page, "sync-tickets", {});
  expect(list.tickets).toEqual([]);
});

test("mark-read marks the user's ticket by key", async ({ ldf, page, mdb }) => {
  await ldf.user(USER);
  await mdb.seed(TICKETS, [stored(OWN)]);

  expect(await call(page, "mark-read", { ticket: "ENC-1" })).toEqual({
    ok: true,
  });

  const row = await mdb.collection(TICKETS).findOne({ _id: "t-own" });
  expect(row.read_at).toBeInstanceOf(Date);
});

test("without a session nothing reaches Pelican", async ({ ldf, page }) => {
  await ldf.user(null);
  pelican.answer(pelicanAnswering(VIEWS));

  expect(await call(page, "sync-tickets", {})).toBeUndefined();
  expect(pelican.calls).toEqual([]);
});
