import { test, expect } from "../fixtures.js";
import { COLLECTION, OTHER_USER_ID, USER, record } from "./fixtures.js";

// These specs drive the three-column layout; the list layout has list.spec.js.
test.skip(
  process.env.NOTIFICATIONS_LAYOUT === "list",
  "built with the list layout",
);

// The live feed: a popup notification inserted while a page is open toasts
// without a reload, reading it elsewhere takes the toast down, the bell
// follows, and another user's notification never arrives.

const toasts = (page) =>
  page.locator("#popup_notifications .ant-btn", {
    hasText: "Dismiss",
  });

test.beforeEach(async ({ mdb, ldf }) => {
  await mdb.collection(COLLECTION).deleteMany({});
  await ldf.user(USER);
});

// Opens a page and waits until it has subscribed to the live feed.
async function openWithFeed(ldf, page) {
  let subscribed = false;
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (String(payload).includes("notifications-live")) subscribed = true;
    });
  });
  await ldf.goto("/home");
  await expect.poll(() => subscribed).toBe(true);
}

test("a popup notification inserted while a page is open toasts without a reload", async ({
  ldf,
  page,
  mdb,
}) => {
  await openWithFeed(ldf, page);
  await mdb.collection(COLLECTION).insertOne(
    record({
      _id: "live-1",
      type: "quote-approved",
      title: "Quote approved live",
      preview: "Priya approved your quote.",
      popup: true,
      links: { button: { pageId: "notifications/all" } },
    }),
  );
  const toast = page.locator("#popup_notifications");
  await expect(toast).toContainText("Quote approved live", { timeout: 5000 });
  await expect(toast.getByRole("button", { name: "Open" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("toast.png") });

  // Read elsewhere: the toast leaves this page too.
  await mdb
    .collection(COLLECTION)
    .updateOne({ _id: "live-1" }, { $set: { read: true } });
  await expect(toasts(page)).toHaveCount(0, { timeout: 5000 });
});

test("dismissing a toast marks it read", async ({ ldf, page, mdb }) => {
  await openWithFeed(ldf, page);
  await mdb.collection(COLLECTION).insertOne(
    record({
      _id: "live-2",
      type: "support-reply",
      title: "Support replied live",
      popup: true,
    }),
  );
  await expect(toasts(page)).toHaveCount(1, { timeout: 5000 });
  await toasts(page).click();
  await expect
    .poll(
      async () =>
        (await mdb.collection(COLLECTION).findOne({ _id: "live-2" })).read,
    )
    .toBe(true);
});

test("a notification without popup only updates, and another user's never arrives", async ({
  ldf,
  page,
  mdb,
}) => {
  await openWithFeed(ldf, page);
  await mdb.collection(COLLECTION).insertMany([
    record({
      _id: "other-1",
      type: "quote-approved",
      title: "Not yours",
      popup: true,
      userId: OTHER_USER_ID,
    }),
    record({ _id: "quiet-1", type: "support-reply", title: "Quiet one" }),
  ]);
  // The quiet one reaches the bell; nothing toasts.
  await expect(
    page.getByRole("link", { name: "Notifications" }).locator(".ant-badge"),
  ).toContainText("1", { timeout: 5000 });
  await expect(page.locator("#popup_notifications")).toBeHidden();
});
