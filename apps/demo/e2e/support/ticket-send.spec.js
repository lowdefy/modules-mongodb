import { test, expect } from "../fixtures.js";
import { createPelicanStub } from "./pelican-stub.js";

// create-ticket and post-message against a stub Pelican: what is refused before
// Pelican is called, what Pelican is sent (the user from the session, a signed
// link per file), what the copy keeps, and how a refusal comes back. Signing a
// link is local, so the placeholder bucket secrets in playwright.config.js do.

const TICKETS = "support-tickets";
const ORGANIZATIONS = "user-organizations";

const USER = {
  id: "e2e-send-user-id",
  sub: "e2e-send-user-sub",
  name: "Send User",
  email: "send@example.com",
  organization_id: "demo",
  roles: ["admin"],
  profile: { name: "Send User" },
};

const file = (name, owner = USER.id) => ({
  key: `support/${owner}/u-${name}/${name}`,
  name,
});

const reporterMessage = (id, text, files = []) => ({
  id,
  from: "reporter",
  author: { name: "Send User", initials: "SU" },
  at: "2026-10-07T09:00:00.000Z",
  text,
  files: files.map((f) => ({
    name: f.name,
    url: `https://pelican.example/${f.name}`,
  })),
  deleted: false,
});

const createdView = (files) => ({
  id: "t-new",
  key: "ENC-7",
  title: "The export fails",
  type: "bug",
  version: 1,
  stage: "Received",
  created: "2026-10-07T09:00:00.000Z",
  updated: "2026-10-07T09:00:00.000Z",
  messages: [reporterMessage("m1", "Export shows an error.", files)],
});

const REPORT = {
  type: "bug",
  title: "The export fails",
  message: "Export shows an error.",
  context: { page: "orders", url: "http://localhost/orders", errors: [] },
  files: [file("one.png"), file("two.png")],
};

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

const fixError = (message) => ({
  ok: false,
  error: {
    kind: "fix",
    status: null,
    code: "invalid_request",
    message,
    retry_after: null,
  },
});

test("create-ticket sends the report with a signed link per file and stores the ticket", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  // The app may have ensured its pinned organisation at startup.
  await mdb
    .collection(ORGANIZATIONS)
    .updateOne(
      { _id: "demo" },
      { $set: { name: "Demo Org", slug: "demo" } },
      { upsert: true },
    );
  pelican.answer(() => ({ status: 200, body: createdView(REPORT.files) }));

  const result = await call(page, "create-ticket", REPORT);

  expect(pelican.calls).toHaveLength(1);
  const [sent] = pelican.calls;
  expect(sent.endpoint).toBe("support-create-ticket");
  expect(sent.authorization).toBe("Bearer e2e-support-key");
  expect(sent.body.user).toEqual({
    id: USER.id,
    name: USER.name,
    email: USER.email,
  });
  expect(sent.body.type).toBe("bug");
  expect(sent.body.title).toBe(REPORT.title);
  expect(sent.body.message).toBe(REPORT.message);
  expect(sent.body.context).toEqual({
    ...REPORT.context,
    app: "demo",
    environment: "development",
    version: null,
    organization: { id: "demo", name: "Demo Org" },
  });
  expect(sent.body.files.map((f) => f.name)).toEqual(["one.png", "two.png"]);
  sent.body.files.forEach((f, i) => {
    expect(f.url).toContain(REPORT.files[i].key);
    expect(f.url).toContain("X-Amz-Expires=900");
    expect(f.url).toContain("X-Amz-Signature=");
  });

  expect(result.ok).toBe(true);
  expect(result.ticket._id).toBe("t-new");
  expect(result.ticket.view.key).toBe("ENC-7");
  expect(result.ticket.view.messages[0].files).toHaveLength(2);
  expect(result.ticket.organization).toEqual({ id: "demo", name: "Demo Org" });
  expect(result.ticket.user_id).toBe(USER.id);
  expect(result.ticket.read_at).not.toBeNull();
});

test("a user with no active organisation files with organization null", async ({
  ldf,
  page,
}) => {
  await ldf.user({ ...USER, organization_id: null });
  pelican.answer(() => ({ status: 200, body: createdView([]) }));

  const result = await call(page, "create-ticket", { ...REPORT, files: [] });

  expect(pelican.calls[0].body.context.organization).toBeNull();
  expect(pelican.calls[0].body.files).toEqual([]);
  expect(result.ticket.organization).toBeNull();
});

test("post-message adds the message by key and moves the stored view forward", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  const before = createdView([]);
  await mdb.seed(TICKETS, [
    {
      _id: "t-new",
      user_id: USER.id,
      organization: { id: "demo", name: "Demo Org" },
      read_at: null,
      view: before,
    },
  ]);
  const after = {
    ...before,
    version: 2,
    messages: [
      ...before.messages,
      reporterMessage("m2", "Still broken.", [file("three.png")]),
    ],
  };
  pelican.answer(() => ({ status: 200, body: after }));

  const result = await call(page, "post-message", {
    ticket: "ENC-7",
    message: "Still broken.",
    files: [file("three.png")],
  });

  const [sent] = pelican.calls;
  expect(sent.endpoint).toBe("support-post-message");
  expect(sent.body.ticket).toBe("t-new");
  expect(sent.body.message).toBe("Still broken.");
  expect(sent.body.user).toEqual({
    id: USER.id,
    name: USER.name,
    email: USER.email,
  });
  expect(sent.body.files).toHaveLength(1);
  expect(sent.body.files[0].url).toContain(file("three.png").key);

  expect(result.ok).toBe(true);
  expect(result.ticket.view.version).toBe(2);
  expect(result.ticket.view.messages).toHaveLength(2);
  expect(result.ticket.organization).toEqual({ id: "demo", name: "Demo Org" });

  // An older view answered later does not roll the thread back.
  pelican.answer(() => ({ status: 200, body: before }));
  const late = await call(page, "post-message", {
    ticket: "t-new",
    message: "Again.",
  });
  expect(late.ticket.view.version).toBe(2);
});

test("post-message on a ticket that is not the user's is refused before Pelican", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed(TICKETS, [
    {
      _id: "t-other",
      user_id: "someone-else",
      view: { ...createdView([]), id: "t-other" },
    },
  ]);

  const result = await call(page, "post-message", {
    ticket: "t-other",
    message: "Hello",
  });

  expect(result).toEqual({
    ok: false,
    error: {
      kind: "fix",
      status: null,
      code: "not_found",
      message: "That ticket was not found.",
      retry_after: null,
    },
  });
  expect(pelican.calls).toEqual([]);
});

test("input Pelican must never see is refused before it is called", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  pelican.answer(() => ({ status: 200, body: createdView([]) }));

  expect(
    await call(page, "create-ticket", {
      ...REPORT,
      files: [file("x.png", "someone-else")],
    }),
  ).toEqual(fixError("Attach only files you uploaded here."));
  expect(
    await call(page, "create-ticket", {
      ...REPORT,
      files: ["1", "2", "3", "4", "5", "6"].map((n) => file(`${n}.png`)),
    }),
  ).toEqual(fixError("Attach up to five files."));
  expect(
    await call(page, "create-ticket", { ...REPORT, type: "complaint" }),
  ).toEqual(fixError("Choose one of the ticket types."));
  expect(
    await call(page, "create-ticket", { ...REPORT, title: "x".repeat(121) }),
  ).toEqual(fixError("Give the ticket a title of up to 120 characters."));
  expect(
    await call(page, "post-message", {
      ticket: "t-new",
      message: "See this",
      files: [file("x.png", "someone-else")],
    }),
  ).toEqual(fixError("Attach only files you uploaded here."));
  expect(
    await call(page, "post-message", { ticket: "t-new", message: "  " }),
  ).toEqual(fixError("Write a message of up to 4,000 characters."));

  expect(pelican.calls).toEqual([]);
});

test("Pelican's refusals come back as fix or retry, and a create is sent once", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);

  pelican.answer(() => ({
    status: 413,
    body: {
      error: { code: "file_too_large", message: "one.png is over 10 MB." },
    },
  }));
  expect(await call(page, "create-ticket", REPORT)).toEqual({
    ok: false,
    error: {
      kind: "fix",
      status: 413,
      code: "file_too_large",
      message: "one.png is over 10 MB.",
      retry_after: null,
    },
  });
  expect(pelican.calls).toHaveLength(1);

  pelican.reset();
  pelican.answer(() => ({
    status: 429,
    body: {
      error: {
        code: "rate_limited",
        message: "Too many tickets.",
        retry_after: 900,
      },
    },
  }));
  expect(await call(page, "create-ticket", REPORT)).toEqual({
    ok: false,
    error: {
      kind: "retry",
      status: 429,
      code: "rate_limited",
      message: "Too many tickets.",
      retry_after: 900,
    },
  });
  expect(pelican.calls).toHaveLength(1);

  pelican.reset();
  pelican.answer(() => ({ hangUp: true }));
  const lost = await call(page, "create-ticket", REPORT);
  expect(lost.error.kind).toBe("retry");
  expect(pelican.calls).toHaveLength(1);
});
