import { test, expect } from "../fixtures.js";
import { ORDERS, USER_A, callEndpoint } from "./helpers.js";

// chart-data driven directly, the way the authorization specs drive query-data:
// the endpoint assembles the ECharts option server-side, so what a report chart
// actually draws — grouped vs stacked series, the canvas height — is only
// observable in its response.

const ordersByRegionTwoMeasures = {
  collection: "demo_orders",
  pipeline: [
    {
      $group: {
        _id: "$region",
        revenue: { $sum: "$total" },
        units: { $sum: "$quantity" },
      },
    },
    { $project: { _id: 0, region: "$_id", revenue: 1, units: 1 } },
    { $sort: { revenue: -1 } },
  ],
};

test("multi-series bars group by default and stack on stacked: true", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("demo_orders", ORDERS);
  await ldf.user(USER_A);

  const spec = {
    chart: "bar",
    title: "Revenue and units by region",
    x: "region",
    y: ["revenue", "units"],
    query: ordersByRegionTwoMeasures,
  };

  // Default: one bar series per y column, side by side — no stack key.
  const grouped = await callEndpoint(page, "chart-data", spec);
  expect(grouped.body?.success).toBe(true);
  expect(grouped.response.option.series).toHaveLength(2);
  for (const series of grouped.response.option.series) {
    expect(series.stack).toBeUndefined();
  }
  expect(typeof grouped.response.height).toBe("number");

  // stacked: true — the same contract, series sharing one stack.
  const stacked = await callEndpoint(page, "chart-data", {
    ...spec,
    stacked: true,
  });
  expect(stacked.body?.success).toBe(true);
  const stacks = new Set(
    stacked.response.option.series.map((series) => series.stack),
  );
  expect(stacks.size).toBe(1);
  expect([...stacks][0]).toBeTruthy();
});

// The drawn width is client-requery surface: the compiled report page sends the
// width its chart block is laid out at, and the endpoint has to both admit it
// through payloadSchema and carry it into assembly. Only reachable here — a
// build check sees neither the schema bound nor the routine's payload read.
test("the drawn width reaches assembly and decides legend orientation", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("demo_orders", ORDERS);
  await ldf.user(USER_A);

  const spec = {
    chart: "bar",
    title: "Revenue and units by region",
    x: "region",
    y: ["revenue", "units"],
    query: ordersByRegionTwoMeasures,
  };

  // The report column can afford the legend column Flint funds out of grid.right.
  const wide = await callEndpoint(page, "chart-data", { ...spec, width: 1100 });
  expect(wide.body?.success).toBe(true);
  expect(wide.response.option.legend.orient).toBe("vertical");

  // The chat panel cannot, so the legend becomes a band above the plot and the
  // canvas grows by its height.
  const narrow = await callEndpoint(page, "chart-data", {
    ...spec,
    width: 420,
  });
  expect(narrow.body?.success).toBe(true);
  expect(narrow.response.option.legend.orient).toBe("horizontal");
  expect(narrow.response.option.grid.right).toBeLessThan(
    wide.response.option.grid.right,
  );
  expect(narrow.response.height).toBeGreaterThan(wide.response.height);
});

// The report's colour identity map is the same kind of client-requery surface as
// the width, and needs the same proof: admitted through payloadSchema (whose
// additionalProperties hex pattern would reject the whole payload if the map
// were shaped wrong) and carried into assembly. A build check sees neither.
test("the report colour map reaches assembly and outranks series order", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("demo_orders", ORDERS);
  await ldf.user(USER_A);

  const result = await callEndpoint(page, "chart-data", {
    chart: "bar",
    title: "Revenue and units by region",
    x: "region",
    y: ["revenue", "units"],
    query: ordersByRegionTwoMeasures,
    // Units before Revenue in palette terms, which is the opposite of what
    // assignment by series index would give — so the hues can only come from
    // the map.
    colors: { Units: "#2a78d6", Revenue: "#eb6834" },
  });
  expect(result.body?.success).toBe(true);
  const hues = Object.fromEntries(
    result.response.option.series.map((series) => [
      series.name,
      series.itemStyle.color,
    ]),
  );
  expect(hues).toEqual({ Revenue: "#eb6834", Units: "#2a78d6" });
});

// The pie slice cap, through the real endpoint. A pie is the one chart whose
// mark colours travel down `option.color` BY INDEX rather than on the series, and
// the capped aggregate is the one mark that has to sit outside the palette — so
// what actually gets drawn is only observable in the assembled option, and only
// the endpoint assembles it.
test("a pie past the slice cap draws six slices and a neutral Other", async ({
  ldf,
  page,
  mdb,
}) => {
  // Nine categories with descending revenue, so the six kept are unambiguous and
  // the tail is everything after them.
  await mdb.seed(
    "demo_orders",
    Array.from({ length: 9 }, (_, index) => ({
      _id: `p${index}`,
      region: "EU",
      category: `Cat ${index + 1}`,
      total: (9 - index) * 100,
      quantity: 1,
    })),
  );
  await ldf.user(USER_A);

  const result = await callEndpoint(page, "chart-data", {
    chart: "pie",
    title: "Revenue share by category",
    x: "category",
    y: ["revenue"],
    query: {
      collection: "demo_orders",
      pipeline: [
        { $group: { _id: "$category", revenue: { $sum: "$total" } } },
        { $project: { _id: 0, category: "$_id", revenue: 1 } },
        { $sort: { revenue: -1 } },
      ],
    },
    // The identity map covers a kept slice and names the aggregate too — the
    // aggregate must ignore it, or an "Other" wearing an identity hue reads as a
    // seventh entity beside the six it stands in for.
    colors: { "Cat 1": "#1baf7a", Other: "#eb6834" },
  });
  expect(result.body?.success).toBe(true);

  const { data } = result.response.option.series[0];
  expect(data).toHaveLength(7);
  const names = data.map((datum) => datum.name);
  expect(names.slice(0, 6)).toEqual([
    "Cat 1",
    "Cat 2",
    "Cat 3",
    "Cat 4",
    "Cat 5",
    "Cat 6",
  ]);
  expect(names[6]).toBe("Other");
  // The tail of three: 300 + 200 + 100.
  expect(data[6].value).toBe(600);
  expect(data[6].itemStyle.color).toBe("#8c8c8c");
  // A kept slice reads its hue out of the map, by its index in option.color.
  expect(result.response.option.color[names.indexOf("Cat 1")]).toBe("#1baf7a");
});

test("stacked on a non-bar chart is rejected by spec validation", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("demo_orders", ORDERS);
  await ldf.user(USER_A);

  const lineSpec = {
    chart: "line",
    title: "Revenue by region",
    x: "region",
    y: ["revenue"],
    query: ordersByRegionTwoMeasures,
  };
  // Control: the same spec without stacked succeeds, so the failure below is
  // pinned to stacked rather than to auth or a broken endpoint.
  const control = await callEndpoint(page, "chart-data", lineSpec);
  expect(control.body?.success).toBe(true);

  const result = await callEndpoint(page, "chart-data", {
    ...lineSpec,
    stacked: true,
  });
  // The validator throws (routine error), it doesn't :reject: — same shape the
  // query-data validation-gate specs assert.
  expect(result.errored).toBe(true);
  expect(result.body?.success).not.toBe(true);
});
