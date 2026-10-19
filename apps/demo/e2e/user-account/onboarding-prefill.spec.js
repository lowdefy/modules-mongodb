import { test } from "../fixtures.js";

// An invitation writes the admin's captured profile onto a contact minted
// before the invitee has a user row. After they sign in and accept, their user
// carries no profile and the contact is still unlinked until onboarding saves,
// so onboarding finds it by address.

const INVITEE = {
  id: "e2e-onboarding-invitee",
  name: "",
  email: "onboarding-invitee@example.com",
  roles: [],
};

test.describe("onboarding prefill", () => {
  test.beforeEach(async ({ ldf, mdb }) => {
    await mdb.seed("users", [
      { _id: INVITEE.id, email: INVITEE.email, name: "" },
    ]);
    await mdb.seed("user-contacts", [
      {
        _id: "e2e-onboarding-contact",
        email: INVITEE.email,
        lowercase_email: INVITEE.email,
        profile: {
          given_name: "Test",
          family_name: "Ops Only",
          name: "Test Ops Only",
        },
      },
    ]);
    await ldf.user(INVITEE);
  });

  test("opens with the name captured at invite", async ({ ldf }) => {
    await ldf.goto("/user-account/onboarding");
    await ldf.state("profile.given_name").expect.toBe("Test");
    await ldf.state("profile.family_name").expect.toBe("Ops Only");
  });
});
