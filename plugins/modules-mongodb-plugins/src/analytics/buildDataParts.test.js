import buildDataParts from "./buildDataParts.js";

const roles = ["analyst"];

const chartSpec = {
  chart: "pie",
  title: "Orders by Status",
  query: {
    collection: "demo_orders",
    pipeline: [{ $group: { _id: "$status", count: { $sum: 1 } } }, { $project: { _id: 0, status: "$_id", count: 1 } }],
  },
  x: "status",
  y: ["count"],
};

const exportSpec = {
  label: "Orders export",
  query: {
    collection: "demo_orders",
    pipeline: [{ $group: { _id: "$region", total: { $sum: "$total" } } }],
  },
};

test("builds chart and download parts", () => {
  const rows = [
    { status: "paid", count: 5 },
    { status: "pending", count: 2 },
  ];
  const parts = buildDataParts({
    charts: [chartSpec],
    results: [rows],
    downloads: [exportSpec],
    roles,
  });
  expect(parts).toHaveLength(2);
  expect(parts[0].type).toBe("data-report-chart");
  expect(parts[0].data.title).toBe("Orders by Status");
  expect(parts[0].data.option.dataset.source).toEqual(rows);
  expect(parts[0].data.option.series[0].encode).toEqual({ itemName: "status", value: "count" });
  expect(parts[1]).toEqual({
    type: "data-report-download",
    data: { label: "Orders export", description: "", spec: exportSpec.query },
  });
});

test("carries the export description through to the download part", () => {
  const parts = buildDataParts({
    downloads: [{ ...exportSpec, description: "Revenue by region" }],
    roles,
  });
  expect(parts).toEqual([
    {
      type: "data-report-download",
      data: { label: "Orders export", description: "Revenue by region", spec: exportSpec.query },
    },
  ]);
});

test("skips charts whose query failed (sparse results)", () => {
  const parts = buildDataParts({
    charts: [chartSpec, chartSpec],
    results: [undefined, [{ status: "paid", count: 1 }]],
    roles,
  });
  expect(parts).toHaveLength(1);
});

test("processes at most 8 specs per turn", () => {
  const rows = [{ status: "paid", count: 1 }];
  const parts = buildDataParts({
    charts: Array.from({ length: 6 }, () => chartSpec),
    results: Array.from({ length: 6 }, () => rows),
    downloads: Array.from({ length: 6 }, () => exportSpec),
    roles,
  });
  expect(parts).toHaveLength(8);
});

test("invalid chart spec throws with an actionable message", () => {
  expect(() =>
    buildDataParts({
      charts: [{ chart: "scatter3d", title: "X", query: chartSpec.query, x: "status", y: ["count"] }],
      results: [[]],
      roles,
    })
  ).toThrow(/chart "scatter3d" is not one of bar, line, pie/);
});

test("a missing declared column throws (actionable contract error)", () => {
  expect(() =>
    buildDataParts({
      charts: [chartSpec],
      results: [[{ status: "paid", wrongKey: 5 }]],
      roles,
    })
  ).toThrow(/column "count" is not present/);
});

test("a non-numeric y column throws", () => {
  expect(() =>
    buildDataParts({
      charts: [chartSpec],
      results: [[{ status: "paid", count: "five" }]],
      roles,
    })
  ).toThrow(/must be numeric/);
});

test("zero rows and null value cells build a chart without a verification failure", () => {
  const empty = buildDataParts({ charts: [chartSpec], results: [[]], roles });
  expect(empty).toHaveLength(1);
  expect(empty[0].data.option.dataset.source).toEqual([]);

  const withNulls = buildDataParts({
    charts: [chartSpec],
    results: [[{ status: null, count: null }]],
    roles,
  });
  expect(withNulls).toHaveLength(1);
});

test("export validator rejects a contract-shaped payload", () => {
  expect(() =>
    buildDataParts({
      downloads: [{ ...exportSpec, columns: [{ key: "region" }] }],
      roles,
    })
  ).toThrow(/exports carry no presentation contract/);
});
