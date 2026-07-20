import { test, expect } from "../fixtures.js";

// Two-org isolation through real module pages (docs/shared/org-scoping.md).
//
// Every module connection declares `tenant: true`, so the platform's tenant
// wall merges the caller's organization into every read — no page or request
// authors an organization filter. These tests seed the same collection with
// two organizations' documents and prove a caller only ever sees their own,
// through the activities view page (a plain walled aggregation by _id — no
// Atlas $search, so it runs against the in-memory MongoDB).
//
// The mock e2e caller carries the org: `ldf.user({ organizationId })` flows
// through the engine's injected-caller normalization, which mirrors
// organizationId/activeOrganizationId — the same surface the wall stamps and
// filters with.

const ORG_A = "org-a-e2e";
const ORG_B = "org-b-e2e";

function activityDoc({ _id, organizationId, title }) {
  const stamp = {
    timestamp: new Date("2026-07-01T09:00:00.000Z"),
    user: { id: "user-e2e", name: "E2E User" },
  };
  return {
    _id,
    organizationId,
    title,
    type: "note",
    date: new Date("2026-07-01T09:00:00.000Z"),
    contacts: [],
    company_ids: [],
    references: {},
    created: stamp,
    updated: stamp,
  };
}

test.beforeEach(async ({ mdb }) => {
  await mdb.seed("activities", [
    activityDoc({
      _id: "act-org-a",
      organizationId: ORG_A,
      title: "Org A planning note",
    }),
    activityDoc({
      _id: "act-org-b",
      organizationId: ORG_B,
      title: "Org B private note",
    }),
  ]);
});

test("a caller sees their own org's activity on the view page", async ({
  ldf,
  page,
}) => {
  await ldf.user({
    name: "Org A Admin",
    email: "org-a-admin@example.com",
    roles: ["admin"],
    organizationId: ORG_A,
  });

  await ldf.goto("/activities/view?_id=act-org-a");
  await expect(
    page.getByRole("heading", { name: "Org A planning note" }),
  ).toBeVisible();
});

test("a caller cannot read another org's activity, even by _id", async ({
  ldf,
  page,
}) => {
  await ldf.user({
    name: "Org A Admin",
    email: "org-a-admin@example.com",
    roles: ["admin"],
    organizationId: ORG_A,
  });

  // Direct-URL probe: the document exists, but the wall's injected filter
  // means the walled read returns nothing — the title must never render.
  await ldf.goto("/activities/view?_id=act-org-b");
  await expect(
    page.getByRole("heading", { name: "Org B private note" }),
  ).not.toBeVisible();
});

test("switching organizations flips visibility, same documents", async ({
  ldf,
  page,
}) => {
  await ldf.user({
    name: "Org B Admin",
    email: "org-b-admin@example.com",
    roles: ["admin"],
    organizationId: ORG_B,
  });

  await ldf.goto("/activities/view?_id=act-org-b");
  await expect(
    page.getByRole("heading", { name: "Org B private note" }),
  ).toBeVisible();

  await ldf.goto("/activities/view?_id=act-org-a");
  await expect(
    page.getByRole("heading", { name: "Org A planning note" }),
  ).not.toBeVisible();
});
