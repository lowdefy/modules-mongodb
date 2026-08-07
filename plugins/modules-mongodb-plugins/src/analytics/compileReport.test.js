import compileReport from "./compileReport.js";
import querySections from "./querySections.js";
import testCatalog from "./testDatasets.js";
import {
  MAX_FILTER_OPTIONS,
  MAX_QUERY_FILTER_OPTIONS,
  PIPELINE_RESULT_CAP,
} from "./constants.js";

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
    {
      type: "kpi",
      label: "Total Revenue",
      query: orderTotal,
      valueKey: "total",
      format: zarFormat,
    },
    {
      type: "chart",
      chart: "bar",
      label: "Revenue by Region",
      query: ordersByRegion,
      x: "region",
      y: ["total"],
    },
    { type: "filter", control: "select", field: "status", label: "Status" },
    {
      type: "table",
      label: "Orders",
      query: ordersByRegion,
      columns: [
        { key: "region", label: "Region" },
        { key: "total", label: "Total", format: zarFormat },
      ],
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

// Regression guard for the orderedQueries refactor: a filter's optionsQuery
// entry rides the same resolver list as the data sections, interleaved at its
// spec position (s1, between the kpi at s0 and the table at s2). If
// compileReport recomputed its own kpi/chart/table-only id list (the old
// behaviour) instead of importing orderedQueries, the table would read the
// filter's result instead of its own — this asserts each data section renders
// the distinguishable rows the resolver returned for IT.
test("a filter's optionsQuery entry interleaved between data sections keeps each data section aligned with its own rows", () => {
  const kpiQuery = {
    collection: "demo_orders",
    pipeline: [{ $group: { _id: null, total: { $sum: "$total" } } }],
  };
  const interleavedSpec = {
    title: "T",
    sections: [
      {
        type: "kpi",
        label: "Total",
        query: kpiQuery,
        valueKey: "total",
        filterBy: ["region"],
      },
      {
        type: "filter",
        control: "select",
        field: "region",
        label: "Region",
        optionsQuery: {
          collection: "demo_orders",
          pipeline: [
            { $group: { _id: "$region", label: { $first: "$region" } } },
          ],
          valueKey: "_id",
          labelKey: "label",
        },
      },
      {
        type: "table",
        label: "Orders",
        query: ordersByRegion,
        columns: [{ key: "region" }, { key: "total" }],
      },
    ],
  };
  const kpiRows = [{ total: 111 }];
  const optionsRows = [{ _id: "north", label: "North" }];
  const tableRows = [{ region: "EU", total: 222 }];
  const blocks = compileReport({
    spec: interleavedSpec,
    results: [kpiRows, optionsRows, tableRows],
    catalog: testCatalog,
    roles,
    endpointId,
  });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s0.properties.value).toEqual({
    __if_none: [{ __state: "sections.s0.rows.0.total" }, 111],
  });
  expect(byId.s2.properties.rowData).toEqual(tableRows);
});

test("compiles the full report to blocks", () => {
  const blocks = compileReport({
    spec,
    results,
    catalog: testCatalog,
    roles,
    endpointId,
  });
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
  expect(byId.s3.type).toBe("AgGridBalham");
  expect(byId.s3.properties.rowData).toEqual({
    __if_none: [{ __state: "sections.s3.rows" }, results[2]],
  });

  // Table columns: plain text column bare, formatted (numeric) column
  // right-aligns and formats via _intl. No tag renderer anywhere.
  const cols = Object.fromEntries(
    byId.s3.properties.columnDefs.map((c) => [c.field, c]),
  );
  expect(cols.region.cellRenderer).toBeUndefined();
  expect(cols.region.headerName).toBe("Region");
  // Right-alignment via the block's `cell.align`, not ag-grid's numericColumn:
  // the block renders cells as flex containers, so numericColumn right-aligns
  // the header only and leaves the values on the opposite edge. `cell` carries
  // no `type`, which is what keeps the _intl cellRenderer below from being
  // replaced by the block's own renderer.
  expect(cols.total.cell).toEqual({ align: "right" });
  expect(cols.total.type).toBeUndefined();
  expect(cols.region.cell).toBeUndefined();
  expect(
    cols.total.cellRenderer.__function["___intl.numberFormat"].options,
  ).toMatchObject({
    style: "currency",
    currency: "ZAR",
  });
  expect(JSON.stringify(byId.s3)).not.toContain("nunjucks");

  // Filter control: moved into the top filter row, options from catalog values.
  const filter = byId.report_filters.blocks.find(
    (b) => b.id === "filter_status",
  );
  expect(filter.type).toBe("Selector");
  expect(filter.properties.options).toEqual([
    "pending",
    "paid",
    "shipped",
    "cancelled",
  ]);
  const [call, set] = filter.events.onChange;
  expect(call.type).toBe("CallAPI");
  expect(call.params.endpointId).toBe(endpointId);
  expect(call.params.payload.query).toEqual(ordersByRegion);
  expect(call.params.payload.filters).toEqual([
    { field: "status", op: "eq", value: { __state: "filter_status" } },
  ]);
  expect(set.type).toBe("SetState");
  expect(set.params["sections.s3.rows"]).toEqual({
    __api: `${endpointId}.response`,
  });

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
  const blocks = compileReport({
    spec,
    results: sparseResults,
    catalog: testCatalog,
    roles,
    endpointId,
  });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s1.type).toBe("Alert");
  expect(byId.s1.properties.message).toBe("Revenue by Region");
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s3.type).toBe("AgGridBalham");
});

test("a contract mismatch (missing column) renders that section as an Alert card", () => {
  const badResults = [[{ wrongKey: 4200 }], results[1], results[2]];
  const blocks = compileReport({
    spec,
    results: badResults,
    catalog: testCatalog,
    roles,
    endpointId,
  });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s0.type).toBe("Alert");
  expect(byId.s0.properties.description).toMatch(
    /column "total" is not present/,
  );
  expect(byId.s1.type).toBe("EChart");
});

test("a non-numeric chart y column renders that section as an Alert card", () => {
  const badResults = [
    results[0],
    [{ region: "EU", total: "lots" }],
    results[2],
  ];
  const blocks = compileReport({
    spec,
    results: badResults,
    catalog: testCatalog,
    roles,
    endpointId,
  });
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
  const blocks = compileReport({
    spec,
    results: emptyAndNull,
    catalog: testCatalog,
    roles,
    endpointId,
  });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s0.properties.value).toBe(0);
  expect(byId.s1.type).toBe("EChart");
  expect(byId.s3.type).toBe("AgGridBalham");
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
  const blocks = compileReport({
    spec,
    results,
    catalog: testCatalog,
    roles,
    endpointId,
  });
  expect(JSON.stringify(blocks)).not.toContain("_secret");
});

test("requires the query-data endpointId", () => {
  expect(() =>
    compileReport({ spec, results, catalog: testCatalog, roles }),
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
        query: orderTotal,
        valueKey: "total",
        filterBy: ["status"],
      },
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

// format.currency / format.locale are AI-supplied and validateReportSpec only
// checks they are strings — ICU decides whether they are usable. An unusable
// descriptor must degrade the one section, never the report: for a KPI the
// RangeError would otherwise escape compileReport entirely (intlSeparators runs
// outside the per-section try), and for a table column it would survive
// compilation and throw inside _intl in the browser.
test("an unusable KPI currency degrades that section to an Alert, not the report", () => {
  const badSpec = {
    title: "T",
    sections: [
      {
        type: "kpi",
        label: "Total",
        query: orderTotal,
        valueKey: "total",
        format: { style: "currency", currency: "$" },
      },
      {
        type: "kpi",
        label: "Good",
        query: orderTotal,
        valueKey: "total",
        format: zarFormat,
      },
    ],
  };
  const blocks = compileReport({
    spec: badSpec,
    results: [[{ total: 10 }], [{ total: 20 }]],
    catalog: testCatalog,
    roles,
    endpointId,
  });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  expect(byId.s0.type).toBe("Alert");
  expect(byId.s0.properties.description).toMatch(/unusable number format/);
  // The rest of the report still renders.
  expect(byId.s1.type).toBe("Statistic");
  expect(byId.report_title.properties.content).toBe("T");
});

test("an unusable locale on a table column degrades that section to an Alert", () => {
  const badSpec = {
    title: "T",
    sections: [
      {
        type: "table",
        label: "Orders",
        query: ordersByRegion,
        columns: [
          { key: "region" },
          {
            key: "total",
            format: { style: "decimal", locale: "not a locale" },
          },
        ],
      },
    ],
  };
  const blocks = compileReport({
    spec: badSpec,
    results: [[{ region: "EU", total: 1 }]],
    catalog: testCatalog,
    roles,
    endpointId,
  });
  const section = blocks.find((b) => b.id === "s0");
  expect(section.type).toBe("Alert");
  expect(section.properties.description).toMatch(
    /Column "total" has an unusable number format/,
  );
});

// A table showing exactly PIPELINE_RESULT_CAP rows reads as the complete answer
// when it is really the engine's appended $limit. Say so in the heading.
test("a section landing on the row cap says so in its heading", () => {
  const rows = Array.from({ length: PIPELINE_RESULT_CAP }, (_, i) => ({
    region: `r${i}`,
    total: i,
  }));
  const cappedSpec = {
    title: "T",
    sections: [
      {
        type: "table",
        label: "Orders",
        query: ordersByRegion,
        columns: [{ key: "region" }, { key: "total" }],
      },
    ],
  };
  const blocks = compileReport({
    spec: cappedSpec,
    results: [rows],
    catalog: testCatalog,
    roles,
    endpointId,
  });
  expect(blocks.find((b) => b.id === "s0_heading").properties.content).toBe(
    `Orders — first ${PIPELINE_RESULT_CAP} rows`,
  );

  // A short result keeps the plain label.
  const short = compileReport({
    spec: cappedSpec,
    results: [rows.slice(0, 3)],
    catalog: testCatalog,
    roles,
    endpointId,
  });
  expect(short.find((b) => b.id === "s0_heading").properties.content).toBe(
    "Orders",
  );
});

// A numeric column the agent did not format still deserves right-alignment —
// a count flush-left beside right-aligned money reads as a different kind of
// value. Numeric-ness is judged from the resolve-time rows, conservatively.
describe("unformatted numeric columns", () => {
  const tableSpec = (columns) => ({
    title: "T",
    sections: [
      { type: "table", label: "Orders", query: ordersByRegion, columns },
    ],
  });

  const colsFor = (columns, rows) => {
    const blocks = compileReport({
      spec: tableSpec(columns),
      results: [rows],
      catalog: testCatalog,
      roles,
      endpointId,
    });
    return Object.fromEntries(
      blocks
        .find((b) => b.id === "s0")
        .properties.columnDefs.map((c) => [c.field, c]),
    );
  };

  test("right-aligns a numeric column, and renders it raw", () => {
    const cols = colsFor(
      [{ key: "region" }, { key: "orders" }],
      [
        { region: "EU", orders: 24 },
        { region: "US", orders: 8 },
      ],
    );
    expect(cols.orders.cell).toEqual({ align: "right" });
    // No format was declared, so no formatter is invented for it.
    expect(cols.orders.cellRenderer).toBeUndefined();
    expect(cols.region.cell).toBeUndefined();
  });

  test("nulls are skipped, but one non-numeric value disqualifies the column", () => {
    const withNulls = colsFor(
      [{ key: "orders" }],
      [{ orders: null }, { orders: 24 }],
    );
    expect(withNulls.orders.cell).toEqual({ align: "right" });

    const mixed = colsFor(
      [{ key: "orders" }],
      [{ orders: 24 }, { orders: "n/a" }],
    );
    expect(mixed.orders.cell).toBeUndefined();
  });

  test("no rows, or only empty cells, is no evidence — alignment is left alone", () => {
    expect(colsFor([{ key: "orders" }], []).orders.cell).toBeUndefined();
    expect(
      colsFor([{ key: "orders" }], [{ orders: null }]).orders.cell,
    ).toBeUndefined();
  });
});

// Provenance is a read for everyone: who made the report (and when), when it
// was last edited (`updated`), and the resolve moment its numbers were computed
// from. A shared report also names the publisher. None of this is gated on
// ownership.
describe("provenance line", () => {
  const provenanceInputs = {
    created: {
      timestamp: new Date("2026-01-05T00:00:00Z"),
      user: { name: "Jane Doe" },
    },
    updated: {
      timestamp: new Date("2026-02-10T00:00:00Z"),
      user: { name: "Jane Doe" },
    },
    owner: { user_id: "u1", name: "Jane Doe" },
    resolvedAt: new Date("2026-03-15T14:30:00Z"),
  };

  const kpiOnlySpec = {
    title: "T",
    sections: [
      { type: "kpi", label: "Total", query: orderTotal, valueKey: "total" },
    ],
  };

  test("emits a provenance Paragraph naming owner, last-edited and computed times", () => {
    const blocks = compileReport({
      spec,
      results,
      catalog: testCatalog,
      roles,
      endpointId,
      ...provenanceInputs,
      visibility: "private",
    });
    const prov = blocks.find((b) => b.id === "report_provenance");
    expect(prov.type).toBe("Paragraph");
    expect(prov.layout).toEqual({ span: 24 });
    expect(prov.properties.content).toContain("Made by Jane Doe");
    expect(prov.properties.content).toContain("5 January 2026");
    expect(prov.properties.content).toContain("Last edited 10 February 2026");
    expect(prov.properties.content).toContain("Data as of 15 March 2026");
    // Global constraint: the middle fact is "last edited", never "spec changed".
    expect(prov.properties.content).not.toContain("spec changed");
    // Not shared → no publisher clause.
    expect(prov.properties.content).not.toContain("Shared");
  });

  test("a shared report names the publisher as the reason it is visible", () => {
    const blocks = compileReport({
      spec,
      results,
      catalog: testCatalog,
      roles,
      endpointId,
      ...provenanceInputs,
      visibility: "shared",
    });
    const prov = blocks.find((b) => b.id === "report_provenance");
    expect(prov.properties.content).toContain(
      "Shared with everyone by Jane Doe",
    );
  });

  // Absent provenance inputs (an old resolver, a report with no owner) must not
  // emit a blank line or "Invalid Date".
  test("no provenance inputs emits no provenance block", () => {
    const blocks = compileReport({
      spec,
      results,
      catalog: testCatalog,
      roles,
      endpointId,
    });
    expect(blocks.find((b) => b.id === "report_provenance")).toBeUndefined();
  });

  // Chart and table sections are query-backed result sets, so each carries a
  // CSV export re-querying its own rows; a KPI is a single number and gets none.
  test("chart and table sections carry a CSV download; kpi does not", () => {
    const blocks = compileReport({
      spec,
      results,
      catalog: testCatalog,
      roles,
      endpointId,
    });
    const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));

    // s1 chart, s3 table → downloads; s0 kpi → none.
    expect(byId.s0_download).toBeUndefined();
    for (const id of ["s1", "s3"]) {
      const dl = byId[`${id}_download`];
      expect(dl.type).toBe("Button");
      const [call, download] = dl.events.onClick;
      expect(call.type).toBe("CallAPI");
      expect(call.params.endpointId).toBe(endpointId);
      expect(call.params.payload).toEqual({ query: ordersByRegion });
      expect(download.type).toBe("DownloadCsv");
      expect(download.params.data).toEqual({ __api: `${endpointId}.response` });
      expect(download.params.filename).toMatch(/\.csv$/);
    }
  });

  test("a KPI-only report emits no CSV download at all", () => {
    const blocks = compileReport({
      spec: kpiOnlySpec,
      results: [[{ total: 10 }]],
      catalog: testCatalog,
      roles,
      endpointId,
      ...provenanceInputs,
    });
    expect(blocks.some((b) => b.id.endsWith("_download"))).toBe(false);
  });
});

// Each control emits its own block type and its own filter triples, and a
// filter whose options come from a query resolves them from the rows the
// resolver returned for ITS section.
describe("filter controls", () => {
  // One table bound to all three controls, so a single compile exercises every
  // block type and every triple shape. Only the table carries a query, so the
  // results array holds one entry.
  const allControlsSpec = (match) => ({
    title: "T",
    sections: [
      { type: "filter", control: "select", field: "status", label: "Status" },
      {
        type: "filter",
        control: "multiselect",
        field: "region",
        label: "Regions",
        ...(match === undefined ? {} : { match }),
      },
      {
        type: "filter",
        control: "daterange",
        field: "order_date",
        label: "Created",
      },
      {
        type: "table",
        label: "Orders",
        query: ordersByRegion,
        columns: [{ key: "region" }, { key: "total" }],
        filterBy: ["status", "region", "order_date"],
      },
    ],
  });

  const filterRow = (spec, results) => {
    const blocks = compileReport({
      spec,
      results,
      catalog: testCatalog,
      roles,
      endpointId,
    });
    const row = blocks.find((b) => b.id === "report_filters");
    return {
      blocks,
      byId: Object.fromEntries(blocks.map((b) => [b.id, b])),
      filters: Object.fromEntries(row.blocks.map((b) => [b.id, b])),
    };
  };

  const tableRows = [{ region: "EU", total: 1 }];

  test("each control emits its own block type, all inside the filter row", () => {
    const { filters } = filterRow(allControlsSpec(), [tableRows]);
    expect(filters.filter_status.type).toBe("Selector");
    expect(filters.filter_region.type).toBe("MultipleSelector");
    expect(filters.filter_order_date.type).toBe("DateRangeSelector");
  });

  // `match` is the author's intent; the triple's op is the query it compiles to
  // (AnalyticsPipeline's FILTER_OPS: in → $in, all → $all).
  test("triples per control: eq, in / all, and a gte+lte pair", () => {
    const { filters } = filterRow(allControlsSpec(), [tableRows]);
    expect(
      filters.filter_region.events.onChange[0].params.payload.filters,
    ).toEqual([
      { field: "status", op: "eq", value: { __state: "filter_status" } },
      { field: "region", op: "in", value: { __state: "filter_region" } },
      {
        field: "order_date",
        op: "gte",
        value: { __state: "filter_order_date.0" },
      },
      {
        field: "order_date",
        op: "lte",
        value: { __state: "filter_order_date.1" },
      },
    ]);

    const all = filterRow(allControlsSpec("all"), [tableRows]);
    expect(
      all.filters.filter_region.events.onChange[0].params.payload.filters,
    ).toContainEqual({
      field: "region",
      op: "all",
      value: { __state: "filter_region" },
    });

    // `match: any` is the default a bare multiselect normalizes to.
    const any = filterRow(allControlsSpec("any"), [tableRows]);
    expect(
      any.filters.filter_region.events.onChange[0].params.payload.filters,
    ).toContainEqual({
      field: "region",
      op: "in",
      value: { __state: "filter_region" },
    });
  });

  // company_id carries no catalog `values`, so this filter's only options
  // source is its query — which is what makes the degradation cases below
  // reach the Alert rather than falling back to the catalog.
  const companySpec = (field = "company_id") => ({
    title: "T",
    sections: [
      {
        type: "filter",
        control: "multiselect",
        field,
        label: "Companies",
        optionsQuery: {
          collection: "demo_companies",
          pipeline: [{ $project: { _id: 1, name: 1 } }],
          valueKey: "_id",
          labelKey: "name",
        },
      },
      {
        type: "table",
        label: "Orders",
        query: ordersByRegion,
        columns: [{ key: "region" }],
        filterBy: [field],
      },
    ],
  });

  test("optionsQuery rows become { label, value } options in row order", () => {
    const { filters } = filterRow(companySpec(), [
      [
        { _id: "c2", name: "Beta" },
        { _id: "c1", name: "Alpha" },
      ],
      tableRows,
    ]);
    expect(filters.filter_company_id.properties.options).toEqual([
      { label: "Beta", value: "c2" },
      { label: "Alpha", value: "c1" },
    ]);
    expect(filters.filter_company_id.properties.title).toBe("Companies");
  });

  // A dropdown silently missing the company someone is looking for is
  // indistinguishable from that company not existing.
  test("rows over the cap are sliced and the title says so", () => {
    const rows = Array.from(
      { length: MAX_QUERY_FILTER_OPTIONS + 5 },
      (_, i) => ({ _id: `c${i}`, name: `Company ${i}` }),
    );
    const capped = filterRow(companySpec(), [rows, tableRows]);
    expect(capped.filters.filter_company_id.properties.options).toHaveLength(
      MAX_QUERY_FILTER_OPTIONS,
    );
    expect(capped.filters.filter_company_id.properties.title).toBe(
      `Companies — first ${MAX_QUERY_FILTER_OPTIONS}`,
    );

    const short = filterRow(companySpec(), [
      rows.slice(0, MAX_QUERY_FILTER_OPTIONS),
      tableRows,
    ]);
    expect(short.filters.filter_company_id.properties.title).toBe("Companies");
  });

  // Four ways an options list can be unusable, four descriptions: one message
  // covering all of them would misdescribe three.
  test.each([
    ["the query failed or was denied", null, /failed to load/],
    [
      // An ObjectId reaches the browser as a bare hex string and then never
      // equals the ObjectId in the field: the filter would show the right
      // names and match nothing, reporting no error at all. Failing the
      // contract turns that silence into an Alert naming $toString.
      "valueKey holds a value that cannot survive the round-trip",
      [{ _id: { _bsontype: "ObjectId" }, name: "Alpha" }],
      /must be a string or number to match on.*\$toString/s,
    ],
    [
      "valueKey names a column no row carries",
      [{ label: "Alpha", name: "Alpha" }],
      /column "_id" is not present/,
    ],
    ["the query returned no rows", [], /No options available/],
  ])("a filter whose options %s degrades to an Alert", (_case, rows, match) => {
    const { byId, filters } = filterRow(companySpec(), [rows, tableRows]);
    // The Alert takes the control's place in the filter row, keyed by section id.
    expect(filters.s0.type).toBe("Alert");
    expect(filters.s0.properties.message).toBe("Companies");
    expect(filters.s0.properties.description).toMatch(match);
    expect(filters.filter_company_id).toBeUndefined();
    // The bound section still renders its resolve-time rows.
    expect(byId.s1.type).toBe("AgGridBalham");
  });

  test("a failed optionsQuery falls back to the field's catalog values", () => {
    const spec = {
      title: "T",
      sections: [
        {
          type: "filter",
          control: "select",
          field: "status",
          label: "Status",
          optionsQuery: {
            collection: "demo_orders",
            pipeline: [
              { $group: { _id: "$status", name: { $first: "$status" } } },
            ],
            valueKey: "_id",
            labelKey: "name",
          },
        },
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: ["status"],
        },
      ],
    };
    const { filters } = filterRow(spec, [null, tableRows]);
    expect(filters.filter_status.type).toBe("Selector");
    expect(filters.filter_status.properties.options).toEqual([
      "pending",
      "paid",
      "shipped",
      "cancelled",
    ]);
  });

  // Nested array foreign keys are the case query-sourced options exist for, and
  // the control's block id doubles as its page-state key — so a dotted field
  // yields a nested state path that the triple must read back unchanged.
  test("a dotted filter field yields a nested state path, read back by the triple", () => {
    const field = "global_attributes.company_ids";
    const { filters } = filterRow(companySpec(field), [
      [{ _id: "c1", name: "Alpha" }],
      tableRows,
    ]);
    const control = filters[`filter_${field}`];
    expect(control.type).toBe("MultipleSelector");
    expect(control.events.onChange[0].params.payload.filters).toEqual([
      { field, op: "in", value: { __state: `filter_${field}` } },
    ]);
  });

  // A catalog enum can outgrow its cap too, and the reason to say so doesn't
  // depend on where the list came from.
  test("catalog-sourced options are capped, and the title says so at their own cap", () => {
    const values = Array.from(
      { length: MAX_FILTER_OPTIONS + 5 },
      (_, i) => `v${i}`,
    );
    const catalog = {
      demo_orders: {
        description: "Orders",
        fields: { status: { type: "string", values } },
      },
    };
    const spec = {
      title: "T",
      sections: [
        { type: "filter", control: "select", field: "status", label: "Status" },
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: ["status"],
        },
      ],
    };
    const row = compileReport({
      spec,
      results: [tableRows],
      catalog,
      roles,
      endpointId,
    }).find((b) => b.id === "report_filters");
    const control = row.blocks[0];
    expect(control.properties.options).toHaveLength(MAX_FILTER_OPTIONS);
    expect(control.properties.title).toBe(
      `Status — first ${MAX_FILTER_OPTIONS}`,
    );
  });

  // A field's enum `values` are contents of the collection that declares them.
  // Serving them to a viewer who may not query that collection would route
  // around the gate validatePipeline enforces on the pipeline — and the path
  // that matters most is this one: the optionsQuery was DENIED, and the catalog
  // is the fallback. Being refused the query must not hand over the values.
  test("a role-gated collection's enum values are not served as fallback options", () => {
    const gated = {
      demo_secrets: {
        roles: ["admin"],
        description: "Restricted",
        fields: { status: { type: "string", values: ["alpha", "beta"] } },
      },
    };
    const spec = {
      title: "T",
      sections: [
        {
          type: "filter",
          control: "select",
          field: "status",
          label: "Status",
          optionsQuery: {
            collection: "demo_secrets",
            pipeline: [{ $group: { _id: "$status" } }],
            valueKey: "_id",
            labelKey: "_id",
          },
        },
        {
          type: "table",
          label: "Rows",
          query: { collection: "demo_secrets", pipeline: [{ $limit: 1 }] },
          columns: [{ key: "status" }],
          filterBy: ["status"],
        },
      ],
    };
    // The denial arrives as a null results entry — the resolver's :try caught it.
    const compile = (viewerRoles) =>
      compileReport({
        spec,
        results: [null, tableRows],
        catalog: gated,
        roles: viewerRoles,
        endpointId,
      }).find((b) => b.id === "report_filters").blocks[0];

    const denied = compile(["analyst"]);
    expect(denied.type).toBe("Alert");
    expect(denied.properties.description).toMatch(/failed to load/);

    // An admin, who may query it, still gets the fallback.
    const allowed = compile(["admin"]);
    expect(allowed.type).toBe("Selector");
    expect(allowed.properties.options).toEqual(["alpha", "beta"]);
  });
});
