import { test, expect } from "../fixtures.js";
import { createPelicanStub } from "./pelican-stub.js";

// My tickets, the thread and the support page against a stub Pelican: the
// list (team-logged tickets and unread dots included), a thread's messages and
// files, a reply, and a link to a ticket that is not the user's.

const TICKETS = "support-tickets";

const USER = {
  id: "e2e-thread-user-id",
  sub: "e2e-thread-user-sub",
  name: "Thread User",
  email: "thread@example.com",
  organization_id: "demo",
  roles: ["admin"],
  profile: { name: "Thread User" },
};

const S3_URL = "https://s3.e2e.test/support-reply-upload";
const KEY = `support/${USER.id}/e2e-reply/file`;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const message = ({ id, from, at, text, files = [], deleted = false }) => ({
  id,
  from,
  author: { name: from === "team" ? "Ann Team" : "Thread User" },
  at,
  text: deleted ? null : text,
  files,
  deleted,
});

const view = ({ id, key, version, stage, updated, messages }) => ({
  id,
  key,
  title: `Ticket ${key}`,
  type: "bug",
  version,
  stage,
  created: "2026-10-01T08:00:00.000Z",
  updated,
  messages,
});

// A ticket with a team reply the user has not read.
const REPLIED = view({
  id: "t-replied",
  key: "ENC-31",
  version: 3,
  stage: "Needs your reply",
  updated: "2026-10-02T10:00:00.000Z",
  messages: [
    message({
      id: "m1",
      from: "reporter",
      at: "2026-10-02T09:00:00.000Z",
      text: "The export fails.",
    }),
    message({
      id: "m2",
      from: "team",
      at: "2026-10-02T10:00:00.000Z",
      text: "Which file were you exporting?",
    }),
    message({
      id: "m3",
      from: "team",
      at: "2026-10-02T10:01:00.000Z",
      text: "secret",
      deleted: true,
    }),
  ],
});

// A ticket the team logged for the user: no messages yet.
const LOGGED = view({
  id: "t-logged",
  key: "ENC-32",
  version: 1,
  stage: "Received",
  updated: "2026-10-03T10:00:00.000Z",
  messages: [],
});

const withoutMessages = ({ messages, ...rest }) => rest;

function pelicanAnswering(views, onPost) {
  const byRef = {};
  for (const v of Object.values(views)) {
    byRef[v.id] = v;
    byRef[v.key] = v;
  }
  return ({ endpoint, body }) => {
    if (endpoint === "support-list-tickets") {
      return { status: 200, body: Object.values(views).map(withoutMessages) };
    }
    if (endpoint === "support-get-ticket") {
      const found = byRef[body.ticket];
      return found
        ? { status: 200, body: found }
        : {
            status: 404,
            body: { error: { code: "not_found", message: "No such ticket." } },
          };
    }
    if (endpoint === "support-post-message" && onPost) {
      return onPost(body);
    }
    return { status: 500, body: {} };
  };
}

const pelican = createPelicanStub();

test.beforeAll(() => pelican.start());
test.afterAll(() => pelican.stop());

// The in-memory database outlives each test, so every test starts from an
// empty copy.
test.beforeEach(async ({ ldf, page, mdb }) => {
  await mdb.collection("support-tickets").deleteMany({});
  pelican.reset();
  for (const id of [
    "upload_policy_support_reply_files",
    "upload_policy_support_page_reply_files",
  ]) {
    await ldf.mock.request(id, {
      response: { url: S3_URL, fields: { key: KEY, bucket: "e2e-bucket" } },
    });
  }
  await page.route(`${S3_URL}**`, (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
});

async function openMyTickets({ ldf, page }) {
  await ldf.goto("/home");
  await page.locator("#support_panel .fp-launcher").click();
  await page
    .locator("#support_view")
    .getByText("My tickets", { exact: true })
    .click();
}

const rows = (page, prefix) =>
  page.locator(`#${prefix}_tickets_list .ant-card`);

test("My tickets lists the user's tickets, a thread shows its messages, and reading clears the dot", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  pelican.answer(
    pelicanAnswering({ "t-replied": REPLIED, "t-logged": LOGGED }),
  );
  await openMyTickets({ ldf, page });

  await expect(rows(page, "support")).toHaveCount(2);
  await expect(rows(page, "support").nth(0)).toContainText("Ticket ENC-32");
  await expect(rows(page, "support").nth(0)).toContainText("Received");
  await expect(rows(page, "support").nth(1)).toContainText("Ticket ENC-31");
  await expect(rows(page, "support").nth(1)).toContainText("Needs your reply");
  await expect(
    rows(page, "support").nth(1).locator("[data-status]"),
  ).toHaveCount(1);
  await expect(
    rows(page, "support").nth(0).locator("[data-status]"),
  ).toHaveCount(0);

  await rows(page, "support").nth(1).click();
  const thread = page.locator("#support_thread_messages");
  await expect(thread).toContainText("The export fails.");
  await expect(thread).toContainText("Which file were you exporting?");
  await expect(thread).toContainText("Removed");
  await expect(thread).not.toContainText("secret");
  await expect(page.locator("#support_thread_title")).toContainText(
    "Ticket ENC-31",
  );

  await ldf.block("support_thread_back").do.click();
  await expect(rows(page, "support")).toHaveCount(2);
  await expect(page.locator("#support_tickets_list [data-status]")).toHaveCount(
    0,
  );
});

test("a reply with an image and a PDF posts and shows its files", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  let posted = null;
  const replied = {
    ...REPLIED,
    version: 4,
    stage: "In progress",
    messages: [
      ...REPLIED.messages,
      message({
        id: "m4",
        from: "reporter",
        at: "2026-10-07T09:00:00.000Z",
        text: "This one, attached.",
        files: [
          { name: "shot.png", url: "https://pelican.example/shot.png" },
          { name: "export.pdf", url: "https://pelican.example/export.pdf" },
        ],
      }),
    ],
  };
  pelican.answer(
    pelicanAnswering({ "t-replied": REPLIED }, (body) => {
      posted = body;
      return { status: 200, body: replied };
    }),
  );
  await openMyTickets({ ldf, page });
  await rows(page, "support").first().click();
  await expect(page.locator("#support_thread_messages")).toContainText(
    "Which file were you exporting?",
  );

  await ldf.block("support_reply.message").do.fill("This one, attached.");
  const input = page.locator("#support_reply_files input[type=file]");
  await input.setInputFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.locator("#support_reply\\.files")).toContainText(
    "shot.png",
  );
  await input.setInputFiles({
    name: "export.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
  });
  await expect(page.locator("#support_reply\\.files")).toContainText(
    "export.pdf",
  );
  await ldf.block("support_reply_send").do.click();

  await expect(page.locator("#support_thread_messages")).toContainText(
    "This one, attached.",
  );
  expect(posted.ticket).toBe("t-replied");
  expect(posted.message).toBe("This one, attached.");
  expect(posted.files.map((f) => f.name)).toEqual(["shot.png", "export.pdf"]);
  await expect(
    page.locator(
      '#support_thread_messages img[src="https://pelican.example/shot.png"]',
    ),
  ).toHaveCount(1);
  await expect(page.locator("#support_thread_messages")).toContainText(
    "export.pdf",
  );
  await ldf.state("support_reply.message").expect.toBe(null);
  await ldf.state("support_reply.files").expect.toBe([]);
});

test("a retry answer to a reply keeps the draft", async ({ ldf, page }) => {
  await ldf.user(USER);
  pelican.answer(
    pelicanAnswering({ "t-replied": REPLIED }, () => ({
      status: 500,
      body: {},
    })),
  );
  await openMyTickets({ ldf, page });
  await rows(page, "support").first().click();
  await ldf.block("support_reply.message").do.fill("Still failing.");
  await ldf.block("support_reply_send").do.click();
  await expect(page.locator("#support_reply_error")).toContainText(
    "Something went wrong, try again.",
  );
  await ldf.state("support_reply.message").expect.toBe("Still failing.");
});

test("the support page opens the ticket a link names, by key", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  pelican.answer(
    pelicanAnswering({ "t-replied": REPLIED, "t-logged": LOGGED }),
  );
  await ldf.goto("/support/support?ticket=ENC-31");
  await expect(rows(page, "support_page")).toHaveCount(2);
  await expect(page.locator("#support_page_thread_messages")).toContainText(
    "Which file were you exporting?",
  );
  await rows(page, "support_page").first().click();
  await expect(page.locator("#support_page_thread_title")).toContainText(
    "Ticket ENC-32",
  );
  await expect(page.locator("#support_page_thread_messages")).toContainText(
    "No messages yet",
  );
});

test("a link to another user's ticket shows nothing of it", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.collection(TICKETS).insertOne({
    _id: "t-other",
    user_id: "e2e-thread-other-user",
    organization: null,
    read_at: null,
    view: view({
      id: "t-other",
      key: "ENC-99",
      version: 1,
      stage: "Received",
      updated: "2026-10-01T08:00:00.000Z",
      messages: [
        message({
          id: "o1",
          from: "reporter",
          at: "2026-10-01T08:00:00.000Z",
          text: "Someone else's problem.",
        }),
      ],
    }),
  });
  await ldf.user(USER);
  pelican.answer(pelicanAnswering({ "t-logged": LOGGED }));
  await ldf.goto("/support/support?ticket=t-other");

  await expect(page.locator("#support_page_thread_notice")).toContainText(
    "No such ticket.",
  );
  await expect(page.getByText("Ticket ENC-99")).toHaveCount(0);
  await expect(page.getByText("Someone else's problem.")).toHaveCount(0);
});

test("sending a report opens its thread in the panel", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  const created = view({
    id: "t-new",
    key: "ENC-40",
    version: 1,
    stage: "Received",
    updated: "2026-10-07T09:00:00.000Z",
    messages: [
      message({
        id: "n1",
        from: "reporter",
        at: "2026-10-07T09:00:00.000Z",
        text: "Export shows an error.",
      }),
    ],
  });
  const answer = pelicanAnswering({ "t-new": created });
  pelican.answer((call) =>
    call.endpoint === "support-create-ticket"
      ? { status: 200, body: created }
      : answer(call),
  );
  await ldf.goto("/home");
  await page.locator("#support_panel .fp-launcher").click();
  await ldf.block("support_report.type").do.select("Bug");
  await ldf.block("support_report.title").do.fill("The export fails");
  await ldf.block("support_report.message").do.fill("Export shows an error.");
  await ldf.block("support_report_send").do.click();

  await expect(page.locator("#support_thread_title")).toContainText(
    "Ticket ENC-40",
  );
  await expect(page.locator("#support_thread_messages")).toContainText(
    "Export shows an error.",
  );
  await ldf.state("support_view").expect.toBe("tickets");
});
