import { test, expect } from "../fixtures.js";

// The demo's `user-admin` entry leaves `remove_member` and `delete_user` at
// their default, and `customer-user-admin` sets both false. The two entries
// share one module source, so the same view page and the same two endpoints
// are compared under each setting.
//
// The happy path of `remove-member` and `delete-user` runs auth actions, which
// the e2e server does not run, so these specs cover what the vars change: the
// buttons on the view page and the rejection before any step that writes.

const TARGET_ID = "e2e-removal-target";

const ADMIN = {
  id: "e2e-removal-admin",
  name: "Removal Admin",
  email: "removal-admin@example.com",
  roles: ["user-admin", "customer-user-admin"],
  profile: { name: "Removal Admin" },
};

// One membership per administered organization, so the target shows on both
// entries' view pages.
const MEMBERS = [
  {
    _id: "e2e-removal-member-demo",
    user_id: TARGET_ID,
    organization_id: "demo",
    role: "member",
    app_roles: ["user"],
    created_at: new Date(),
  },
  {
    _id: "e2e-removal-member-customer",
    user_id: TARGET_ID,
    organization_id: "customer-portal",
    role: "member",
    app_roles: ["user"],
    created_at: new Date(),
  },
];

// A block's root element carries `bl-{id}` or the id itself, depending on the
// block. Counting both keeps an absence assertion from passing on a selector
// that never matches.
function blockLocator(page, id) {
  return page.locator(`#bl-${id}, #${id}`);
}

async function callEndpoint(page, entryId, endpointId, payload) {
  const raw = await page.request.post(
    `/api/endpoints/${entryId}/${endpointId}`,
    { data: { payload } },
  );
  const body = await raw.json().catch(() => null);
  return {
    status: raw.status(),
    body,
    rejected: body?.success === false && body?.status === "reject",
  };
}

test.describe("user-admin removal settings", () => {
  test.beforeEach(async ({ ldf, mdb }) => {
    await mdb.seed("users", [
      {
        _id: TARGET_ID,
        name: "Removal Target",
        email: "removal-target@example.com",
        email_verified: true,
      },
    ]);
    await mdb.seed("user-members", MEMBERS);
    await ldf.user(ADMIN);
  });

  test("the view page offers Remove from app and Delete login by default", async ({
    ldf,
    page,
  }) => {
    await ldf.goto(`/user-admin/view?user_id=${TARGET_ID}`);
    await ldf.request("get_user_detail").expect.toFinish();
    await ldf.block("revoke_btn").expect.visible();

    await expect(blockLocator(page, "remove_btn").first()).toBeVisible();
    await expect(blockLocator(page, "delete_btn").first()).toBeVisible();
    await expect(blockLocator(page, "modal_remove")).not.toHaveCount(0);
    await expect(blockLocator(page, "modal_delete")).not.toHaveCount(0);
  });

  test("the view page leaves both out when the vars are false", async ({
    ldf,
    page,
  }) => {
    await ldf.goto(`/customer-user-admin/view?user_id=${TARGET_ID}`);
    await ldf.request("get_user_detail").expect.toFinish();
    await ldf.block("revoke_btn").expect.visible();
    await ldf.block("suspend_btn").expect.visible();

    for (const id of [
      "remove_tooltip",
      "remove_btn",
      "modal_remove",
      "delete_tooltip",
      "delete_btn",
      "modal_delete",
    ]) {
      await expect(blockLocator(page, id)).toHaveCount(0);
    }
  });

  test("remove-member rejects and deletes no member row when remove_member is false", async ({
    page,
    mdb,
  }) => {
    const { status, body, rejected } = await callEndpoint(
      page,
      "customer-user-admin",
      "remove-member",
      {
        member_id: "e2e-removal-member-customer",
        user_id: TARGET_ID,
      },
    );

    expect(status).toBe(200);
    expect(rejected).toBe(true);
    expect(JSON.stringify(body.error)).toContain('\\"remove_member\\" var');

    const members = await mdb
      .collection("user-members")
      .find({ user_id: TARGET_ID })
      .toArray();
    expect(members.map((m) => m._id).sort()).toEqual(
      MEMBERS.map((m) => m._id).sort(),
    );
  });

  test("delete-user reaches its membership guard by default", async ({
    page,
    mdb,
  }) => {
    const { rejected, body } = await callEndpoint(
      page,
      "user-admin",
      "delete-user",
      { user_id: TARGET_ID },
    );

    expect(rejected).toBe(true);
    expect(JSON.stringify(body.error)).toContain("belongs to other apps");
    expect(
      await mdb.collection("users").findOne({ _id: TARGET_ID }),
    ).not.toBeNull();
  });

  test("delete-user rejects and deletes nothing when delete_user is false", async ({
    page,
    mdb,
  }) => {
    // Drop the other membership so the routine's own guard (no membership in
    // another organization) would let the delete through: the rejection is
    // then the var's, not the guard's.
    await mdb
      .collection("user-members")
      .deleteOne({ _id: "e2e-removal-member-demo" });

    const { status, body, rejected } = await callEndpoint(
      page,
      "customer-user-admin",
      "delete-user",
      { user_id: TARGET_ID },
    );

    expect(status).toBe(200);
    expect(rejected).toBe(true);
    expect(JSON.stringify(body.error)).toContain('\\"delete_user\\" var');

    expect(
      await mdb.collection("users").findOne({ _id: TARGET_ID }),
    ).not.toBeNull();
    expect(
      await mdb
        .collection("user-members")
        .countDocuments({ user_id: TARGET_ID }),
    ).toBe(1);
  });
});
