import compileReport from "./compileReport.js";
import querySections from "./querySections.js";
import testDatasets from "./testDatasets.js";

const roles = ["analyst"];
const endpointId = "reporting/query-data";

const spec = {
  title: "Q2 Revenue by Region",
  description: "Revenue and order counts, filterable by status.",
  sections: [
    {
      type: "kpi",
      label: "Total Revenue",
      query: { dataset: "orders", measures: [{ id: "total", agg: "sum" }] },
    },
    {
      type: "chart",
      chart: "bar",
      label: "Revenue by Region",
      query: { dataset: "orders", select: ["region"], measures: [{ id: "total", agg: "sum" }] },
    },
    { type: "filter", control: "select", field: "status", label: "Status" },
    {
      type: "table",
      label: "Orders",
      query: { dataset: "orders", select: ["region", "status"], measures: [{ id: "total", agg: "sum" }] },
      filterBy: ["status"],
    },
    {
      type: "download",
      label: "Download CSV",
      query: { dataset: "orders", select: ["region"], measures: [{ id: "total", agg: "sum" }] },
    },
  ],
};

// results align with querySections order: kpi (s0), chart (s1), table (s3)
const results = [
  [{ total_sum: 4200 }],
  [
    { region: "EU", total_sum: 2500 },
    { region: "US", total_sum: 1700 },
  ],
  [{ region: "EU", status: "paid", total_sum: 2500 }],
];

test("querySections returns kpi, chart and table queries in order", () => {
  const sections = querySections({ spec, datasets: testDatasets, roles });
  expect(sections.map((s) => s.id)).toEqual(["s0", "s1", "s3"]);
});

test("compiles the full report to blocks", () => {
  const blocks = compileReport({ spec, results, datasets: testDatasets, roles, endpointId });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));

  expect(byId.report_title.properties.content).toBe("Q2 Revenue by Region");

  // KPI: unfiltered → value inlined at resolve time.
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s0.properties.value).toBe(4200);

  // Chart: unfiltered → rows inlined into the ECharts dataset source.
  expect(byId.s1.type).toBe("EChart");
  expect(byId.s1.properties.option.dataset.source).toEqual(results[1]);
  expect(byId.s1.properties.option.series[0]).toEqual({
    type: "bar",
    name: "total_sum",
    encode: { x: "region", y: "total_sum" },
  });

  // Table bound to the status filter: deferred __if_none of __state and snapshot.
  expect(byId.s3.type).toBe("AgGridAlpine");
  expect(byId.s3.properties.rowData).toEqual({
    __if_none: [{ __state: "sections.s3.rows" }, results[2]],
  });

  // Filter control: CallAPI re-query for the bound section, then SetState from __api.
  const filter = byId.filter_status;
  expect(filter.type).toBe("Selector");
  expect(filter.properties.options).toEqual(["pending", "paid", "shipped", "cancelled"]);
  const [call, set] = filter.events.onChange;
  expect(call.type).toBe("CallAPI");
  expect(call.params.endpointId).toBe(endpointId);
  expect(call.params.payload.spec.filters).toEqual([
    { field: "status", op: "eq", value: { __state: "filter_status" } },
  ]);
  expect(set.type).toBe("SetState");
  expect(set.params["sections.s3.rows"]).toEqual({
    __api: `${endpointId}.response`,
  });

  // Download: CallAPI then DownloadCsv from the response.
  const download = byId.s4;
  expect(download.type).toBe("Button");
  const [dlCall, dl] = download.events.onClick;
  expect(dlCall.params.payload.spec).toEqual(spec.sections[4].query);
  expect(dl.type).toBe("DownloadCsv");
  expect(dl.params.filename).toBe("download-csv.csv");
  expect(dl.params.data).toEqual({ __api: `${endpointId}.response` });
});

test("failed sections render as Alert cards while the rest render", () => {
  const sparseResults = [results[0], undefined, results[2]];
  const blocks = compileReport({
    spec,
    results: sparseResults,
    datasets: testDatasets,
    roles,
    endpointId,
  });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s1.type).toBe("Alert");
  expect(byId.s1.properties.message).toBe("Revenue by Region");
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s3.type).toBe("AgGridAlpine");
});

test("normalizes object-shaped (sparse step) results", () => {
  const blocks = compileReport({
    spec,
    results: { 0: results[0], 2: results[2] },
    datasets: testDatasets,
    roles,
    endpointId,
  });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s1.type).toBe("Alert");
});

test("compiled output never contains _secret", () => {
  const blocks = compileReport({ spec, results, datasets: testDatasets, roles, endpointId });
  expect(JSON.stringify(blocks)).not.toContain("_secret");
});

test("requires the query-data endpointId", () => {
  expect(() =>
    compileReport({ spec, results, datasets: testDatasets, roles })
  ).toThrow(/endpointId .* required/);
});

test("kpi bound to a filter defers its value through state", () => {
  const boundSpec = {
    title: "T",
    sections: [
      { type: "filter", control: "select", field: "status", label: "Status" },
      {
        type: "kpi",
        label: "Total",
        query: { dataset: "orders", measures: [{ id: "total", agg: "sum" }] },
        filterBy: ["status"],
      },
    ],
  };
  const blocks = compileReport({
    spec: boundSpec,
    results: [[{ total_sum: 10 }]],
    datasets: testDatasets,
    roles,
    endpointId,
  });
  const kpi = blocks.find((b) => b.id === "s1");
  expect(kpi.properties.value).toEqual({
    __if_none: [{ __state: "sections.s1.rows.0.total_sum" }, 10],
  });
});
