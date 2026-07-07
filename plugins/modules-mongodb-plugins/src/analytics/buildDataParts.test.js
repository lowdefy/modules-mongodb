import buildDataParts from "./buildDataParts.js";
import testDatasets from "./testDatasets.js";

const roles = ["analyst"];

const chartSpec = {
  chart: "pie",
  title: "Orders by Status",
  query: { dataset: "orders", select: ["status"], measures: [{ id: "count", agg: "count" }] },
};

const exportSpec = {
  label: "Orders export",
  query: { dataset: "orders", select: ["region"], measures: [{ id: "total", agg: "sum" }] },
};

test("builds chart and download parts", () => {
  const rows = [
    { status: "paid", count_count: 5 },
    { status: "pending", count_count: 2 },
  ];
  const parts = buildDataParts({
    charts: [chartSpec],
    results: [rows],
    downloads: [exportSpec],
    datasets: testDatasets,
    roles,
  });
  expect(parts).toHaveLength(2);
  expect(parts[0].type).toBe("data-report-chart");
  expect(parts[0].data.title).toBe("Orders by Status");
  expect(parts[0].data.option.dataset.source).toEqual(rows);
  expect(parts[0].data.option.series[0].encode).toEqual({
    itemName: "status",
    value: "count_count",
  });
  expect(parts[1]).toEqual({
    type: "data-report-download",
    data: { label: "Orders export", spec: exportSpec.query },
  });
});

test("skips charts whose query failed (sparse results)", () => {
  const parts = buildDataParts({
    charts: [chartSpec, chartSpec],
    results: [undefined, [{ status: "paid", count_count: 1 }]],
    datasets: testDatasets,
    roles,
  });
  expect(parts).toHaveLength(1);
});

test("processes at most 8 specs per turn", () => {
  const rows = [{ status: "paid", count_count: 1 }];
  const parts = buildDataParts({
    charts: Array.from({ length: 6 }, () => chartSpec),
    results: Array.from({ length: 6 }, () => rows),
    downloads: Array.from({ length: 6 }, () => exportSpec),
    datasets: testDatasets,
    roles,
  });
  expect(parts).toHaveLength(8);
});

test("invalid chart spec throws with an actionable message", () => {
  expect(() =>
    buildDataParts({
      charts: [{ chart: "scatter3d", title: "X", query: chartSpec.query }],
      results: [[]],
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/chart "scatter3d" is not one of bar, line, pie/);
});
