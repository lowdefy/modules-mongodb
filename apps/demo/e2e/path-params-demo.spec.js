import { test, expect } from "./fixtures.js";

// The path-params-demo page is served at /path-params-demo/{item_id}. Each item
// id is its own page instance, and a notification about an item links back to
// it with the item's path value through the notifications module: the popup's
// View button and the notification landing page.

const USER = {
  id: "e2e-path-params",
  name: "Path Params",
  email: "path-params@example.com",
  roles: [],
};

const note = (page) =>
  page.getByRole("textbox", { name: /Note for this item/ });

test.describe("path parameters demo", () => {
  test.beforeEach(async ({ ldf }) => {
    await ldf.user(USER);
  });

  test("each item id opens its own page instance", async ({ page }) => {
    await page.goto("/path-params-demo/item-1");
    await expect(page.getByTestId("item_intro")).toContainText(
      "/path-params-demo/item-1",
    );
    await note(page).fill("first item");

    await page.getByRole("button", { name: "Item 2" }).click();
    await expect(page).toHaveURL(/\/path-params-demo\/item-2$/);
    await expect(page.getByTestId("item_intro")).toContainText(
      "/path-params-demo/item-2",
    );
    await expect(note(page)).toHaveValue("");

    await page.getByRole("button", { name: "Item 1" }).click();
    await expect(page).toHaveURL(/\/path-params-demo\/item-1$/);
    await expect(note(page)).toHaveValue("first item");
  });

  test("a notification about an item opens that item", async ({ page }) => {
    await page.goto("/path-params-demo/item-2");
    await page
      .getByRole("button", { name: "Notify me about this item" })
      .click();
    await expect(
      page.getByRole("button", { name: "Open the notification link" }),
    ).toBeVisible();

    // The popup stack is read when a page mounts, so the next page shows it.
    await page.getByRole("button", { name: "Item 1" }).click();
    await expect(page).toHaveURL(/\/path-params-demo\/item-1$/);
    const view = page.getByRole("button", { name: "View" });
    await expect(view).toBeVisible();
    await view.click();
    await expect(page).toHaveURL(/\/path-params-demo\/item-2$/);
    await expect(page.getByTestId("item_intro")).toContainText(
      "/path-params-demo/item-2",
    );

    await page
      .getByRole("button", { name: "Open the notification link" })
      .click();
    await expect(page).toHaveURL(/\/path-params-demo\/item-2$/);
    await expect(page.getByTestId("item_intro")).toContainText(
      "/path-params-demo/item-2",
    );
  });

  test("the notification landing link opens the item on a fresh load", async ({
    page,
    mdb,
  }) => {
    await mdb.seed("notifications", [
      {
        _id: "e2e-path-params-notification",
        contact_id: USER.id,
        user_id: USER.id,
        type: "path-params-demo",
        popup: false,
        read: false,
        title: "Item 3",
        links: {
          button: {
            pageId: "path-params-demo",
            pathParams: { item_id: "item-3" },
          },
        },
        created: { timestamp: new Date(), app_name: "demo" },
      },
    ]);
    await page.goto("/notifications/link?_id=e2e-path-params-notification");
    await expect(page).toHaveURL(/\/path-params-demo\/item-3$/);
    await expect(page.getByTestId("item_intro")).toContainText(
      "/path-params-demo/item-3",
    );
  });
});
