import { test, expect } from "../fixtures.js";
import { createPelicanStub } from "./pelican-stub.js";

// The report drawer and its open-report action: a person reports a problem
// from a page with no help panel open and no model call, with a draft filled
// in and the app's own link beside Send. Also the count of tickets waiting for
// a reply and the support-reply notification a reply marks read.

const USER = {
  id: "e2e-drawer-user-id",
  sub: "e2e-drawer-user-sub",
  name: "Drawer User",
  email: "drawer@example.com",
  organization_id: "demo",
  roles: ["admin"],
  profile: { name: "Drawer User" },
};

const S3_URL = "https://s3.e2e.test/support-drawer-upload";
const KEY = `support/${USER.id}/e2e-drawer/file`;

const createdView = {
  id: "t-drawer",
  key: "ENC-61",
  title: "Something is wrong on the home page",
  type: "bug",
  version: 1,
  stage: "received",
  created: "2026-10-07T09:00:00.000Z",
  updated: "2026-10-07T09:00:00.000Z",
  messages: [],
};

const ticketRow = ({ id, key, stage, organization }) => ({
  _id: id,
  user_id: USER.id,
  organization,
  read_at: null,
  view: {
    ...createdView,
    id,
    key,
    title: `Ticket ${key}`,
    stage,
    messages: [
      {
        id: `${id}-m1`,
        from: "team",
        author: { name: "Ann Team" },
        at: "2026-10-07T09:00:00.000Z",
        text: "Which file?",
        files: [],
        deleted: false,
      },
    ],
  },
});

const pelican = createPelicanStub();

test.beforeAll(() => pelican.start());
test.afterAll(() => pelican.stop());

test.beforeEach(async ({ ldf, page, mdb }) => {
  await mdb.collection("support-tickets").deleteMany({});
  await mdb.collection("notifications").deleteMany({});
  pelican.reset();
  for (const id of [
    "upload_policy_support_drawer_files",
    "upload_policy_support_report_files",
  ]) {
    await ldf.mock.request(id, {
      response: { url: S3_URL, fields: { key: KEY, bucket: "e2e-bucket" } },
    });
  }
  await page.route(`${S3_URL}**`, (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
});

test("open-report opens the drawer with the draft filled in, and Send files the ticket with no model call", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  pelican.answer((call) =>
    call.endpoint === "support-create-ticket"
      ? { status: 200, body: createdView }
      : { status: 500, body: {} },
  );
  await ldf.goto("/home");
  await expect(page.locator("#support_drawer_drawer")).toHaveCount(0);

  await page.locator("#report_problem").click();
  const drawer = page.locator("#support_drawer_drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Report a problem");
  await expect(page.locator("#support_drawer\\.title_input")).toHaveValue(
    "Something is wrong on the home page",
  );
  await ldf.state("support_drawer.type").expect.toBe("bug");
  // The app's own link sits beside Send.
  await expect(page.locator("#report_ask_assistant")).toContainText(
    "Ask the assistant instead",
  );

  await ldf.block("support_drawer.message").do.fill("The cards do not load.");
  await page.getByTestId("support_drawer.message_send").click();

  await expect(drawer).toBeHidden();
  const created = pelican.calls.filter(
    (c) => c.endpoint === "support-create-ticket",
  );
  expect(created).toHaveLength(1);
  const [sent] = created;
  expect(sent.body.type).toBe("bug");
  expect(sent.body.title).toBe("Something is wrong on the home page");
  expect(sent.body.message).toBe("The cards do not load.");
  expect(sent.body.context.page).toBe("home");
  expect(sent.body.context.extra).toEqual({ opened_from: "home" });

  // Opened again, the draft is blank except what the action fills in.
  await page.locator("#report_problem").click();
  await expect(page.locator("#support_drawer\\.message_input")).toHaveValue("");
});

test("a refused report keeps the draft in the drawer", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  pelican.answer(() => ({
    status: 429,
    body: {
      error: { code: "rate_limited", message: "Slow down.", retry_after: 30 },
    },
  }));
  await ldf.goto("/home");
  await page.locator("#report_problem").click();
  await ldf.block("support_drawer.message").do.fill("Still broken.");
  await page.getByTestId("support_drawer.message_send").click();
  await expect(page.locator("#support_drawer_error")).toContainText(
    "Something went wrong, try again in 30 seconds.",
  );
  await expect(page.locator("#support_drawer_drawer")).toBeVisible();
  await ldf.state("support_drawer.message").expect.toBe("Still broken.");
});

test("the home page counts the tickets waiting for the person's reply in their organisation", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.collection("support-tickets").insertMany([
    ticketRow({
      id: "t-wait-1",
      key: "ENC-71",
      stage: "needs_your_reply",
      organization: { id: "demo", name: "Demo" },
    }),
    ticketRow({
      id: "t-wait-2",
      key: "ENC-72",
      stage: "needs_your_reply",
      organization: { id: "elsewhere", name: "Elsewhere" },
    }),
    ticketRow({
      id: "t-quiet",
      key: "ENC-73",
      stage: "received",
      organization: { id: "demo", name: "Demo" },
    }),
  ]);
  await ldf.goto("/home");
  await expect(page.locator("#awaiting_reply")).toContainText(
    "Tickets waiting for your reply: 1",
  );
});

test("replying on a ticket marks its support-reply notification read", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  const row = ticketRow({
    id: "t-wait-1",
    key: "ENC-71",
    stage: "needs_your_reply",
    organization: { id: "demo", name: "Demo" },
  });
  await mdb.collection("support-tickets").insertOne(row);
  const notification = (_id, ticketKey) => ({
    _id,
    type: "support-reply",
    title: "The support team replied",
    contact_id: USER.id,
    user_id: USER.id,
    read: false,
    popup: false,
    data: { ticket_key: ticketKey },
    created: { app_name: "demo", timestamp: new Date() },
  });
  await mdb
    .collection("notifications")
    .insertMany([
      notification("n-71", "ENC-71"),
      notification("n-72", "ENC-72"),
    ]);
  const replied = {
    ...row.view,
    version: 2,
    stage: "in_progress",
    messages: [
      ...row.view.messages,
      {
        id: "t-wait-1-m2",
        from: "reporter",
        author: { name: "Drawer User" },
        at: "2026-10-07T10:00:00.000Z",
        text: "This file.",
        files: [],
        deleted: false,
      },
    ],
  };
  pelican.answer((call) => {
    if (call.endpoint === "support-get-ticket") {
      return { status: 200, body: row.view };
    }
    if (call.endpoint === "support-post-message") {
      return { status: 200, body: replied };
    }
    return { status: 500, body: {} };
  });
  await ldf.goto("/support/ENC-71");
  await expect(page.locator("#support_page_thread_messages")).toContainText(
    "Which file?",
  );
  await ldf.block("support_page_reply.message").do.fill("This file.");
  await page.getByTestId("support_page_reply.message_send").click();
  await expect(page.locator("#support_page_thread_messages")).toContainText(
    "This file.",
  );

  await expect
    .poll(
      async () =>
        (await mdb.collection("notifications").findOne({ _id: "n-71" })).read,
    )
    .toBe(true);
  const stamped = await mdb
    .collection("notifications")
    .findOne({ _id: "n-71" });
  expect(stamped.updated.user.id).toBe(USER.id);
  // Another ticket's notification stays unread.
  expect(
    (await mdb.collection("notifications").findOne({ _id: "n-72" })).read,
  ).toBe(false);
});
