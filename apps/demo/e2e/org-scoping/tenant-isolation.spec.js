import { test, expect } from "../fixtures.js";

// Two-org isolation through a real module page (docs/shared/org-scoping.md).
//
// Every module connection declares `tenant: true`, so the platform's tenant
// wall merges the caller's organization into every read — no page or request
// authors an organization filter. This test exercises the activities view
// page, whose `get_activity` read is a plain `$match` by `_id` (no Atlas
// `$search`, so it runs against the in-memory MongoDB the e2e harness boots).
//
// It is one self-contained test on purpose. `mdb.seed` clears the collection
// before inserting, so two parallel tests on the shared in-memory MongoDB
// would wipe each other's data — instead both organizations' documents are
// seeded in a single call, and isolation is proven in both directions by
// flipping only the caller's organization.
//
// The proof avoids proving-by-absence: each document is shown to render for
// its OWN organization (so the page provably works), then to be blank for the
// OTHER organization at the same `_id` on the same page. The only variable is
// the caller's org, so the blank is the wall, not a broken page.
//
// The mock caller carries the org via `ldf.user({ organizationId })`, which
// the engine's injected-caller normalization mirrors onto
// `context.user.organizationId` — the value the wall stamps and filters with.

const STAMP = {
  timestamp: new Date("2026-07-01T09:00:00.000Z"),
  user: { id: "user-e2e", name: "E2E User" },
};

function activity({ _id, organizationId, title }) {
  return {
    _id,
    organizationId,
    title,
    type: "note",
    date: new Date("2026-07-01T09:00:00.000Z"),
    contacts: [],
    company_ids: [],
    references: {},
    created: STAMP,
    updated: STAMP,
  };
}

const ORG_A = { organizationId: "org-a", email: "a@example.com" };
const ORG_B = { organizationId: "org-b", email: "b@example.com" };
const ACT_A = { _id: "act-org-a", title: "Org A planning note" };
const ACT_B = { _id: "act-org-b", title: "Org B private note" };

// The view page renders the activity title under the `title` test-id (it also
// echoes in the header, so the locator is scoped to avoid a strict-mode match).
function titleHeading(page, title) {
  return page.getByTestId("title").getByRole("heading", { name: title });
}

async function viewAs(ldf, page, caller, activityId, title) {
  await ldf.user({
    name: caller.email,
    email: caller.email,
    roles: ["admin"],
    ...caller,
  });
  await ldf.goto(`/activities/view?_id=${activityId}`);
  return titleHeading(page, title);
}

test("the tenant wall isolates activities by organization on the view page", async ({
  ldf,
  page,
  mdb,
}) => {
  // One seed call (clears then inserts both) so the two orgs' fixtures coexist.
  await mdb.seed("activities", [
    activity({ ...ACT_A, organizationId: ORG_A.organizationId }),
    activity({ ...ACT_B, organizationId: ORG_B.organizationId }),
  ]);

  // Org A sees its own activity...
  await expect(
    await viewAs(ldf, page, ORG_A, ACT_A._id, ACT_A.title),
  ).toBeVisible();
  // ...but not Org B's, at the same _id on the same page.
  await expect(
    await viewAs(ldf, page, ORG_A, ACT_B._id, ACT_B.title),
  ).toHaveCount(0);

  // Symmetric: Org B sees its own activity...
  await expect(
    await viewAs(ldf, page, ORG_B, ACT_B._id, ACT_B.title),
  ).toBeVisible();
  // ...but not Org A's.
  await expect(
    await viewAs(ldf, page, ORG_B, ACT_A._id, ACT_A.title),
  ).toHaveCount(0);
});
