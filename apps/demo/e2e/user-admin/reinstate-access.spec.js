import { test, expect } from "../fixtures.js";

// The Security tile offers Suspend access to an active user and Reinstate
// access to a suspended one, keyed off the detail read's `banned`. The unban
// itself is an auth action the e2e server does not run, so these specs cover
// which button the tile offers and the confirm it opens.

const TARGET_ID = "e2e-reinstate-target";

const ADMIN = {
  id: "e2e-reinstate-admin",
  name: "Reinstate Admin",
  email: "reinstate-admin@example.com",
  roles: ["user-admin"],
  profile: { name: "Reinstate Admin" },
};

function blockLocator(page, id) {
  return page.locator(`#bl-${id}, #${id}`);
}

async function seedTarget(mdb, banned) {
  await mdb.seed("users", [
    {
      _id: TARGET_ID,
      name: "Reinstate Target",
      email: "reinstate-target@example.com",
      email_verified: true,
      banned,
    },
  ]);
  await mdb.seed("user-members", [
    {
      _id: "e2e-reinstate-member",
      user_id: TARGET_ID,
      organization_id: "demo",
      role: "member",
      app_roles: ["user"],
      created_at: new Date(),
    },
  ]);
}

test.describe("user-admin reinstate access", () => {
  test.beforeEach(async ({ ldf }) => {
    await ldf.user(ADMIN);
  });

  test("an active user is offered Suspend access only", async ({
    ldf,
    mdb,
    page,
  }) => {
    await seedTarget(mdb, false);
    await ldf.goto(`/user-admin/view?user_id=${TARGET_ID}`);
    await ldf.request("get_user_detail").expect.toFinish();

    await ldf.block("suspend_btn").expect.visible();
    await expect(blockLocator(page, "reinstate_btn").first()).toBeHidden();
  });

  test("a suspended user is offered Reinstate access, which opens its confirm", async ({
    ldf,
    mdb,
    page,
  }) => {
    await seedTarget(mdb, true);
    await ldf.goto(`/user-admin/view?user_id=${TARGET_ID}`);
    await ldf.request("get_user_detail").expect.toFinish();

    await ldf.block("reinstate_btn").expect.visible();
    await expect(blockLocator(page, "suspend_btn").first()).toBeHidden();

    await ldf.block("reinstate_btn").do.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Reinstate Reinstate Target?");
    await expect(dialog).toContainText("every app they belong to");
    await expect(
      dialog.getByRole("button", { name: "Reinstate access" }),
    ).toBeVisible();
  });

  test("confirming calls reinstate and the page switches back to Active", async ({
    ldf,
    mdb,
    page,
  }) => {
    await seedTarget(mdb, true);

    // Stand in for the endpoint: record its payload and lift the ban the way
    // UnbanUser would, so the page's refetch reads the reinstated user.
    let payload = null;
    await page.route("**/api/endpoints/user-admin/reinstate", async (route) => {
      payload = JSON.parse(route.request().postData()).payload;
      await mdb
        .collection("users")
        .updateOne({ _id: TARGET_ID }, { $set: { banned: false } });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, response: { success: true } }),
      });
    });

    await ldf.goto(`/user-admin/view?user_id=${TARGET_ID}`);
    await ldf.request("get_user_detail").expect.toFinish();
    const pill = blockLocator(page, "title-status-pill").first();
    await expect(pill).toHaveText("Suspended");

    await ldf.block("reinstate_btn").do.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Reinstate access" })
      .click();

    await expect(page.getByText("Access reinstated.")).toBeVisible();
    expect(payload).toEqual({
      user_id: TARGET_ID,
      target_name: "Reinstate Target",
      target_email: "reinstate-target@example.com",
    });
    await ldf.block("suspend_btn").expect.visible();
    await expect(blockLocator(page, "reinstate_btn").first()).toBeHidden();
    await expect(pill).toHaveText("Active");
  });
});
