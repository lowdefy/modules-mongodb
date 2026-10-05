import { test, expect } from "../fixtures.js";

// The invite page checks an `?email=` URL query on load. An expired pending
// invitation seeds the form's app roles, org tier and member attributes; with
// none, the form prefills from the contact profile as before, and a live pending
// invitation opens the Resend panel.
//
// Sending runs CancelInvitation and InviteMember, auth actions the e2e server
// does not run, so these specs stop at the prefilled form. The send payload is
// read from the state they assert on.

const ADMIN = {
  id: "e2e-reinvite-admin",
  name: "Reinvite Admin",
  email: "reinvite-admin@example.com",
  roles: ["user-admin"],
  profile: { name: "Reinvite Admin" },
};

const DAY = 24 * 60 * 60 * 1000;

function invitation({ id, email, expiresIn, appRoles, role, attributes }) {
  return {
    _id: id,
    organization_id: "demo",
    email,
    status: "pending",
    inviter_id: ADMIN.id,
    app_roles: appRoles,
    role,
    attributes,
    created_at: new Date(Date.now() - 30 * DAY),
    expires_at: new Date(Date.now() + expiresIn),
  };
}

function contact({ id, email, givenName, familyName }) {
  return {
    _id: id,
    email,
    lowercase_email: email.toLowerCase(),
    profile: {
      given_name: givenName,
      family_name: familyName,
      name: `${givenName} ${familyName}`,
    },
  };
}

test.describe("user-admin re-invite from an expired invitation", () => {
  test.beforeEach(async ({ ldf }) => {
    await ldf.user(ADMIN);
  });

  test("an expired invitation prefills its roles, org tier and attributes", async ({
    ldf,
    mdb,
  }) => {
    const email = "expired-invitee@example.com";
    await mdb.seed("user-invitations", [
      invitation({
        id: "e2e-reinvite-older",
        email,
        expiresIn: -20 * DAY,
        appRoles: ["user"],
        role: "member",
        attributes: { team: "gamma" },
      }),
      invitation({
        id: "e2e-reinvite-latest",
        email,
        expiresIn: -2 * DAY,
        appRoles: ["manager"],
        role: "admin",
        attributes: { team: "beta" },
      }),
    ]);
    await mdb.seed("user-contacts", [
      contact({
        id: "e2e-reinvite-contact",
        email,
        givenName: "Expired",
        familyName: "Invitee",
      }),
    ]);

    await ldf.goto(`/user-admin/invite?email=${encodeURIComponent(email)}`);
    await ldf.block("state_form").expect.visible();
    await ldf.state("invite_state").expect.toBe("existing");
    await ldf.state("email").expect.toBe(email);
    await ldf.state("roles").expect.toBe(["manager"]);
    await ldf.state("org_role").expect.toBe("admin");
    await ldf.state("member_attributes").expect.toBe({ team: "beta" });
    await ldf.state("profile.given_name").expect.toBe("Expired");
  });

  test("a stored owner tier seeds admin, and an unknown email still prefills", async ({
    ldf,
    mdb,
  }) => {
    const email = "owner-invitee@example.com";
    await mdb.seed("user-invitations", [
      invitation({
        id: "e2e-reinvite-owner",
        email,
        expiresIn: -1 * DAY,
        appRoles: ["admin"],
        role: "owner",
        attributes: { team: "alpha" },
      }),
    ]);

    await ldf.goto(`/user-admin/invite?email=${encodeURIComponent(email)}`);
    await ldf.block("state_form").expect.visible();
    await ldf.state("invite_state").expect.toBe("unknown");
    await ldf.state("roles").expect.toBe(["admin"]);
    await ldf.state("org_role").expect.toBe("admin");
    await ldf.state("member_attributes").expect.toBe({ team: "alpha" });
  });

  test("with no expired invitation, the form prefills from the contact profile", async ({
    ldf,
    mdb,
  }) => {
    const email = "contact-only@example.com";
    await mdb.seed("user-contacts", [
      contact({
        id: "e2e-reinvite-contact-only",
        email,
        givenName: "Contact",
        familyName: "Only",
      }),
    ]);

    await ldf.goto(`/user-admin/invite?email=${encodeURIComponent(email)}`);
    await ldf.block("state_form").expect.visible();
    await ldf.state("invite_state").expect.toBe("existing");
    await ldf.state("profile.given_name").expect.toBe("Contact");
    await ldf.state("profile.family_name").expect.toBe("Only");
    await ldf.state("roles").expect.toBe(null);
    await ldf.state("org_role").expect.toBe("member");
    // The rendered attribute input writes its own empty leaf.
    await ldf.state("member_attributes.team").expect.toBe(null);
  });

  test("a live pending invitation opens the Resend panel", async ({
    ldf,
    mdb,
  }) => {
    const email = "live-invitee@example.com";
    await mdb.seed("user-invitations", [
      invitation({
        id: "e2e-reinvite-expired-beside-live",
        email,
        expiresIn: -5 * DAY,
        appRoles: ["user"],
        role: "member",
        attributes: { team: "gamma" },
      }),
      invitation({
        id: "e2e-reinvite-live",
        email,
        expiresIn: 5 * DAY,
        appRoles: ["manager"],
        role: "member",
        attributes: { team: "beta" },
      }),
    ]);

    await ldf.goto(`/user-admin/invite?email=${encodeURIComponent(email)}`);
    await ldf.block("state_pending").expect.visible();
    await ldf.state("invite_state").expect.toBe("pending");
    await ldf.state("resolved_invitation._id").expect.toBe("e2e-reinvite-live");
    await ldf.block("state_form").expect.hidden();
  });

  test("without an email in the URL the page opens on the email entry", async ({
    ldf,
  }) => {
    await ldf.goto("/user-admin/invite");
    await ldf.block("state_resting").expect.visible();
    await ldf.state("invite_state").expect.toBe("resting");
    await ldf.block("state_form").expect.hidden();
  });

  test("Re-invite on an Expired row opens the prefilled form", async ({
    ldf,
    mdb,
    page,
  }) => {
    const email = "table-invitee@example.com";
    await mdb.seed("user-invitations", [
      invitation({
        id: "e2e-reinvite-table",
        email,
        expiresIn: -3 * DAY,
        appRoles: ["manager"],
        role: "member",
        attributes: { team: "gamma" },
      }),
    ]);

    await ldf.goto("/user-admin/all");
    await page.getByRole("tab", { name: /Invitations/ }).click();
    await ldf.request("get_all_invitations").expect.toFinish();
    await Promise.all([
      ldf.waitForPage(/\/user-admin\/invite\?/),
      page
        .locator('.ag-row [col-id="action_reinvite"]', { hasText: "Re-invite" })
        .first()
        .click(),
    ]);
    expect(new URL(page.url()).searchParams.get("email")).toBe(email);
    // The Link navigates client-side, so the URL changes before the runtime
    // switches page. Wait for the switch, then re-read the page's block map.
    await page.waitForFunction(
      () => window.lowdefy?.pageId === "user-admin/invite",
    );
    await ldf.waitForPage(/\/user-admin\/invite\?/);
    await ldf.block("state_form").expect.visible();
    await ldf.state("roles").expect.toBe(["manager"]);
    await ldf.state("member_attributes").expect.toBe({ team: "gamma" });
  });
});
