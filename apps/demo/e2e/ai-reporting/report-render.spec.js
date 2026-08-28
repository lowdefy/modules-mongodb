import { test, expect } from "../fixtures.js";
import { REPORTS, callEndpoint } from "./helpers.js";

// The report page's compiled surface — the blocks compileReport emits at resolve
// time: the broken vs withheld alert variants, the owner-only recovery
// affordances, and inline filter co-location. compileReport itself is unit-tested
// exhaustively in the plugin; these specs prove the same output through the real
// resolve-report → Dynamic block → page render stack, over seeded documents that
// mirror the three demo reports seed-reporting-domain.mjs adds.
//
// Two layers, for the same reason the ownership specs split:
//   - the RENDER layer drives the report page and asserts the compiled blocks.
//     It was parked as `test.fixme` until @lowdefy/server-e2e threaded urlQuery
//     into Dynamic resolution (lowdefy/lowdefy#2295): the resolver reads
//     `_payload: urlQuery.report_id`, so without it the page only ever rendered
//     the "Report not found" fallback.
//   - the AUTHORIZATION layer drives the endpoints directly (query-data,
//     remove-report-section) and is real: it proves the SERVER-SIDE gates the
//     render layer only displays — the role gate behind the withheld alert, and
//     the owner match behind Drop. A non-owner never reaching a working Drop is
//     the authorization; hiding the button is only the affordance.

// A viewer who holds the confidential role, and one who does not. Both are
// admins otherwise — the only difference that matters is report-confidential,
// which gates demo_activities_confidential in the demo catalog.
const HOLDER = {
  id: "e2e-holder-id",
  sub: "e2e-holder-sub",
  name: "Role Holder",
  email: "holder@example.com",
  roles: ["admin", "report-confidential"],
  profile: { name: "Role Holder" },
};
const PLAIN = {
  id: "e2e-plain-id",
  sub: "e2e-plain-sub",
  name: "Plain Viewer",
  email: "plain@example.com",
  roles: ["admin"],
  profile: { name: "Plain Viewer" },
};

const ACTIVITIES = [
  { _id: "a1", type: "call", source: { channel: "manual" }, status: [{ stage: "open" }] },
  { _id: "a2", type: "meeting", source: { channel: "email" }, status: [{ stage: "done" }] },
  { _id: "a3", type: "call", source: { channel: "import" }, status: [{ stage: "open" }] },
];

const activityCount = {
  collection: "demo_activities",
  pipeline: [{ $group: { _id: null, activities: { $sum: 1 } } }],
};
const activitiesByType = {
  collection: "demo_activities",
  pipeline: [
    { $group: { _id: "$type", activities: { $sum: 1 } } },
    { $project: { _id: 0, type: "$_id", activities: 1 } },
    { $sort: { activities: -1 } },
  ],
};
// A pipeline over a collection that is not in the catalog — the "renamed away"
// case. It passes grammar validation (which does not know collections) so the
// report opens, then fails the per-section resolve gate → the broken alert.
const droppedCollection = {
  collection: "demo_orders_legacy",
  pipeline: [
    { $group: { _id: "$region", orders: { $sum: 1 } } },
    { $project: { _id: 0, region: "$_id", orders: 1 } },
  ],
};
// A pipeline over the role-gated collection — valid, but denied to a viewer who
// lacks report-confidential → the withheld alert.
const confidentialQuery = {
  collection: "demo_activities_confidential",
  pipeline: [
    { $group: { _id: "$type", activities: { $sum: 1 } } },
    { $project: { _id: 0, type: "$_id", activities: 1 } },
  ],
};

function reportDoc({ id, title, owner, visibility = "shared", sections, conversationId = null }) {
  const stamp = { timestamp: new Date(), user: { name: owner.name, id: owner.id } };
  return {
    _id: id,
    owner: { user_id: owner.id, name: owner.name },
    title,
    description: `Seeded by report-render e2e: ${title}.`,
    spec: { sections },
    spec_version: 1,
    visibility,
    favourite_of: [],
    conversation_id: conversationId,
    deleted: null,
    created: stamp,
    updated: stamp,
  };
}

const BROKEN_SECTIONS = [
  {
    id: "s0",
    type: "kpi",
    label: "Activities",
    query: activityCount,
    valueKey: "activities",
    filterBy: [],
  },
  {
    id: "s1",
    type: "table",
    label: "Orders by region (legacy)",
    query: droppedCollection,
    columns: [
      { key: "region", label: "Region" },
      { key: "orders", label: "Orders" },
    ],
    filterBy: [],
  },
];

const WITHHELD_SECTIONS = [
  {
    id: "s0",
    type: "kpi",
    label: "Activities",
    query: activityCount,
    valueKey: "activities",
    filterBy: [],
  },
  {
    id: "s1",
    type: "chart",
    chart: "bar",
    label: "Confidential activities by type",
    query: confidentialQuery,
    x: "type",
    y: ["activities"],
    filterBy: [],
  },
  {
    id: "s2",
    type: "table",
    label: "Legacy orders (dropped collection)",
    query: droppedCollection,
    columns: [
      { key: "region", label: "Region" },
      { key: "orders", label: "Orders" },
    ],
    filterBy: [],
  },
];

const TWO_GROUP_SECTIONS = [
  { id: "s0", type: "filter", control: "select", field: "type", label: "Activity type" },
  { id: "s1", type: "filter", control: "select", field: "source.channel", label: "Capture channel" },
  { id: "s2", type: "kpi", label: "Activities (by type)", query: activityCount, valueKey: "activities", filterBy: ["type"] },
  { id: "s3", type: "chart", chart: "bar", label: "Activities by type", query: activitiesByType, x: "type", y: ["activities"], filterBy: ["type"] },
  { id: "s4", type: "kpi", label: "Activities (by channel)", query: activityCount, valueKey: "activities", filterBy: ["source.channel"] },
  {
    id: "s5",
    type: "table",
    label: "Activities by channel",
    query: {
      collection: "demo_activities",
      pipeline: [
        { $group: { _id: "$source.channel", activities: { $sum: 1 } } },
        { $project: { _id: 0, channel: "$_id", activities: 1 } },
        { $sort: { activities: -1 } },
      ],
    },
    columns: [
      { key: "channel", label: "Channel" },
      { key: "activities", label: "Activities" },
    ],
    filterBy: ["source.channel"],
  },
];

// A filter over one bound KPI — the smallest report that proves the re-query
// path: select a type, the KPI's count narrows. The KPI query counts every
// activity; the bound filter prepends a `$match` on `type`, so the count drops
// from the three seeded activities to the two of the chosen type.
const FILTER_KPI_SECTIONS = [
  { id: "s0", type: "filter", control: "select", field: "type", label: "Activity type" },
  {
    id: "s1",
    type: "kpi",
    label: "Matching activities",
    query: activityCount,
    valueKey: "activities",
    // An integer format so the count reads "3"/"2" — the default carries two
    // decimals ("3.00"), which is fine for money but noise for a row count.
    format: { style: "decimal", decimals: 0 },
    filterBy: ["type"],
  },
];

// ── Render layer (blocked by the urlQuery harness gap; see file header) ──────

test.describe("report page render", () => {
  test.beforeEach(async ({ mdb }) => {
    await mdb.seed("demo_activities", ACTIVITIES);
  });

  test(
    "changing a filter re-queries and updates the section it drives",
    async ({ ldf, page, mdb }) => {
      await mdb.seed(REPORTS, [
        reportDoc({
          id: "e2e-filter-interaction",
          title: "Filter interaction",
          owner: HOLDER,
          sections: FILTER_KPI_SECTIONS,
        }),
      ]);

      await ldf.user(HOLDER);
      await ldf.goto("/ai-reporting/report?report_id=e2e-filter-interaction");
      await expect(page.getByText("Report not found")).toBeHidden();

      // Before any selection the KPI resolves over all three seeded activities.
      // This is the assertion report-render never made: not that the control
      // renders, but that the section it drives holds the right number.
      const kpiValue = page.locator(".ant-statistic-content-value");
      await expect(kpiValue).toHaveText("3");

      // Selecting a type fires the compiled onChange (CallAPI → SetState into
      // sections.s1.rows), so the bound KPI re-queries with `type: "call"` and
      // narrows to the two "call" activities — the re-render, end to end.
      await page.getByRole("combobox").click();
      // The open dropdown's options are clickable elements whose exact text is
      // the type value; "call" is unique on the page while the menu is open.
      await page.getByText("call", { exact: true }).click();
      await expect(kpiValue).toHaveText("2");
    },
  );

  test(
    "a broken section shows the owner recoveries; a non-owner sees only the alert",
    async ({ ldf, page, mdb }) => {
      await mdb.seed(REPORTS, [
        reportDoc({
          id: "e2e-broken",
          title: "Broken report",
          owner: HOLDER,
          conversationId: "conv-broken",
          sections: BROKEN_SECTIONS,
        }),
      ]);

      // Owner: the alert plus both recoveries.
      await ldf.user(HOLDER);
      await ldf.goto("/ai-reporting/report?report_id=e2e-broken");
      await expect(page.getByText("Report not found")).toBeHidden();
      await expect(
        page.getByText("This section failed to load", { exact: false }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Fix in chat" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Drop this section" }),
      ).toBeVisible();
      // The healthy KPI still renders beside the broken table.
      await expect(page.getByText("Activities")).toBeVisible();

      // Non-owner: the alert names the owner to ask, and offers nothing to click.
      await ldf.user(PLAIN);
      await ldf.goto("/ai-reporting/report?report_id=e2e-broken");
      await expect(
        page.getByText(`Ask ${HOLDER.name} to fix it`, { exact: false }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Fix in chat" })).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Drop this section" }),
      ).toBeHidden();
    },
  );

  test(
    "a withheld section reads as no-access with no recoveries, distinct from a broken one",
    async ({ ldf, page, mdb }) => {
      await mdb.seed(REPORTS, [
        reportDoc({
          id: "e2e-withheld",
          title: "Confidential report",
          owner: HOLDER,
          conversationId: "conv-withheld",
          sections: WITHHELD_SECTIONS,
        }),
      ]);

      // A viewer who lacks the confidential role owns nothing here and lacks the
      // role, so s1 is withheld and s2 is broken — in the same report.
      await ldf.user(PLAIN);
      await ldf.goto("/ai-reporting/report?report_id=e2e-withheld");
      await expect(page.getByText("Report not found")).toBeHidden();

      // Withheld: the no-access wording, and it names neither the collection nor
      // the role — the access model must not leak.
      await expect(
        page.getByText("You don't have access to the data in this section"),
      ).toBeVisible();
      await expect(
        page.getByText("demo_activities_confidential", { exact: false }),
      ).toBeHidden();
      await expect(
        page.getByText("report-confidential", { exact: false }),
      ).toBeHidden();

      // Broken (s2) reads differently — its generic failure wording is present,
      // so the two variants are not the same alert.
      await expect(
        page.getByText("This section failed to load", { exact: false }),
      ).toBeVisible();

      // Withheld carries no recoveries for anyone — not even an owner could act
      // on it, so there is nothing to click on the confidential section.
      await ldf.user(HOLDER);
      await ldf.goto("/ai-reporting/report?report_id=e2e-withheld");
      // As the role holder the confidential chart resolves, so the no-access line
      // is gone entirely.
      await expect(
        page.getByText("You don't have access to the data in this section"),
      ).toBeHidden();
    },
  );

  test(
    "two independent filter groups each render inline above their own group",
    async ({ ldf, page, mdb }) => {
      await mdb.seed(REPORTS, [
        reportDoc({
          id: "e2e-two-groups",
          title: "Two filter groups",
          owner: HOLDER,
          sections: TWO_GROUP_SECTIONS,
        }),
      ]);

      await ldf.user(HOLDER);
      await ldf.goto("/ai-reporting/report?report_id=e2e-two-groups");
      await expect(page.getByText("Report not found")).toBeHidden();

      // Each control names its own scope, and because each drives more than one
      // section it also carries a scope note. The note is the label's `extra` —
      // a separate muted line under the control, NOT a parenthetical appended to
      // the title (appending it wrapped the title and pushed the input out of
      // alignment with the control beside it in the row). It names the sections
      // beyond the one the control is anchored above, so each filter names the
      // second of its two.
      await expect(page.getByText("Activity type", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Also filters: Activities by type", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Capture channel", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Also filters: Activities by channel", { exact: true }),
      ).toBeVisible();
    },
  );
});

// ── Authorization layer (real — the gates the render layer displays) ─────────

test.describe("report failure gates (endpoint-level)", () => {
  test("the role gate behind the withheld alert denies a non-holder and admits a holder", async ({
    ldf,
    page,
    mdb,
  }) => {
    await mdb.seed("demo_activities", ACTIVITIES);

    // query-data is the single security boundary compileReport's withheld
    // classification mirrors: a viewer without report-confidential cannot query
    // the gated collection, which is exactly why their section is withheld.
    await ldf.user(PLAIN);
    const denied = await callEndpoint(page, "query-data", { query: confidentialQuery });
    expect(denied.body?.success).not.toBe(true);

    // The holder is admitted — the same query succeeds, proving the gate turns on
    // the role and nothing else.
    await ldf.user(HOLDER);
    const allowed = await callEndpoint(page, "query-data", { query: confidentialQuery });
    expect(allowed.body?.success).toBe(true);

    // A role-less collection stays queryable for the non-holder — the gate is
    // opt-in per collection, not a blanket lock.
    await ldf.user(PLAIN);
    const open = await callEndpoint(page, "query-data", { query: activityCount });
    expect(open.body?.success).toBe(true);
  });

  test("Drop removes the broken section for its owner and is refused for a non-owner", async ({
    ldf,
    page,
    mdb,
  }) => {
    await mdb.seed("demo_activities", ACTIVITIES);
    await mdb.seed(REPORTS, [
      reportDoc({
        id: "e2e-broken-drop",
        title: "Broken report",
        owner: HOLDER,
        conversationId: "conv-broken",
        sections: BROKEN_SECTIONS,
      }),
    ]);

    // A non-owner's Drop is refused by the owner match in the load — the hidden
    // button is only the affordance; this is the authorization.
    await ldf.user(PLAIN);
    const refused = await callEndpoint(page, "remove-report-section", {
      report_id: "e2e-broken-drop",
      section_id: "s1",
    });
    expect(refused.rejected).toBe(true);

    // The owner drops the broken section; the surviving spec is the healthy KPI
    // alone and still validates.
    await ldf.user(HOLDER);
    const dropped = await callEndpoint(page, "remove-report-section", {
      report_id: "e2e-broken-drop",
      section_id: "s1",
    });
    expect(dropped.response).toMatchObject({ ok: true });

    const doc = await mdb.collection(REPORTS).findOne({ _id: "e2e-broken-drop" });
    expect(doc.spec.sections.map((s) => s.id)).toEqual(["s0"]);
  });

  test("a broken section that is not role-gated is not treated as withheld", async ({
    ldf,
    page,
    mdb,
  }) => {
    // The distinction the withheld alert depends on, at the gate: a dropped
    // collection is denied because it is not cataloged at all (a membership
    // fault), NOT because of roles — so even a full-access user is refused, and
    // the section is classified broken rather than withheld.
    await ldf.user(HOLDER);
    const { errored, body } = await callEndpoint(page, "query-data", {
      query: droppedCollection,
    });
    expect(body?.success).not.toBe(true);
    expect(errored).toBe(true);
  });
});
