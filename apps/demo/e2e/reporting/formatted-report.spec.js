import { test, expect } from "../fixtures.js";

// Reporting surfaces that need a real browser: the reports list (soft-delete
// filtering, identity scoping) and the report renderer.
//
// `sub` deliberately differs from `id`. Reports are scoped by `sub ?? id`, so
// storing under `sub` and signing in with both proves the read endpoints
// resolve the identity key the same way the writers do — a mismatch would make
// reports silently invisible rather than visibly wrong.
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
  return {
    _id: id,
    userId: USER.sub,
    title,
    spec: { ...SPEC, title },
    deleted,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test("the reports list scopes by sub ?? id and hides soft-deleted reports", async ({
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
        user: { name: USER.name, id: USER.sub },
      },
    }),
    // Another user's live report must not leak into this user's list.
    {
      ...reportDoc({
        id: "e2e-other-report",
        title: "Other user report (e2e)",
      }),
      userId: "someone-else",
    },
  ]);

  await ldf.goto("/reporting/reports-list");

  await expect(page.getByText("Live report (e2e)")).toBeVisible();
  await expect(page.getByText("Deleted report (e2e)")).toBeHidden();
  await expect(page.getByText("Other user report (e2e)")).toBeHidden();
});

// BLOCKED ON A FRAMEWORK GAP, not on this module's config.
//
// The report page is a Dynamic block whose resolver reads
// `_payload: urlQuery.reportId`. `getPageConfig(context, { pageId, urlQuery })`
// accepts urlQuery and forwards it into the Dynamic payload, but neither caller
// in the generated server passes it:
//
//   .lowdefy/server/src/html/renderPage.js:45   getPageConfig(context, { pageId: resolvedPageId })
//   .lowdefy/server/src/routes/apiPage.js:26    getPageConfig(context, { pageId })
//
// Both have the request in scope and never read its query, so a Dynamic block
// always receives `urlQuery: {}` and resolve-report can never find the report —
// it rejects "Report not found" and the fallback slot renders. Verified against
// @lowdefy/server 0.0.0-experimental-20260707145139, and reproduced with this
// PR's changes reverted, so it is not a regression from them.
//
// The compile-side half of this assertion is covered without a browser by
// plugins/modules-mongodb-plugins/src/analytics/compileReport.declared.test.js,
// which fails if the compiler emits a type the Dynamic block does not declare —
// the defect this spec was written to catch. Un-fixme this once the server
// threads urlQuery through.
test.fixme("a saved report with a formatted table column renders", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed("report_layouts", [
    reportDoc({ id: "e2e-formatted-report", title: "Formatted report (e2e)" }),
  ]);

  await ldf.goto("/reporting/report?reportId=e2e-formatted-report");

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
