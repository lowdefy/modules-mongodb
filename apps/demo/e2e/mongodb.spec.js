import { test, expect } from "./fixtures.js";

test("database seeding example", async ({ ldf, page, mdb }) => {
  // Demo pages are `protected: true`, so authenticate before navigating —
  // an unauthenticated goto redirects to the login page.
  await ldf.user({
    name: "Test Admin",
    email: "test-admin@example.com",
    roles: ["admin"],
  });

  // Seed a deal directly into the deals module's `deals` collection.
  await mdb.seed("deals", [
    {
      _id: "deal-e2e-seed",
      name: "Seeded QA Deal",
      status: [{ stage: "prospecting" }],
      outcome: null,
    },
  ]);

  // The deals workspace reads the selected deal from `_url_query: _id`.
  await ldf.goto("/deals/view?_id=deal-e2e-seed");

  // The seeded name renders in the deal list card on the workspace.
  await expect(page.getByText("Seeded QA Deal").first()).toBeVisible();
});

// Example: Using the native MongoDB driver for assertions
//
// test('creates new record in database', async ({ ldf, mdb }) => {
//   await ldf.goto('/deals/new');
//   // ...fill the create form and save...
//   const deal = await mdb.collection('deals').findOne({ name: 'Acme deal' });
//   expect(deal).toBeDefined();
// });
