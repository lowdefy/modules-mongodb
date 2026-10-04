import { test, expect } from "../fixtures.js";

// An invite to an address that is not yet a user mints a contact with no auth
// user. The demo runs under the pinned policy, so these are the single-field
// shapes of the user-contacts indexes in docs/user-account/reference/indexes.md.
// The user_id index is partial on $exists: a contact that stored `user_id: null`
// would be indexed, and a second unlinked invitee would collide with it.

const ADMIN = {
  id: "e2e-unlinked-admin",
  name: "Unlinked Admin",
  email: "unlinked-admin@example.com",
  roles: ["user-admin"],
  profile: { name: "Unlinked Admin" },
};

const INDEXES = [
  { key: { lowercase_email: 1 }, field: "lowercase_email" },
  { key: { user_id: 1 }, field: "user_id" },
].map(({ key, field }) => ({
  key,
  name: `e2e_${field}_unique`,
  unique: true,
  partialFilterExpression: { [field]: { $exists: true } },
}));

function invite(page, email) {
  return page.evaluate(async (address) => {
    const res = await fetch("/api/endpoints/user-admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          email: address,
          roles: ["user"],
          profile: { given_name: "New", family_name: "Invitee" },
        },
        pageId: "user-admin/invite",
        blockId: "e2e",
      }),
    });
    return res.json();
  }, email);
}

test.describe("user-admin invite of addresses that are not yet users", () => {
  test.beforeEach(async ({ ldf, mdb }) => {
    await ldf.user(ADMIN);
    await mdb.collection("user-contacts").createIndexes(INDEXES);
  });

  test.afterEach(async ({ mdb }) => {
    const contacts = mdb.collection("user-contacts");
    for (const { name } of INDEXES) {
      await contacts.dropIndex(name);
    }
  });

  test("two invitees with no accept between them each get a contact with no user_id", async ({
    ldf,
    mdb,
    page,
  }) => {
    await ldf.goto("/user-admin/all");
    const emails = ["first-invitee@example.com", "second-invitee@example.com"];
    for (const email of emails) {
      await invite(page, email);
    }

    const contacts = await mdb
      .collection("user-contacts")
      .find({ lowercase_email: { $in: emails } })
      .sort({ lowercase_email: 1 })
      .toArray();
    expect(contacts.map((contact) => contact.lowercase_email)).toEqual(emails);
    for (const contact of contacts) {
      expect(contact).not.toHaveProperty("user_id");
      expect(contact.profile.name).toBe("New Invitee");
    }
  });
});
