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
    data: { label: "Orders export", description: "", query: exportSpec.query },
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
      data: { label: "Orders export", description: "Revenue by region", query: exportSpec.query },
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

test("caps charts and downloads separately, so charts cannot starve downloads", () => {
  const rows = [{ status: "paid", count: 1 }];
  const parts = buildDataParts({
    charts: Array.from({ length: 12 }, () => chartSpec),
    results: Array.from({ length: 12 }, () => rows),
    downloads: Array.from({ length: 12 }, () => exportSpec),
    roles,
  });
  const kinds = parts.map((p) => p.type);
  expect(kinds.filter((k) => k === "data-report-chart")).toHaveLength(8);
  // Under one shared budget of 8 this was 0 — the charts consumed it all.
  expect(kinds.filter((k) => k === "data-report-download")).toHaveLength(8);
});

// The turn's parts are built in an onFinish hook whose errors handleAgentChat
// only console.warns, so one bad spec must never take the turn's other parts
// down with it. Each case below pairs the bad spec with a good one and asserts
// the good one still arrives.
test("an invalid chart spec is skipped, not thrown", () => {
  const rows = [{ status: "paid", count: 1 }];
  const parts = buildDataParts({
    charts: [
      { chart: "scatter3d", title: "X", query: chartSpec.query, x: "status", y: ["count"] },
      chartSpec,
    ],
    results: [[], rows],
    downloads: [exportSpec],
    roles,
  });
  expect(parts.map((p) => p.type)).toEqual(["data-report-chart", "data-report-download"]);
  expect(parts[0].data.title).toBe("Orders by Status");
});

test("a chart whose declared column is missing from its rows is skipped", () => {
  const parts = buildDataParts({
    charts: [chartSpec, chartSpec],
    results: [[{ status: "paid", wrongKey: 5 }], [{ status: "paid", count: 1 }]],
    roles,
  });
  expect(parts).toHaveLength(1);
  expect(parts[0].data.option.dataset.source).toEqual([{ status: "paid", count: 1 }]);
});

test("a chart with a non-numeric y column is skipped", () => {
  const parts = buildDataParts({
    charts: [chartSpec],
    results: [[{ status: "paid", count: "five" }]],
    downloads: [exportSpec],
    roles,
  });
  expect(parts.map((p) => p.type)).toEqual(["data-report-download"]);
});

test("a skipped spec does not spend the per-turn budget", () => {
  const rows = [{ status: "paid", count: 1 }];
  const bad = { ...chartSpec, chart: "scatter3d" };
  const parts = buildDataParts({
    charts: [bad, ...Array.from({ length: 8 }, () => chartSpec)],
    results: Array.from({ length: 9 }, () => rows),
    roles,
  });
  expect(parts).toHaveLength(8);
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

test("a contract-shaped export payload is skipped, not thrown", () => {
  const parts = buildDataParts({
    downloads: [{ ...exportSpec, columns: [{ key: "region" }] }, exportSpec],
    roles,
  });
  expect(parts).toHaveLength(1);
  expect(parts[0].data.label).toBe("Orders export");
});
