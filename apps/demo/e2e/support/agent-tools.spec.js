import { test, expect } from "../fixtures.js";
import { createPelicanStub } from "./pelican-stub.js";

// The support module's agent tools, called directly against a stub Pelican: what they
// send, what they answer, and how a failure comes back. The e2e server has no agent
// route, so no call here comes from an agent: `_agent: files` is empty and no chat
// file is sent. Which chat files an agent's call sends is covered by the unit tests
// in modules/support/api/agent/agent-tools.test.js.

const TICKETS = "support-tickets";

const USER = {
  id: "e2e-agent-user-id",
  sub: "e2e-agent-user-sub",
  name: "Agent User",
  email: "agent@example.com",
  organization_id: "demo",
  roles: ["admin"],
  profile: { name: "Agent User" },
};

const pelicanMessage = (id, from, text, files = []) => ({
  id,
  from,
  author: { name: from === "team" ? "Sam" : "Agent User", initials: "AU" },
  at: "2026-10-07T09:00:00.000Z",
  text,
  files: files.map((name) => ({
    name,
    url: `https://pelican.example/${name}`,
  })),
  deleted: false,
});

const view = (version, messages) => ({
  id: "t-agent",
  key: "SUP-12",
  title: "Export fails",
  type: "bug",
  version,
  stage: "Received",
  created: "2026-10-07T09:00:00.000Z",
  updated: "2026-10-07T09:00:00.000Z",
  messages,
});

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

test("file-ticket files the ticket marked as filed by the agent and answers its key", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  pelican.answer(() => ({
    status: 200,
    body: view(1, [
      pelicanMessage("m1", "reporter", "The export shows an error."),
    ]),
  }));

  const result = await call(page, "agent-file-ticket", {
    type: "bug",
    title: "Export fails",
    description: "The export shows an error.",
    page: "orders",
    url: "http://localhost/orders",
  });

  expect(pelican.calls).toHaveLength(1);
  const [sent] = pelican.calls;
  expect(sent.endpoint).toBe("support-create-ticket");
  expect(sent.body.user).toEqual({
    id: USER.id,
    name: USER.name,
    email: USER.email,
  });
  expect(sent.body.type).toBe("bug");
  expect(sent.body.title).toBe("Export fails");
  expect(sent.body.message).toBe("The export shows an error.");
  expect(sent.body.context).toMatchObject({
    page: "orders",
    url: "http://localhost/orders",
    extra: { filed_by: "agent", conversation_id: null },
    app: "demo",
    environment: "development",
  });
  expect(sent.body.files).toEqual([]);
  expect(result).toEqual({
    ok: true,
    key: "SUP-12",
    stage: "Received",
    files: [],
  });

  const [row] = await mdb
    .collection(TICKETS)
    .find({ _id: "t-agent" })
    .toArray();
  expect(row.user_id).toBe(USER.id);
  expect(row.chat_files).toBeUndefined();
});

test("post-message adds the message to the user's ticket by key", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  const before = view(1, [pelicanMessage("m1", "reporter", "Export fails.")]);
  await mdb.seed(TICKETS, [
    {
      _id: "t-agent",
      user_id: USER.id,
      organization: null,
      read_at: null,
      view: before,
    },
  ]);
  pelican.answer(() => ({
    status: 200,
    body: view(2, [
      ...before.messages,
      pelicanMessage("m2", "reporter", "It fails in every browser."),
    ]),
  }));

  const result = await call(page, "agent-post-message", {
    ticket: "SUP-12",
    message: "It fails in every browser.",
  });

  const [sent] = pelican.calls;
  expect(sent.endpoint).toBe("support-post-message");
  expect(sent.body.ticket).toBe("t-agent");
  expect(sent.body.message).toBe("It fails in every browser.");
  expect(sent.body.files).toEqual([]);
  expect(result).toEqual({
    ok: true,
    key: "SUP-12",
    stage: "Received",
    files: [],
  });
});

test("post-message on another user's ticket is refused before Pelican", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed(TICKETS, [
    { _id: "t-agent", user_id: "someone-else", view: view(1, []) },
  ]);

  const result = await call(page, "agent-post-message", {
    ticket: "SUP-12",
    message: "Hello",
  });

  expect(result.ok).toBe(false);
  expect(result.error).toMatchObject({ kind: "fix", code: "not_found" });
  expect(pelican.calls).toEqual([]);
});

test("read-ticket by key answers the thread lean", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  pelican.answer(() => ({
    status: 200,
    body: view(2, [
      pelicanMessage("m1", "reporter", "Export fails.", ["shot.png"]),
      pelicanMessage("m2", "team", "Which browser?"),
    ]),
  }));

  const result = await call(page, "agent-read-ticket", { ticket: "SUP-12" });

  expect(pelican.calls[0].endpoint).toBe("support-get-ticket");
  expect(pelican.calls[0].body.ticket).toBe("SUP-12");
  expect(result).toEqual({
    ok: true,
    error: null,
    ticket: {
      key: "SUP-12",
      title: "Export fails",
      type: "bug",
      stage: "Received",
      created: "2026-10-07T09:00:00.000Z",
      updated: "2026-10-07T09:00:00.000Z",
      messages: [
        {
          from: "reporter",
          author: "Agent User",
          at: "2026-10-07T09:00:00.000Z",
          text: "Export fails.",
          files: ["shot.png"],
          deleted: false,
        },
        {
          from: "team",
          author: "Sam",
          at: "2026-10-07T09:00:00.000Z",
          text: "Which browser?",
          files: [],
          deleted: false,
        },
      ],
    },
  });
});

test("list-my-tickets answers the user's tickets lean", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  const full = view(1, [
    pelicanMessage("m1", "team", "We logged this for you."),
  ]);
  pelican.answer((call) =>
    call.endpoint === "support-list-tickets"
      ? { status: 200, body: [{ ...full, messages: undefined }] }
      : { status: 200, body: full },
  );

  const result = await call(page, "agent-list-my-tickets", {});

  expect(result).toEqual({
    ok: true,
    error: null,
    tickets: [
      {
        key: "SUP-12",
        title: "Export fails",
        stage: "Received",
        updated: "2026-10-07T09:00:00.000Z",
        unread: true,
      },
    ],
  });
});

test("called with no agent, file-ticket sends no files and passes a retry back with its kind", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
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

  const result = await call(page, "agent-file-ticket", {
    type: "bug",
    title: "Export fails",
    description: "The export shows an error.",
  });

  expect(pelican.calls).toHaveLength(1);
  expect(pelican.calls[0].body.files).toEqual([]);
  expect(pelican.calls[0].body.context.extra).toEqual({
    filed_by: "agent",
    conversation_id: null,
  });
  expect(result).toEqual({
    ok: false,
    error: {
      kind: "retry",
      status: 429,
      code: "rate_limited",
      message: "Too many tickets.",
      retry_after: 900,
    },
  });
});

test("a type the app does not offer is refused before Pelican is called", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);

  const result = await call(page, "agent-file-ticket", {
    type: "complaint",
    title: "Export fails",
    description: "The export shows an error.",
  });

  expect(result).toEqual({
    ok: false,
    error: {
      kind: "fix",
      status: null,
      code: "invalid_request",
      message: "Choose one of the ticket types.",
      retry_after: null,
    },
  });
  expect(pelican.calls).toEqual([]);
});
