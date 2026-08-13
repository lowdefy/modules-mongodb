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

test("stacked on a non-bar chart is rejected by spec validation", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("demo_orders", ORDERS);
  await ldf.user(USER_A);

  const result = await callEndpoint(page, "chart-data", {
    chart: "line",
    title: "Revenue by region",
    x: "region",
    y: ["revenue"],
    query: ordersByRegionTwoMeasures,
    stacked: true,
  });
  expect(result.body?.success).not.toBe(true);
});
