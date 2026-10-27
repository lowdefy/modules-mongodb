import { test, expect } from "../fixtures.js";

// Delete login identity keeps the person's contact. A contact still naming the
// deleted user can never be claimed, so when the person is re-invited they sign
// in under a new user id and onboarding finds no contact to save. delete-user
// therefore unsets the contact's `user_id`, and the re-invited person's first
// profile save claims the contact by address.
//
// Both routines then run an auth step (`DeleteUser`, and the profile re-denorm
// onto the user row) that the e2e server does not run, so the endpoints answer
// with an error and these specs check the contact, which is written first.

const DELETED_ID = "e2e-deleted-login";
const REINVITED_ID = "e2e-reinvited-login";
const CONTACT_ID = "e2e-deleted-login-contact";
const EMAIL = "deleted-login@example.com";

const ADMIN = {
  id: "e2e-delete-login-admin",
  name: "Delete Login Admin",
  email: "delete-login-admin@example.com",
  roles: ["user-admin"],
  profile: { name: "Delete Login Admin" },
};

const REINVITED = {
  id: REINVITED_ID,
  name: "",
  email: EMAIL,
  roles: [],
};

async function callEndpoint(page, entryId, endpointId, payload) {
  await page.request.post(`/api/endpoints/${entryId}/${endpointId}`, {
    data: { payload },
  });
}

test.describe("user-admin delete login identity", () => {
  test.beforeEach(async ({ ldf, mdb }) => {
    await mdb.seed("users", [
      {
        _id: DELETED_ID,
        name: "Deleted Login",
        email: EMAIL,
        email_verified: true,
      },
    ]);
    await mdb.seed("user-members", [
      {
        _id: "e2e-deleted-login-member",
        user_id: DELETED_ID,
        organization_id: "demo",
        role: "member",
        app_roles: ["user"],
        created_at: new Date(),
      },
    ]);
    await mdb.seed("user-contacts", [
      {
        _id: CONTACT_ID,
        email: EMAIL,
        lowercase_email: EMAIL,
        user_id: DELETED_ID,
        profile: {
          given_name: "Deleted",
          family_name: "Login",
          name: "Deleted Login",
        },
      },
    ]);
    await ldf.user(ADMIN);
  });

  test("delete-user unsets the contact's user_id and stamps the change", async ({
    page,
    mdb,
  }) => {
    await callEndpoint(page, "user-admin", "delete-user", {
      user_id: DELETED_ID,
      target_name: "Deleted Login",
      target_email: EMAIL,
    });

    const contact = await mdb
      .collection("user-contacts")
      .findOne({ _id: CONTACT_ID });
    expect(contact).not.toHaveProperty("user_id");
    expect(contact.updated.user.id).toBe(ADMIN.id);
  });

  test("a re-invited person can save their profile after their login was deleted", async ({
    page,
    ldf,
    mdb,
  }) => {
    await callEndpoint(page, "user-admin", "delete-user", {
      user_id: DELETED_ID,
      target_name: "Deleted Login",
      target_email: EMAIL,
    });

    await mdb.seed("users", [{ _id: REINVITED_ID, email: EMAIL, name: "" }]);
    await ldf.user(REINVITED);

    await callEndpoint(page, "user-account", "update-profile", {
      profile: { given_name: "Re", family_name: "Invited" },
      set_profile_created: true,
    });

    const contact = await mdb
      .collection("user-contacts")
      .findOne({ _id: CONTACT_ID });
    expect(contact.user_id).toBe(REINVITED_ID);
    expect(contact.profile.name).toBe("Re Invited");
  });
});
