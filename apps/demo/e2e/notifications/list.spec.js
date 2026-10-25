import { test, expect } from "../fixtures.js";
import { COLLECTION, USER, record } from "./fixtures.js";

// The one-column inbox (`layout: list`). Build the server with
// NOTIFICATIONS_LAYOUT=list to run it:
//   NOTIFICATIONS_LAYOUT=list pnpm e2e e2e/notifications/list.spec.js
test.skip(
  process.env.NOTIFICATIONS_LAYOUT !== "list",
  "built with the columns layout",
);

const LONG_BODY =
  "<p>Google Drive needs you to sign in again. Three checks failed since Tuesday.</p>";

const stopped = (id, folder, ageHours) =>
  record({
    _id: id,
    type: "sync-stopped",
    title: `${folder} folder stopped syncing`,
    preview: "Google Drive needs you to sign in again.",
    body: LONG_BODY,
    ageHours,
  });

const RECENT = [
  record({
    _id: "r1",
    type: "support-reply",
    title: "Support replied on ENC-1",
    preview: "Fixed the export",
    ageHours: 2,
    links: { button: { pageId: "deals/all" } },
  }),
  stopped("g1", "Policies", 30),
  stopped("g2", "Contracts", 30.05),
  stopped("g3", "Finance", 30.1),
  // Nothing to add to its preview: the row does not open.
  record({
    _id: "s1",
    type: "user-invite",
    title: "Welcome aboard",
    preview: "Welcome aboard",
    ageHours: 40,
  }),
];

// 30 read notifications from earlier in the year.
const EARLIER = Array.from({ length: 30 }, (_, i) =>
  record({
    _id: `e${i}`,
    type: "support-reply",
    title: `Earlier reply ${i}`,
    preview: `Preview ${i}`,
    read: true,
    ageHours: 24 * (20 + i),
  }),
);

const list = (page) => page.locator("#inbox_list");
const tab = (page, name) =>
  page.locator("#list_tabs .nx-ltab", { hasText: name });
const entries = (page) => page.locator("#inbox_list .nx-lbody");

test.beforeEach(async ({ mdb, ldf }) => {
  await mdb.collection(COLLECTION).deleteMany({});
  await mdb.collection(COLLECTION).insertMany([...RECENT, ...EARLIER]);
  await ldf.user(USER);
});

test("tabs count unread and all, and the list has no title or reading pane", async ({
  ldf,
  page,
}) => {
  await ldf.goto("/notifications/all");
  await expect(tab(page, "Unread")).toContainText("5");
  await expect(tab(page, "All")).toContainText("35");
  await expect(page.locator("#inbox_title")).toHaveCount(0);
  await expect(page.locator("#reading_pane")).toHaveCount(0);
  await expect(list(page).locator("h6")).toHaveText(/This week\s*5/);
  await page.screenshot({ path: test.info().outputPath("list-unread.png") });
});

test("same type on the same day is one group that opens in place", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.goto("/notifications/all");
  const group = entries(page).filter({ hasText: "3 folders stopped syncing" });
  await expect(group).toHaveCount(1);
  await expect(page.getByText("Contracts folder stopped syncing")).toHaveCount(
    0,
  );

  await group.click();
  await expect(page.getByText("Contracts folder stopped syncing")).toBeVisible();

  // A row with a longer body opens in place, reads, and shows its body.
  await entries(page)
    .filter({ hasText: "Contracts folder stopped syncing" })
    .click();
  await expect(list(page)).toContainText("Three checks failed since Tuesday");
  await expect
    .poll(async () => (await mdb.collection(COLLECTION).findOne({ _id: "g2" })).read)
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath("list-group.png") });
});

test("a row with a link target opens the target through the link page", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.goto("/notifications/all");
  await entries(page).filter({ hasText: "Support replied on ENC-1" }).click();
  await expect(page).toHaveURL(/deals\/all/);
  await expect
    .poll(async () => (await mdb.collection(COLLECTION).findOne({ _id: "r1" })).read)
    .toBe(true);
});

test("a row with nothing more to show does not open", async ({ ldf, page }) => {
  await ldf.goto("/notifications/all");
  const row = page.locator("#inbox_list .nx-lrow--static");
  await expect(row).toHaveCount(1);
  await expect(row.locator("[data-event='onOpen']")).toHaveCount(0);
});

test("All shows 25 rows, the true remainder, and Show more adds 25 at most", async ({
  ldf,
  page,
}) => {
  await ldf.goto("/notifications/all");
  await tab(page, "All").click();
  await expect(page.locator("#inbox_list .nx-lmore")).toContainText(
    "Show 10 more of 10",
  );
  await expect(list(page).locator("h6", { hasText: "Earlier" })).toContainText(
    "30",
  );
  await page.locator("#inbox_list .nx-lmore span").click();
  await expect(page.locator("#inbox_list .nx-lmore")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("list-all.png") });
});

test("Filter narrows by date, and Mark all as read is a link that goes at zero", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.goto("/notifications/all");
  await tab(page, "All").click();
  await page.getByRole("button", { name: /Filter/ }).click();
  await page.locator(".nx-lchip", { hasText: "Today" }).click();
  await expect(page.getByRole("button", { name: /Filter · 1/ })).toBeVisible();
  await expect(page.locator("#inbox_list .nx-lempty, #inbox_list .nx-lrow").first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("list-filter.png") });
  await page.locator(".nx-lchip--on").click();

  await page.keyboard.press("Escape");
  await tab(page, "Unread").click();
  const markAll = page.locator("#button_mark_all_read");
  await expect(markAll).toContainText("Mark all as read");
  await markAll.click();
  await expect
    .poll(async () => mdb.collection(COLLECTION).countDocuments({ read: false }))
    .toBe(0);
  await expect(markAll).toHaveCount(0);
  await expect(list(page)).toContainText("all caught up");
  await expect(tab(page, "Unread")).toContainText("0");
});

test("on a phone the toolbar and rows fit one column", async ({ ldf, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ldf.goto("/notifications/all");
  await expect(entries(page).first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("list-phone.png") });
});
