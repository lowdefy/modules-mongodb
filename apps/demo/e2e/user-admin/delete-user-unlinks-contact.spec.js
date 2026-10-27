import { test, expect } from "../fixtures.js";

// Delete login identity keeps the person's contact. A contact still naming the
// deleted user can never be claimed, so when the person is re-invited they sign
// in under a new user id and onboarding finds no contact to save. delete-user
// therefore unsets the contact's `user_id` once DeleteUser has run, and the
// re-invited person's profile save claims the contact by address.
//
// DeleteUser, and the profile re-denorm onto the user row, are auth steps the
// e2e server does not run, so those endpoints answer with an error at that step.
// That makes a failed delete observable here, but not a successful one: the
// first spec checks a delete that fails leaves the contact linked, and the
// second starts from the unlinked contact a successful delete leaves behind.

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

const CONTACT = {
  _id: CONTACT_ID,
  email: EMAIL,
  lowercase_email: EMAIL,
  profile: {
    given_name: "Deleted",
    family_name: "Login",
    name: "Deleted Login",
  },
};

function callEndpoint(page, entryId, endpointId, payload) {
  return page.request.post(`/api/endpoints/${entryId}/${endpointId}`, {
    data: { payload },
  });
}

test.describe("user-admin delete login identity", () => {
  test("a delete that fails leaves the contact linked", async ({
    page,
    ldf,
    mdb,
  }) => {
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
    await mdb.seed("user-contacts", [{ ...CONTACT, user_id: DELETED_ID }]);
    await ldf.user(ADMIN);

    const response = await callEndpoint(page, "user-admin", "delete-user", {
      user_id: DELETED_ID,
      target_name: "Deleted Login",
      target_email: EMAIL,
    });
    const body = await response.json().catch(() => null);
    expect(body?.success).toBe(false);

    const contact = await mdb
      .collection("user-contacts")
      .findOne({ _id: CONTACT_ID });
    expect(contact.user_id).toBe(DELETED_ID);
    expect(contact).not.toHaveProperty("updated");
  });

  test("a re-invited person claims the contact a deleted login left unlinked", async ({
    page,
    ldf,
    mdb,
  }) => {
    await mdb.seed("user-contacts", [CONTACT]);
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
