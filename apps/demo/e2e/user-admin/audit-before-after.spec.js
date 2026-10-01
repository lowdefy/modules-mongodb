import { test, expect } from "../fixtures.js";

// The user-admin audit events carry `metadata.before` / `metadata.after`.
//
// update-profile is the one endpoint whose routine reaches its audit step on the
// e2e server: with no `user_id` in the payload the write-profile fragment skips
// its UpdateUserProfile re-denorm, the only auth action in the routine. The
// other endpoints (update-access, update-org-role, update-user-attributes,
// invite, remove-member, delete-user) run auth actions, which the e2e server
// does not run, so their events are not written here.

const ADMIN = {
  id: "e2e-audit-admin",
  name: "Audit Admin",
  email: "audit-admin@example.com",
  roles: ["user-admin"],
  profile: { name: "Audit Admin" },
};

const CONTACT_ID = "e2e-audit-contact";

async function callEndpoint(page, endpointId, payload) {
  const raw = await page.request.post(
    `/api/endpoints/user-admin/${endpointId}`,
    { data: { payload } },
  );
  return { status: raw.status(), body: await raw.json().catch(() => null) };
}

test.describe("user-admin audit events record before and after", () => {
  test.beforeEach(async ({ ldf, mdb }) => {
    await mdb.seed("user-contacts", [
      {
        _id: CONTACT_ID,
        email: "audit-target@example.com",
        lowercase_email: "audit-target@example.com",
        profile: {
          given_name: "Before",
          family_name: "Target",
          name: "Before Target",
          job_title: "Analyst",
        },
      },
    ]);
    await ldf.user(ADMIN);
  });

  test("profile-updated records the written fields before and after", async ({
    page,
    mdb,
  }) => {
    const { status, body } = await callEndpoint(page, "update-profile", {
      contact_id: CONTACT_ID,
      email: "audit-target@example.com",
      profile: {
        given_name: "After",
        family_name: "Target",
        photo: "data:image/png;base64,iVBORw0KGgo=",
      },
    });
    expect(status).toBe(200);
    expect(body?.success).not.toBe(false);

    const events = await mdb
      .collection("log-events")
      .find({ type: "profile-updated", contact_ids: CONTACT_ID })
      .toArray();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toEqual({
      before: { given_name: "Before", family_name: "Target" },
      after: { given_name: "After", family_name: "Target" },
    });
    expect(events[0].demo.title).toBe(
      "Audit Admin updated After Target's profile",
    );
  });

  test("a field the stored profile lacks records null before", async ({
    page,
    mdb,
  }) => {
    await callEndpoint(page, "update-profile", {
      contact_id: CONTACT_ID,
      profile: { given_name: "Before", work_phone: "+27 11 000 0000" },
    });

    const event = await mdb
      .collection("log-events")
      .findOne({ type: "profile-updated", contact_ids: CONTACT_ID });
    expect(event.metadata).toEqual({
      before: { given_name: "Before", work_phone: null },
      after: { given_name: "Before", work_phone: "+27 11 000 0000" },
    });
  });
});
