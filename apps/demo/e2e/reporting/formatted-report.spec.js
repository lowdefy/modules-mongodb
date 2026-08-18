import { test, expect } from "../fixtures.js";

// Reporting surfaces that need a real browser: the reports list (soft-delete
// filtering, identity scoping) and the report renderer.
//
// Reporting keys ownership on `_user: id`, the same key every other module in
// this repo uses. `sub` is set here to a deliberately DIFFERENT value and is
// never seeded against, so this test doubles as a regression guard: if a read
// or write goes back to preferring `sub`, the seeded reports stop matching and
// the list assertions below fail.
const USER = {
  id: "e2e-reporting-id",
  sub: "e2e-reporting-sub",
  name: "Reporting E2E",
  email: "reporting-e2e@example.com",
  roles: ["admin"],
};

const ORDERS = [
  { _id: "o1", region: "EU", status: "paid", total: 1234.5, quantity: 2 },
  { _id: "o2", region: "EU", status: "pending", total: 250.25, quantity: 1 },
  { _id: "o3", region: "US", status: "paid", total: 4000, quantity: 5 },
];

// One KPI (Statistic — compile-time separators) and one table whose Revenue
// column carries a format descriptor (runtime _intl through a _function cell
// renderer). The table column is the case that used to take the whole report
// down when _intl was undeclared on the Dynamic block.
const SPEC = {
  title: "Formatted report (e2e)",
  sections: [
    {
      type: "kpi",
      label: "Total revenue",
      query: {
        collection: "demo_orders",
        pipeline: [{ $group: { _id: null, total: { $sum: "$total" } } }],
      },
      valueKey: "total",
      format: {
        style: "currency",
        currency: "USD",
        locale: "en-US",
        decimals: 2,
      },
    },
    {
      type: "table",
      label: "Orders by status",
      query: {
        collection: "demo_orders",
        pipeline: [
          {
            $group: {
              _id: "$status",
              orders: { $sum: 1 },
              revenue: { $sum: "$total" },
            },
          },
          { $project: { _id: 0, status: "$_id", orders: 1, revenue: 1 } },
          { $sort: { revenue: -1 } },
        ],
      },
      columns: [
        { key: "status", label: "Status" },
        { key: "orders", label: "Orders" },
        {
          key: "revenue",
          label: "Revenue",
          format: {
            style: "currency",
            currency: "USD",
            locale: "en-US",
            decimals: 2,
          },
        },
      ],
    },
  ],
};

function reportDoc({ id, title, deleted = null }) {
  const stamp = {
    timestamp: new Date(),
    user: { name: USER.name, id: USER.id },
  };
  return {
    _id: id,
    owner: { user_id: USER.id, name: USER.name },
    title,
    spec: { ...SPEC, title },
    deleted,
    created: stamp,
    updated: stamp,
  };
}

test("the reports list scopes by user id and hides soft-deleted reports", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed("report_layouts", [
    reportDoc({ id: "e2e-live-report", title: "Live report (e2e)" }),
    reportDoc({
      id: "e2e-deleted-report",
      title: "Deleted report (e2e)",
      deleted: {
        timestamp: new Date(),
        user: { name: USER.name, id: USER.id },
      },
    }),
    // Another user's live report must not leak into this user's list.
    {
      ...reportDoc({
        id: "e2e-other-report",
        title: "Other user report (e2e)",
      }),
      owner: { user_id: "someone-else", name: "Someone Else" },
    },
  ]);

  await ldf.goto("/reporting/reports-list");

  await expect(page.getByText("Live report (e2e)")).toBeVisible();
  await expect(page.getByText("Deleted report (e2e)")).toBeHidden();
  await expect(page.getByText("Other user report (e2e)")).toBeHidden();
});

// This spec, and every other one that loads the report page, was parked as
// `test.fixme` for as long as the e2e harness could not reach the page at all.
// `lowdefy build --server e2e` scaffolds @lowdefy/server-e2e, which diverged from
// @lowdefy/server in the two places that hand a Dynamic block its payload:
//
//                        renderPage.js              apiPage.js
//   @lowdefy/server      urlQuery: c.req.query()    urlQuery: c.req.query()
//   @lowdefy/server-e2e  omitted                    omitted
//
// The report page's resolver reads `_payload: urlQuery.report_id`, so under e2e it
// received `urlQuery: {}`, matched no document, and rendered "Report not found" —
// a false negative in the harness, never a defect in the module.
// lowdefy/lowdefy#2295 threads it in both places (and routes e2e-utils'
// setUrlQuery through the app's router, so a urlQuery CHANGE re-resolves too);
// this repo pins the build that carries it, and these specs run.
//
// The invariant this spec was written for — that the compiler never emits a
// type the Dynamic block fails to declare, which is what 404'd every report
// with a formatted column — is also covered without a browser by
// plugins/modules-mongodb-plugins/src/analytics/compileReport.declared.test.js.
test("a saved report with a formatted table column renders", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed("report_layouts", [
    reportDoc({ id: "e2e-formatted-report", title: "Formatted report (e2e)" }),
  ]);

  await ldf.goto("/reporting/report?report_id=e2e-formatted-report");

  // The fallback slot is the whole-report failure mode — assert it first, so a
  // regression reads as "the report 404'd" rather than a missing-cell error.
  await expect(page.getByText("Report not found")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Formatted report (e2e)" }),
  ).toBeVisible();

  // KPI: 1234.50 + 250.25 + 4000 = 5484.75, formatted by Statistic.
  await expect(page.getByText("5,484.75")).toBeVisible();

  // The table column formatted at runtime through _intl — the case that used
  // to throw. paid = 1234.50 + 4000 = 5234.50; pending = 250.25.
  await expect(page.getByText("$5,234.50")).toBeVisible();
  await expect(page.getByText("$250.25")).toBeVisible();
});
