import compileReport from "./compileReport.js";
import querySections from "./querySections.js";
import testCatalog from "./testDatasets.js";

const roles = ["analyst"];
const endpointId = "reporting/query-data";

const orderTotal = {
  collection: "demo_orders",
  pipeline: [{ $group: { _id: null, total: { $sum: "$total" } } }],
};
const ordersByRegion = {
  collection: "demo_orders",
  pipeline: [
    { $group: { _id: "$region", total: { $sum: "$total" } } },
    { $project: { _id: 0, region: "$_id", total: 1 } },
  ],
};

const zarFormat = { style: "currency", currency: "ZAR", locale: "en-ZA" };

const spec = {
  title: "Q2 Revenue by Region",
  description: "Revenue and order counts, filterable by status.",
  sections: [
    { type: "kpi", label: "Total Revenue", query: orderTotal, valueKey: "total", format: zarFormat },
    { type: "chart", chart: "bar", label: "Revenue by Region", query: ordersByRegion, x: "region", y: ["total"] },
    { type: "filter", control: "select", field: "status", label: "Status" },
    {
      type: "table",
      label: "Orders",
      query: ordersByRegion,
      columns: [{ key: "region", label: "Region" }, { key: "total", label: "Total", format: zarFormat }],
      filterBy: ["status"],
    },
    { type: "download", label: "Download CSV", query: ordersByRegion },
  ],
};

// results align with querySections order: kpi (s0), chart (s1), table (s3)
const results = [
  [{ total: 4200 }],
  [
    { region: "EU", total: 2500 },
    { region: "US", total: 1700 },
  ],
  [{ region: "EU", total: 2500 }],
];

test("querySections returns kpi, chart and table queries in order", () => {
  const sections = querySections({ spec, roles });
  expect(sections.map((s) => s.id)).toEqual(["s0", "s1", "s3"]);
  expect(sections[0].query).toEqual(orderTotal);
});

test("compiles the full report to blocks", () => {
  const blocks = compileReport({ spec, results, catalog: testCatalog, roles, endpointId });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));

  expect(byId.report_title.properties.content).toBe("Q2 Revenue by Region");

  // KPI: unfiltered → value inlined. ZAR currency contract → 2 decimals and a
  // rand prefix, separators from the en-ZA locale.
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s0.properties.value).toBe(4200);
  expect(byId.s0.properties.precision).toBe(2);
  expect(byId.s0.properties.prefix).toMatch(/^R/);

  // Chart: explicit x/y encode from the contract; rows inlined into the source.
  expect(byId.s1.type).toBe("EChart");
  expect(byId.s1.properties.title).toBeUndefined();
  expect(byId.s1_heading.properties.content).toBe("Revenue by Region");
  expect(byId.s1.properties.option.dataset.source).toEqual(results[1]);
  expect(byId.s1.properties.option.series[0]).toEqual({
    type: "bar",
    name: "total",
    encode: { x: "region", y: "total" },
  });

  // Table bound to the status filter: deferred __if_none of __state and snapshot.
  expect(byId.s3.type).toBe("AgGridAlpine");
  expect(byId.s3.properties.rowData).toEqual({
    __if_none: [{ __state: "sections.s3.rows" }, results[2]],
  });

  // Table columns: plain text column bare, formatted (numeric) column
  // right-aligns and formats via _intl. No tag renderer anywhere.
  const cols = Object.fromEntries(byId.s3.properties.columnDefs.map((c) => [c.field, c]));
  expect(cols.region.cellRenderer).toBeUndefined();
  expect(cols.region.headerName).toBe("Region");
  expect(cols.total.type).toBe("numericColumn");
  expect(cols.total.cellRenderer.__function["___intl.numberFormat"].options).toMatchObject({
    style: "currency",
    currency: "ZAR",
  });
  expect(JSON.stringify(byId.s3)).not.toContain("nunjucks");

  // Filter control: moved into the top filter row, options from catalog values.
  const filter = byId.report_filters.blocks.find((b) => b.id === "filter_status");
  expect(filter.type).toBe("Selector");
  expect(filter.properties.options).toEqual(["pending", "paid", "shipped", "cancelled"]);
  const [call, set] = filter.events.onChange;
  expect(call.type).toBe("CallAPI");
  expect(call.params.endpointId).toBe(endpointId);
  expect(call.params.payload.query).toEqual(ordersByRegion);
  expect(call.params.payload.filters).toEqual([
    { field: "status", op: "eq", value: { __state: "filter_status" } },
  ]);
  expect(set.type).toBe("SetState");
  expect(set.params["sections.s3.rows"]).toEqual({ __api: `${endpointId}.response` });

  // Download: CallAPI (pipeline-only payload) then DownloadCsv.
  const download = byId.s4;
  expect(download.type).toBe("Button");
  const [dlCall, dl] = download.events.onClick;
  expect(dlCall.params.payload).toEqual({ query: ordersByRegion });
  expect(dl.type).toBe("DownloadCsv");
  expect(dl.params.filename).toBe("download-csv.csv");
  expect(dl.params.data).toEqual({ __api: `${endpointId}.response` });
});

test("failed sections render as Alert cards while the rest render", () => {
  const sparseResults = [results[0], undefined, results[2]];
  const blocks = compileReport({ spec, results: sparseResults, catalog: testCatalog, roles, endpointId });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s1.type).toBe("Alert");
  expect(byId.s1.properties.message).toBe("Revenue by Region");
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s3.type).toBe("AgGridAlpine");
});

test("a contract mismatch (missing column) renders that section as an Alert card", () => {
  const badResults = [[{ wrongKey: 4200 }], results[1], results[2]];
  const blocks = compileReport({ spec, results: badResults, catalog: testCatalog, roles, endpointId });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s0.type).toBe("Alert");
  expect(byId.s0.properties.description).toMatch(/column "total" is not present/);
  expect(byId.s1.type).toBe("EChart");
});

test("a non-numeric chart y column renders that section as an Alert card", () => {
  const badResults = [results[0], [{ region: "EU", total: "lots" }], results[2]];
  const blocks = compileReport({ spec, results: badResults, catalog: testCatalog, roles, endpointId });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s1.type).toBe("Alert");
  expect(byId.s1.properties.description).toMatch(/must be numeric/);
});

test("zero rows and null value cells render normally (no verification failure)", () => {
  const emptyAndNull = [
    [], // kpi: zero rows → falls back to 0
    [{ region: null, total: null }], // chart: null group key + null value tolerated
    [], // table: zero rows
  ];
  const blocks = compileReport({ spec, results: emptyAndNull, catalog: testCatalog, roles, endpointId });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s0.properties.value).toBe(0);
  expect(byId.s1.type).toBe("EChart");
  expect(byId.s3.type).toBe("AgGridAlpine");
});

test("normalizes object-shaped (sparse step) results", () => {
  const blocks = compileReport({
    spec,
    results: { 0: results[0], 2: results[2] },
    catalog: testCatalog,
    roles,
    endpointId,
  });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s1.type).toBe("Alert");
});

test("compiled output never contains _secret", () => {
  const blocks = compileReport({ spec, results, catalog: testCatalog, roles, endpointId });
  expect(JSON.stringify(blocks)).not.toContain("_secret");
});

test("requires the query-data endpointId", () => {
  expect(() => compileReport({ spec, results, catalog: testCatalog, roles })).toThrow(
    /endpointId .* required/
  );
});

test("kpi bound to a filter defers its value through state", () => {
  const boundSpec = {
    title: "T",
    sections: [
      { type: "filter", control: "select", field: "status", label: "Status" },
      { type: "kpi", label: "Total", query: orderTotal, valueKey: "total", filterBy: ["status"] },
    ],
  };
  const blocks = compileReport({
    spec: boundSpec,
    results: [[{ total: 10 }]],
    catalog: testCatalog,
    roles,
    endpointId,
  });
  const kpi = blocks.find((b) => b.id === "s1");
  expect(kpi.properties.value).toEqual({
    __if_none: [{ __state: "sections.s1.rows.0.total" }, 10],
  });
});
