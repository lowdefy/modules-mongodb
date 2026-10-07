import { test, expect } from "../fixtures.js";
import { createPelicanStub } from "./pelican-stub.js";

// The live thread: a change to the user's row in the copy (a webhook, or a sync
// from another tab) shows in the open thread, in the panel and on the support
// page. The channel opens only while a thread is open, moves with the open
// thread, and another user's ticket id delivers nothing.

const TICKETS = "support-tickets";
const WEBSOCKET = "support/ticket-thread";

const USER = {
  id: "e2e-live-user-id",
  sub: "e2e-live-user-sub",
  name: "Live User",
  email: "live@example.com",
  organization_id: "demo",
  roles: ["admin"],
  profile: { name: "Live User" },
};

const message = (id, from, text) => ({
  id,
  from,
  author: { name: from === "team" ? "Ann Team" : "Live User" },
  at: "2026-10-02T09:00:00.000Z",
  text,
  files: [],
  deleted: false,
});

const view = (id, key, version, messages) => ({
  id,
  key,
  title: `Ticket ${key}`,
  type: "bug",
  version,
  stage: "In progress",
  created: "2026-10-01T08:00:00.000Z",
  updated: `2026-10-02T10:0${version}:00.000Z`,
  messages,
});

const FIRST = view("t-live-1", "ENC-41", 2, [
  message("m1", "reporter", "The chart is empty."),
  message("m2", "team", "Looking at it now."),
]);
const SECOND = view("t-live-2", "ENC-42", 1, [
  message("n1", "reporter", "Export times out."),
]);
const OTHERS = view("t-live-other", "ENC-43", 1, [
  message("o1", "reporter", "Someone else's ticket."),
]);

const pelican = createPelicanStub();

test.beforeAll(() => pelican.start());
test.afterAll(() => pelican.stop());

test.beforeEach(async ({ mdb }) => {
  await mdb.collection(TICKETS).deleteMany({});
  await mdb.collection(TICKETS).insertMany([
    {
      _id: FIRST.id,
      user_id: USER.id,
      organization: null,
      read_at: null,
      view: FIRST,
    },
    {
      _id: SECOND.id,
      user_id: USER.id,
      organization: null,
      read_at: null,
      view: SECOND,
    },
    {
      _id: OTHERS.id,
      user_id: "e2e-live-other-user-id",
      organization: null,
      read_at: null,
      view: OTHERS,
    },
  ]);
  pelican.reset();
  // Pelican answers with what the copy holds, so opening a thread changes nothing.
  pelican.answer(({ endpoint, body }) => {
    const views = {
      [FIRST.id]: FIRST,
      [FIRST.key]: FIRST,
      [SECOND.id]: SECOND,
      [SECOND.key]: SECOND,
    };
    if (endpoint === "support-list-tickets") {
      return {
        status: 200,
        body: [FIRST, SECOND].map(({ messages, ...rest }) => rest),
      };
    }
    if (endpoint === "support-get-ticket" && views[body.ticket]) {
      return { status: 200, body: views[body.ticket] };
    }
    return {
      status: 404,
      body: { error: { code: "not_found", message: "No such ticket." } },
    };
  });
});

// The ticket-thread frames the page sends, oldest first.
function watchChannel(page) {
  const frames = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      const frame = JSON.parse(payload);
      if (frame.websocketId === WEBSOCKET) frames.push(frame);
    });
  });
  return {
    frames,
    // The ticket id the open channel follows, or null when none is open.
    open: () => {
      let open = null;
      for (const frame of frames) {
        if (frame.type === "subscribe") open = frame.payload.ticket_id;
        if (frame.type === "unsubscribe") open = null;
      }
      return open;
    },
  };
}

async function teamReply(mdb, ticket, version, text) {
  const next = view(ticket.id, ticket.key, version, [
    ...ticket.messages,
    message(`live-${version}`, "team", text),
  ]);
  await mdb
    .collection(TICKETS)
    .updateOne({ _id: ticket.id }, { $set: { view: next } });
}

const rows = (page, prefix) =>
  page.locator(`#${prefix}_tickets_list .ant-card`);

test("a change to the row shows in the open panel thread within a second and marks it read", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  const channel = watchChannel(page);
  await ldf.goto("/home");
  await page.locator("#support_panel .fp-launcher").click();
  await page
    .locator("#support_view")
    .getByText("My tickets", { exact: true })
    .click();
  await expect(rows(page, "support")).toHaveCount(2);
  expect(channel.open()).toBe(null);

  await rows(page, "support").filter({ hasText: "ENC-41" }).click();
  await expect(page.locator("#support_thread_messages")).toContainText(
    "Looking at it now.",
  );
  await expect.poll(channel.open).toBe(FIRST.id);
  const readBefore = (await mdb.collection(TICKETS).findOne({ _id: FIRST.id }))
    .read_at;

  await teamReply(mdb, FIRST, 3, "Fixed, try again.");
  await expect(page.locator("#support_thread_messages")).toContainText(
    "Fixed, try again.",
    {
      timeout: 1000,
    },
  );
  await expect
    .poll(
      async () =>
        (await mdb.collection(TICKETS).findOne({ _id: FIRST.id })).read_at,
    )
    .not.toEqual(readBefore);

  // Back to the list closes the channel; the next thread opens it again.
  await ldf.block("support_thread_back").do.click();
  await expect.poll(channel.open).toBe(null);
  await rows(page, "support").filter({ hasText: "ENC-42" }).click();
  await expect.poll(channel.open).toBe(SECOND.id);

  // Closing the panel closes it too.
  await page.locator("#support_panel").getByLabel("Close panel").click();
  await expect.poll(channel.open).toBe(null);
});

test("the support page thread is live, and opening another ticket moves the one channel", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  const channel = watchChannel(page);
  await ldf.goto("/support/support?ticket=ENC-41");
  await expect(page.locator("#support_page_thread_messages")).toContainText(
    "Looking at it now.",
  );
  await expect.poll(channel.open).toBe(FIRST.id);

  await teamReply(mdb, FIRST, 3, "Deployed the fix.");
  await expect(page.locator("#support_page_thread_messages")).toContainText(
    "Deployed the fix.",
    {
      timeout: 1000,
    },
  );

  await rows(page, "support_page").filter({ hasText: "ENC-42" }).click();
  await expect(page.locator("#support_page_thread_title")).toContainText(
    "Ticket ENC-42",
  );
  await expect.poll(channel.open).toBe(SECOND.id);

  await teamReply(mdb, SECOND, 2, "Can you send the file?");
  await expect(page.locator("#support_page_thread_messages")).toContainText(
    "Can you send the file?",
    { timeout: 1000 },
  );
});

test("another user's ticket id delivers nothing", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await ldf.goto("/home");
  // A raw subscription as this user, naming a ticket that is not theirs.
  const received = await page.evaluate(
    ({ websocketId, ticketId }) =>
      new Promise((resolve) => {
        const socket = new WebSocket(
          `${location.origin.replace(/^http/, "ws")}/api/websocket`,
        );
        const frames = [];
        socket.onmessage = (event) => frames.push(JSON.parse(event.data));
        socket.onopen = () =>
          socket.send(
            JSON.stringify({
              type: "subscribe",
              websocketId,
              requestId: "e2e-other",
              payload: { ticket_id: ticketId },
            }),
          );
        window.__otherFrames = frames;
        window.__otherSocket = socket;
        const wait = () =>
          frames.some((frame) => frame.type === "subscribed")
            ? resolve(frames)
            : setTimeout(wait, 50);
        wait();
      }),
    { websocketId: WEBSOCKET, ticketId: OTHERS.id },
  );
  expect(received.some((frame) => frame.type === "subscribed")).toBe(true);

  await teamReply(mdb, OTHERS, 2, "Not for you.");
  await page.waitForTimeout(1500);
  const frames = await page.evaluate(() => {
    window.__otherSocket.close();
    return window.__otherFrames;
  });
  expect(frames.filter((frame) => frame.type !== "subscribed")).toEqual([]);
});
