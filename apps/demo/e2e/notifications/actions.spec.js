import { test, expect } from "../fixtures.js";
import { COLLECTION, USER, record } from "./fixtures.js";

// Action types (the notifications `action_types` var; the demo lists
// `action-needed`): stored like any notification, but out of the inbox, the
// bell and the toasts, and still reachable through the link page.

const bell = (page) =>
  page.getByRole("link", { name: "Notifications" }).locator(".ant-badge");

test.beforeEach(async ({ mdb, ldf }) => {
  await mdb.collection(COLLECTION).deleteMany({});
  await mdb.collection(COLLECTION).insertMany([
    record({ _id: "q1", type: "quote-approved", title: "Quote approved Q1" }),
    record({
      _id: "a1",
      type: "action-needed",
      title: "Renew the licence",
      popup: true,
    }),
  ]);
  await ldf.user(USER);
});

test("an action type is not listed, not counted by the bell and does not toast", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.goto("/notifications/all");
  await expect(page.getByText("Quote approved Q1")).toBeVisible();
  await expect(bell(page)).toContainText("1");
  await expect(page.getByText("Renew the licence")).toHaveCount(0);
  await expect(page.locator("#popup_notifications")).toBeHidden();

  // One that arrives while the page is open does not toast either.
  await mdb.collection(COLLECTION).insertOne(
    record({
      _id: "a2",
      type: "action-needed",
      title: "Renew the other licence",
      popup: true,
    }),
  );
  await page.waitForTimeout(1500);
  await expect(page.locator("#popup_notifications")).toBeHidden();
  await expect(bell(page)).toContainText("1");
  await expect(page.getByText("Renew the other licence")).toHaveCount(0);
});

test("the link page still lands on an action's target and passes `resolved`", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.collection(COLLECTION).insertOne({
    ...record({ _id: "a3", type: "action-needed", title: "Renewed" }),
    data: {
      links: { button: { pageId: "deals/all" } },
      resolved: { by: "Naledi", verb: "renewed", at: "2026-10-20T08:00:00Z" },
    },
  });
  await ldf.goto("/notifications/link?_id=a3");
  await expect(page).toHaveURL(/deals\/all/);
  expect(decodeURIComponent(page.url())).toContain('"verb":"renewed"');
  await expect
    .poll(async () => (await mdb.collection(COLLECTION).findOne({ _id: "a3" })).read)
    .toBe(true);
});
