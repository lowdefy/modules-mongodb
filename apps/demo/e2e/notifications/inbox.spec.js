import { test, expect } from "../fixtures.js";
import { COLLECTION, OTHER_USER_ID, USER, record } from "./fixtures.js";

// The inbox: a view narrows the list, and Mark all as read then marks only the
// signed-in user's unread records in that view.

const RECORDS = [
  record({ _id: "q1", type: "quote-approved", title: "Quote approved Q1" }),
  record({ _id: "q2", type: "quote-approved", title: "Quote approved Q2" }),
  record({
    _id: "s1",
    type: "support-reply",
    title: "Support replied on ENC-1",
    preview: "Fixed the export",
  }),
  record({
    _id: "s2",
    type: "support-reply",
    title: "Support replied on ENC-2",
    read: true,
  }),
  record({
    _id: "o1",
    type: "quote-approved",
    title: "Someone else's approval",
    userId: OTHER_USER_ID,
  }),
];

const rows = (page) => page.locator("#selected_id .nx-row");

const unreadIds = async (mdb) =>
  (await mdb.collection(COLLECTION).find({ read: false }).toArray())
    .map((r) => r._id)
    .sort();

test.beforeEach(async ({ mdb, ldf }) => {
  await mdb.collection(COLLECTION).deleteMany({});
  await mdb.collection(COLLECTION).insertMany(RECORDS);
  await ldf.user(USER);
});

test("the inbox lists the user's unread notifications and the rail counts them", async ({
  ldf,
  page,
}) => {
  await ldf.goto("/notifications/all");
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator("#inbox_title")).toContainText("3 unread");
  await expect(page.locator("#rail")).toContainText("Approvals");
  await expect(page.locator("#button_mark_all_read")).toContainText(
    "Mark all as read",
  );
  await page.screenshot({ path: test.info().outputPath("inbox.png") });
});

test("mark all as read in a view marks only that view's records of the user", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.goto("/notifications/all");
  await expect(rows(page)).toHaveCount(3);

  const approvals = page.locator("#rail .nx-rail-item", {
    hasText: "Approvals",
  });
  // The rail re-renders once its counts load; click the settled item.
  await expect(approvals.locator(".nx-rail-count")).toHaveText("2");
  await approvals.click();
  await expect(rows(page)).toHaveCount(2);
  const button = page.locator("#button_mark_all_read");
  await expect(button).toContainText("Mark 2 as read");

  await button.click();
  await expect.poll(() => unreadIds(mdb)).toEqual(["o1", "s1"]);
  await expect(button).toBeDisabled();
});

test("opening a notification marks it read, and Mark as unread sets it back", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.goto("/notifications/all");
  await rows(page).filter({ hasText: "Support replied on ENC-1" }).click();
  await expect(page.locator("#pane_title")).toContainText(
    "Support replied on ENC-1",
  );
  await expect
    .poll(
      async () =>
        (await mdb.collection(COLLECTION).findOne({ _id: "s1" })).read,
    )
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath("inbox-open.png") });

  await page.locator("#button_mark_unread").click();
  await expect
    .poll(
      async () =>
        (await mdb.collection(COLLECTION).findOne({ _id: "s1" })).read,
    )
    .toBe(false);
});

test("search narrows the list on the server", async ({ ldf, page }) => {
  await ldf.goto("/notifications/all");
  await expect(rows(page)).toHaveCount(3);
  await page.locator("#filter\\.search_input").fill("export");
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator("#button_mark_all_read")).toContainText(
    "Mark 1 as read",
  );
});

test("on a phone the list and the pane take turns", async ({ ldf, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ldf.goto("/notifications/all");
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator("#rail")).toBeHidden();
  await expect(page.locator("#view_picker")).toBeVisible();

  await rows(page).filter({ hasText: "Quote approved Q1" }).click();
  await expect(page.locator("#pane_title")).toContainText("Quote approved Q1");
  await expect(page.locator("#selected_id")).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("phone-pane.png") });

  await page.locator("#pane_back").click();
  await expect(rows(page)).toHaveCount(3);
  await page.screenshot({ path: test.info().outputPath("phone-list.png") });
});

test("a link to one notification opens it even when the Unread list is empty", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb
    .collection(COLLECTION)
    .updateMany({ user_id: USER.id }, { $set: { read: true } });
  await ldf.goto("/notifications/all?_id=s2");
  await expect(page.locator("#pane_title")).toContainText(
    "Support replied on ENC-2",
  );
  await expect(page.locator("#list_empty")).toContainText("caught up");
});
