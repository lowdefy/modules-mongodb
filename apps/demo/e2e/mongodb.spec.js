import { test, expect } from "./fixtures.js";

test("database seeding example", async ({ ldf, page, mdb }) => {
  // Demo pages are `protected: true`, so authenticate before navigating —
  // an unauthenticated goto redirects to the login page.
  await ldf.user({
    name: "Test Admin",
    email: "test-admin@example.com",
    roles: ["admin"],
  });

  // Seed a lead directly into the demo's `leads` collection.
  await mdb.seed("leads", [
    {
      _id: "lead-e2e-seed",
      name: "Seeded QA Lead",
      status: [{ stage: "new" }],
    },
  ]);

  // lead-view reads the doc by `_url_query: _id`, so it is reachable directly.
  await ldf.goto("/lead-view?_id=lead-e2e-seed");

  // The seeded name drives the page-title <h2> (get_lead.0.name). It also appears
  // in the breadcrumb, so target the heading specifically.
  await expect(
    page.getByRole("heading", { name: "Seeded QA Lead" }),
  ).toBeVisible();
});

// Example: Testing with database assertions
//
// test('creates new record in database', async ({ ldf, mdb }) => {
//   await ldf.goto('/lead-new');
//
//   await ldf.block('name').do.fill('Jane Doe');
//   await ldf.block('company').do.fill('Acme Inc');
//   await ldf.block('save_btn').do.click();
//
//   // Assert record was created using native MongoDB driver
//   const lead = await mdb.collection('leads').findOne({ company: 'Acme Inc' });
//   expect(lead).toBeDefined();
//   expect(lead.name).toBe('Jane Doe');
// });
//
// Example: Using native driver for complex queries
//
// test('lead list shows correct data', async ({ ldf, page, mdb }) => {
//   await mdb.seed('leads', [
//     { _id: 'lead-1', name: 'Alice', status: [{ stage: 'new' }] },
//     { _id: 'lead-2', name: 'Bob', status: [{ stage: 'won' }] },
//   ]);
//
//   await ldf.goto('/lead-list');
//
//   // Use native driver to count documents
//   const count = await mdb.collection('leads').countDocuments({});
//   expect(count).toBe(2);
// });
