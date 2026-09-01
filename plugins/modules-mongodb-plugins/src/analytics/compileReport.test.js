import compileReport, {
  assignReportColors,
  chartWidthForSpan,
  needsWidth,
} from "./compileReport.js";
import { PALETTE } from "./buildFlintOption.js";
import querySections from "./querySections.js";
import testCatalog from "./testDatasets.js";
import {
  MAX_FILTER_OPTIONS,
  MAX_QUERY_FILTER_OPTIONS,
  PIPELINE_RESULT_CAP,
} from "./constants.js";

// A kpi/chart/table section's own block sits inside its `${id}_card` wrapper, so
// an id lookup has to descend into it. Most assertions here are about the block
// itself and not where in the tree it sits; the wrappers are asserted on their
// own, and anything about POSITION keeps working on the top-level list, where a
// card occupies its section's place.
const flatten = (blocks) =>
  (blocks ?? []).flatMap((block) => [block, ...flatten(block.blocks)]);
const byIdOf = (blocks) =>
  Object.fromEntries(flatten(blocks).map((block) => [block.id, block]));

const roles = ["analyst"];
const endpointId = "ai-reporting/query-data";
const chartEndpointId = "ai-reporting/chart-data";

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
    chartEndpointId,
  });
  const byId = byIdOf(blocks);
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
    chartEndpointId,
  });
  const byId = byIdOf(blocks);

  expect(byId.report_title.properties.content).toBe("Q2 Revenue by Region");

  // Every data section is a Card of its own, carrying the section's span, with
  // the section's block inside it under the unchanged section id. A kpi has no
  // head row, so its card is the whole section — and this one is a tile row of
  // ONE (the chart below it breaks the run), so the row it fills is the column.
  const kpiCard = blocks.find((b) => b.id === "s0_card");
  expect(kpiCard.type).toBe("Card");
  expect(kpiCard.layout).toEqual({ span: 24 });
  expect(kpiCard.blocks).toEqual([byId.s0]);
  // The span lives on the card alone — a span on both would be two sources for
  // one number, and the next layout change would only move one of them.
  expect(byId.s0.layout).toBeUndefined();
  expect(blocks.find((b) => b.id === "s0")).toBeUndefined();

  // KPI: unfiltered → value inlined. ZAR currency contract → 2 decimals and a
  // rand prefix, separators from the en-ZA locale.
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s0.properties.value).toBe(4200);
  expect(byId.s0.properties.precision).toBe(2);
  expect(byId.s0.properties.prefix).toMatch(/^R/);

  // Chart: unfiltered, so the assembled option and the canvas height Flint sized
  // for it are both literals. The rows are inlined into the series and the
  // category axis rather than carried as a swappable dataset, and nothing
  // private survives to be persisted or re-read as an operator.
  expect(byId.s1.type).toBe("EChart");
  expect(byId.s1.properties.title).toBeUndefined();
  // No theme param passed in — the key must be absent, not undefined-valued,
  // so a caller that predates theming sees exactly the same shape it always did.
  expect("theme" in byId.s1.properties).toBe(false);
  expect(byId.s1_heading.properties.content).toBe("Revenue by Region");
  expect(typeof byId.s1.properties.height).toBe("number");
  expect(byId.s1.properties.option.dataset).toBeUndefined();
  expect(byId.s1.properties.option.xAxis.data).toEqual(["EU", "US"]);
  expect(byId.s1.properties.option.series[0].data).toEqual([2500, 1700]);
  expect(
    Object.keys(byId.s1.properties.option).filter((key) => key.startsWith("_")),
  ).toEqual([]);

  // Table bound to the status filter: deferred __if_none of __state and snapshot.
  expect(byId.s3.type).toBe("AgGridBalham");
  expect(byId.s3.properties.rowData).toEqual({
    __if_none: [{ __state: "sections.s3.rows" }, results[2]],
  });
  expect(byId.s3.properties.defaultColDef).toEqual({
    sortable: true,
    resizable: true,
    flex: 1,
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

  // Filter control: rendered inline directly above its one bound section (s3,
  // the table), options from catalog values. No report_filters Box exists, and
  // a single-bound filter has no scope to state — its position says it all — so
  // the group closes on its Reset alone, between the control and the section.
  expect(byId.report_filters).toBeUndefined();
  const idx = (id) => blocks.findIndex((b) => b.id === id);
  expect(byId.filters_s3_scope).toBeUndefined();
  expect(idx("filter_status")).toBe(idx("filters_s3_reset") - 1);
  expect(idx("filters_s3_reset")).toBe(idx("s3_heading") - 1);
  const filter = byId.filter_status;
  expect(filter.type).toBe("Selector");
  expect(filter.layout).toEqual({ span: 24 });
  expect(filter.properties.title).toBe("Status");
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

// The card is the section's container; the section's HEAD row is not in it. A
// heading inside the card would be a card title by another name, and the corpus
// of hand-built reports puts the heading above the panel it names.
test("a section's card holds its block alone, with the head row outside it", () => {
  const blocks = compileReport({
    spec,
    results,
    catalog: testCatalog,
    roles,
    endpointId,
    chartEndpointId,
  });
  const byId = byIdOf(blocks);
  const topIds = blocks.map((b) => b.id);

  for (const [id, span, type] of [["s1", 24, "EChart"]]) {
    const card = byId[`${id}_card`];
    expect(card.type).toBe("Card");
    expect(card.layout).toEqual({ span });
    expect(card.blocks).toEqual([byId[id]]);
    expect(byId[id].type).toBe(type);
    // heading, ⤓, then the card — the head row leads, outside the panel.
    expect(topIds.indexOf(`${id}_card`)).toBe(
      topIds.indexOf(`${id}_download`) + 1,
    );
  }

  // A table takes no card — the grid is its own panel — so the grid itself sits
  // where the card would have, directly under the head row.
  expect(byId.s3_card).toBeUndefined();
  expect(byId.s3.type).toBe("AgGridBalham");
  expect(byId.s3.layout).toEqual({ span: 24 });
  expect(topIds.indexOf("s3")).toBe(topIds.indexOf("s3_download") + 1);

  // The download run gets its own titled Downloads card rather than the
  // section's `${id}_card` convention (see "a run of downloads is one card"
  // below), so it is that wrapper, not the bare button, that sits here.
  expect(byId.s4_card).toBeUndefined();
  expect(byId.s4_downloads.type).toBe("Card");
  expect(topIds).toContain("s4_downloads");
  expect(topIds).not.toContain("s4");

  // Markdown is the prose that narrates BETWEEN the panels, so it is not one
  // itself — a card around it would read as another result.
  const prose = compileReport({
    spec: {
      title: "T",
      sections: [{ type: "markdown", content: "## Notes" }],
    },
    results: [],
    catalog: testCatalog,
    roles,
    endpointId,
    chartEndpointId,
  });
  expect(byIdOf(prose).s0.type).toBe("Markdown");
  expect(byIdOf(prose).s0_card).toBeUndefined();
});

// A failure is not a panel of content: the Alert and the recoveries stay flat
// siblings, so a broken section reads as an interruption of the stack of cards
// rather than as another card in it.
test("a broken section gets no card", () => {
  const blocks = compileReport({
    spec,
    results: [results[0], undefined, results[2]],
    catalog: testCatalog,
    roles,
    endpointId,
    chartEndpointId,
    is_owner: true,
    conversation_id: "conv-1",
  });
  const byId = byIdOf(blocks);
  expect(byId.s1.type).toBe("Alert");
  expect(byId.s1_card).toBeUndefined();
  expect(blocks.map((b) => b.id)).toEqual(
    expect.arrayContaining(["s1", "s1_fix_in_chat", "s1_drop"]),
  );
});

test("an optional theme is set verbatim on every chart section's properties.theme", () => {
  const theme = { backgroundColor: "transparent" };
  const blocks = compileReport({
    spec,
    results,
    catalog: testCatalog,
    roles,
    endpointId,
    chartEndpointId,
    theme,
  });
  const byId = byIdOf(blocks);
  expect(byId.s1.properties.theme).toBe(theme);
  // Non-chart sections carry no theme key — it is a chart-only property.
  expect("theme" in byId.s0.properties).toBe(false);
  expect("theme" in byId.s3.properties).toBe(false);
});

test("failed sections render as Alert cards while the rest render", () => {
  const sparseResults = [results[0], undefined, results[2]];
  const blocks = compileReport({
    spec,
    results: sparseResults,
    catalog: testCatalog,
    roles,
    endpointId,
    chartEndpointId,
  });
  const byId = byIdOf(blocks);
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
    chartEndpointId,
  });
  const byId = byIdOf(blocks);
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
    chartEndpointId,
  });
  const byId = byIdOf(blocks);
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
    chartEndpointId,
  });
  const byId = byIdOf(blocks);
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
    chartEndpointId,
  });
  const byId = byIdOf(blocks);
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
    chartEndpointId,
  });
  expect(JSON.stringify(blocks)).not.toContain("_secret");
});

test("requires the query-data endpointId", () => {
  expect(() =>
    compileReport({ spec, results, catalog: testCatalog, roles }),
  ).toThrow(/endpointId \(the query-data endpoint\) is required/);
});

test("requires the chart-data endpointId", () => {
  expect(() =>
    compileReport({ spec, results, catalog: testCatalog, roles, endpointId }),
  ).toThrow(/chartEndpointId \(the chart-data endpoint\) is required/);
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
    chartEndpointId,
  });
  const kpi = flatten(blocks).find((b) => b.id === "s1");
  expect(kpi.properties.value).toEqual({
    __if_none: [{ __state: "sections.s1.rows.0.total" }, 10],
  });
});

// A chart's rows are inlined into its option and its canvas is sized to the
// labels, so a filtered chart cannot have data swapped into it client-side: it
// binds the whole re-assembled option and its height, and re-queries chart-data
// for them. A table on the SAME filter is unaffected — it still takes rows from
// query-data.
describe("a filter driving a chart and a table", () => {
  const chartAndTableSpec = {
    title: "T",
    sections: [
      { type: "filter", control: "select", field: "status", label: "Status" },
      {
        type: "chart",
        chart: "bar",
        label: "Revenue by Region",
        query: ordersByRegion,
        x: "region",
        y: ["total"],
        filterBy: ["status"],
      },
      {
        type: "table",
        label: "Orders",
        query: ordersByRegion,
        columns: [{ key: "region" }, { key: "total" }],
        filterBy: ["status"],
      },
    ],
  };
  const chartRows = [
    { region: "EU", total: 2500 },
    { region: "US", total: 1700 },
  ];
  const tableRows = [{ region: "EU", total: 2500 }];
  const blocks = compileReport({
    spec: chartAndTableSpec,
    results: [chartRows, tableRows],
    catalog: testCatalog,
    roles,
    endpointId,
    chartEndpointId,
  });
  const byId = byIdOf(blocks);
  const onChange = byId.filter_status.events.onChange;

  test("the chart binds option and height, each falling back to the resolve-time value", () => {
    const chart = byId.s1;
    expect(chart.type).toBe("EChart");
    expect(chart.properties.option.__if_none[0]).toEqual({
      __state: "sections.s1.option",
    });
    expect(chart.properties.option.__if_none[1].series[0].data).toEqual([
      2500, 1700,
    ]);
    expect(chart.properties.height.__if_none[0]).toEqual({
      __state: "sections.s1.height",
    });
    expect(typeof chart.properties.height.__if_none[1]).toBe("number");
  });

  test("the chart re-queries chart-data with its whole presentation contract", () => {
    const [call, set] = onChange;
    expect(call.params.endpointId).toBe(chartEndpointId);
    expect(call.params.payload).toEqual({
      chart: "bar",
      title: "Revenue by Region",
      x: "region",
      y: ["total"],
      // Assembly decides legend orientation and label rotation from the width,
      // so the re-query carries the width of the span the section is actually
      // laid out at — otherwise a filtered chart re-renders for another canvas
      // than the one the compiled option was built for.
      width: chartWidthForSpan(byId.s1_card.layout.span),
      // Empty here: a single-series chart is the one kind that takes no
      // report-scoped hue (its series name is a measure, not an entity), and
      // this report holds nothing else that would claim one.
      colors: {},
      query: ordersByRegion,
      filters: [
        { field: "status", op: "eq", value: { __state: "filter_status" } },
      ],
    });
    expect(set.params).toEqual({
      "sections.s1.option": { __api: `${chartEndpointId}.response.option` },
      "sections.s1.height": { __api: `${chartEndpointId}.response.height` },
    });
  });

  test("a stacked chart section assembles stacked and carries stacked into its re-query", () => {
    const stackedBlocks = compileReport({
      spec: {
        title: "T",
        sections: [
          chartAndTableSpec.sections[0],
          {
            ...chartAndTableSpec.sections[1],
            y: ["total", "tax"],
            stacked: true,
          },
        ],
      },
      results: [
        [
          { region: "EU", total: 2500, tax: 500 },
          { region: "US", total: 1700, tax: 300 },
        ],
      ],
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
    });
    const stackedById = byIdOf(stackedBlocks);
    const option = stackedById.s1.properties.option.__if_none[1];
    const stacks = new Set(option.series.map((series) => series.stack));
    expect(stacks.size).toBe(1);
    expect([...stacks][0]).toBeTruthy();
    const [call] = stackedById.filter_status.events.onChange;
    expect(call.params.payload.stacked).toBe(true);
  });

  test("the table on the same filter still re-queries query-data for rows", () => {
    const [call, set] = onChange.slice(2);
    expect(call.params.endpointId).toBe(endpointId);
    expect(call.params.payload).toEqual({
      query: ordersByRegion,
      filters: [
        { field: "status", op: "eq", value: { __state: "filter_status" } },
      ],
    });
    expect(set.params).toEqual({
      "sections.s2.rows": { __api: `${endpointId}.response` },
    });
    expect(byId.s2.properties.rowData).toEqual({
      __if_none: [{ __state: "sections.s2.rows" }, tableRows],
    });
  });
});

// Hues are report-scoped, not chart-scoped: the same entity has to come out the
// same colour in every section that names it, so a status is one colour across a
// pie and the stacked bar beside it. The union of entity names is a multi-series
// chart's series names plus a pie's slice names, assigned in first-appearance
// order.
describe("report-scoped colour identity", () => {
  const chartSection = (label, x, y, chart = "bar") => ({
    type: "chart",
    chart,
    label,
    query: ordersByRegion,
    x,
    y,
  });
  // Unfiltered sections bind the compiled option directly, so the hues are
  // readable straight off the block.
  const compile = (sections, results) => {
    const blocks = compileReport({
      spec: { title: "T", sections },
      results,
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
    });
    return byIdOf(blocks);
  };
  const seriesHues = (block) =>
    Object.fromEntries(
      block.properties.option.series.map((series) => [
        series.name,
        series.itemStyle.color,
      ]),
    );
  // A pie carries no per-series colour: each slice reads option.color by index.
  const sliceHues = (block) => {
    const { option } = block.properties;
    return Object.fromEntries(
      option.series[0].data.map((datum, index) => [
        datum.name,
        option.color[index],
      ]),
    );
  };

  const statusRows = [
    { region: "EU", done: 4, cancelled: 3, pending: 2 },
    { region: "US", done: 6, cancelled: 1, pending: 5 },
  ];

  test("a series name in two sections gets one hue in both", () => {
    const byId = compile(
      [
        chartSection("A", "region", ["done", "cancelled"]),
        chartSection("B", "region", ["cancelled", "pending"], "line"),
      ],
      [statusRows, statusRows],
    );
    expect(seriesHues(byId.s0)).toEqual({
      Done: PALETTE[0],
      Cancelled: PALETTE[1],
    });
    // Cancelled keeps slot 2 rather than taking slot 1 as the first series here.
    expect(seriesHues(byId.s1)).toEqual({
      Cancelled: PALETTE[1],
      Pending: PALETTE[2],
    });
  });

  test("a pie slice shares the hue of the series of the same name", () => {
    const byId = compile(
      [
        chartSection("A", "region", ["done", "cancelled"]),
        chartSection("B", "status", ["count"], "pie"),
      ],
      [
        statusRows,
        [
          { status: "Cancelled", count: 4 },
          { status: "Done", count: 9 },
        ],
      ],
    );
    const bars = seriesHues(byId.s0);
    const slices = sliceHues(byId.s1);
    expect(slices.Done).toBe(bars.Done);
    expect(slices.Cancelled).toBe(bars.Cancelled);
    expect(slices.Done).not.toBe(slices.Cancelled);
  });

  test("a single-series chart takes the first slot and spends none", () => {
    const byId = compile(
      [
        chartSection("A", "region", ["done", "cancelled"]),
        chartSection("B", "region", ["total"]),
        chartSection("C", "region", ["pending", "closed"], "line"),
      ],
      [
        statusRows,
        [{ region: "EU", total: 2500 }],
        statusRows.map((row) => ({ ...row, closed: row.done })),
      ],
    );
    expect(byId.s1.properties.option.series[0].itemStyle.color).toBe(
      PALETTE[0],
    );
    // Slots 3 and 4, not 4 and 5 — the measure name in between claimed none.
    expect(seriesHues(byId.s2)).toEqual({
      Pending: PALETTE[2],
      Closed: PALETTE[3],
    });
  });

  test("names past the eighth are coloured per chart, uniquely within it", () => {
    const measures = Array.from({ length: 10 }, (_, index) => `m${index + 1}`);
    const rows = [
      Object.fromEntries([
        ["region", "EU"],
        ...measures.map((measure, index) => [measure, index + 1]),
      ]),
    ];
    const pairs = [0, 2, 4, 6].map((start) =>
      chartSection(`P${start}`, "region", measures.slice(start, start + 2)),
    );
    // Eight names fill the map; this chart re-uses one of them and adds the
    // ninth and tenth, which the map cannot hold.
    const overflow = chartSection("Overflow", "region", ["m1", "m9", "m10"]);
    const sections = [...pairs, overflow];
    const byId = compile(
      sections,
      sections.map(() => rows),
    );
    const assigned = assignReportColors({
      sections: sections.map((section, index) => ({
        ...section,
        id: `s${index}`,
      })),
      results: sections.map(() => rows),
    });
    expect(Object.keys(assigned)).toHaveLength(8);
    expect(assigned).not.toHaveProperty("M9");
    expect(assigned).not.toHaveProperty("M10");

    const hues = seriesHues(byId.s4);
    // M1 keeps its report-wide hue; the two overflow names take slots this
    // chart has not spent, so nothing in it is drawn twice.
    expect(hues.M1).toBe(assigned.M1);
    expect(new Set(Object.values(hues)).size).toBe(3);
    for (const hue of Object.values(hues)) {
      expect(PALETTE).toContain(hue);
    }
  });

  test("a filtered chart's re-query carries the map", () => {
    const byId = compile(
      [
        { type: "filter", control: "select", field: "status", label: "Status" },
        {
          ...chartSection("A", "region", ["done", "cancelled"]),
          filterBy: ["status"],
        },
      ],
      // A filter with no optionsQuery runs nothing, so the results align with
      // the chart alone.
      [statusRows],
    );
    const [call] = byId.filter_status.events.onChange;
    // Decided over the unfiltered rows, so a filter that drops a series cannot
    // repaint the ones that survive.
    expect(call.params.payload.colors).toEqual({
      Done: PALETTE[0],
      Cancelled: PALETTE[1],
    });
  });

  test("a section with no rows claims no slot", () => {
    const byId = compile(
      [
        chartSection("Broken", "region", ["done", "cancelled"]),
        chartSection("B", "region", ["pending", "closed"], "line"),
      ],
      [null, statusRows.map((row) => ({ ...row, closed: row.done }))],
    );
    // The first section renders as an Alert, so its names are not knowable (a
    // pie's would not be at all) and the hues start at slot 1 on the survivor.
    expect(seriesHues(byId.s1)).toEqual({
      Pending: PALETTE[0],
      Closed: PALETTE[1],
    });
  });
});

// Assembling a chart reads the rows, and unlike a pure mapping it can reject
// what it is given. That must degrade the one section, not the report — the
// resolver calls compileReport with no :try around it.
test("a chart whose assembly throws renders an Alert while its siblings compile", () => {
  jest.resetModules();
  // Only the assembler itself is faked — validateChartSpec imports the
  // module's named exports (humanize and the fold names), and those must stay
  // real for validation to reach the assembly step at all.
  jest.doMock("./buildFlintOption.js", () => ({
    __esModule: true,
    ...jest.requireActual("./buildFlintOption.js"),
    default: () => {
      throw new Error("Flint rejected this chart.");
    },
  }));
  // require, not import: the mock is registered at call time, so the module
  // under test must be loaded after it.
  const compileWithFailingAssembly = require("./compileReport.js").default;
  const blocks = compileWithFailingAssembly({
    spec,
    results,
    catalog: testCatalog,
    roles,
    endpointId,
    chartEndpointId,
  });
  jest.dontMock("./buildFlintOption.js");
  jest.resetModules();

  const byId = byIdOf(blocks);
  expect(byId.s1.type).toBe("Alert");
  expect(byId.s1.properties.message).toBe("Revenue by Region");
  expect(byId.s1.properties.description).toMatch(/Flint rejected this chart/);
  expect(byId.s0.type).toBe("Statistic");
  expect(byId.s3.type).toBe("AgGridBalham");
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
    chartEndpointId,
  });
  const byId = byIdOf(blocks);
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
    chartEndpointId,
  });
  const section = flatten(blocks).find((b) => b.id === "s0");
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
    chartEndpointId,
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
    chartEndpointId,
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
      chartEndpointId,
    });
    return Object.fromEntries(
      flatten(blocks)
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
      chartEndpointId,
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
      chartEndpointId,
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
      chartEndpointId,
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
      chartEndpointId,
    });
    const byId = byIdOf(blocks);

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

  // The ⤓ shares the heading's row instead of taking one of its own, and is the
  // icon alone. `hideTitle` is load-bearing: the Button block renders its blockId
  // as the label when `title` is absent, so the title stays and is suppressed.
  test("the download sits on the heading's row as an icon", () => {
    const blocks = compileReport({
      spec,
      results,
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
    });
    const byId = byIdOf(blocks);

    for (const id of ["s1", "s3"]) {
      expect(byId[`${id}_heading`].layout.span).toBe(20);
      expect(byId[`${id}_download`].layout.span).toBe(4);
      expect(byId[`${id}_download`].properties.hideTitle).toBe(true);
      expect(byId[`${id}_download`].properties.title).toBe("Export CSV");
      expect(byId[`${id}_download`].style.marginLeft).toBe("auto");
    }
    // Adjacent, in that order — the two are one head row.
    const ids = blocks.map((b) => b.id);
    expect(ids.indexOf("s3_download")).toBe(ids.indexOf("s3_heading") + 1);
  });

  // A section's blocks sit side by side in one wrapping flex area, so a "row" is
  // only a row by virtue of its spans — a top margin on one block alone would
  // drop its row-mates out of line with it. The gap therefore leads the section
  // GROUP, a whole wrap line at a time: the head row when nothing precedes it,
  // the filter controls when they do. A full-width card is its own wrap line
  // behind that head row, so it must not take the gap as well.
  test("the top margin leads a section's group, a whole row at a time", () => {
    const blocks = compileReport({
      spec,
      results,
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
    });
    const byId = byIdOf(blocks);

    // s1 has no filter above it, so its own head row leads the group and both
    // blocks carry the gap.
    const gap = byId.s1_heading.style.marginTop;
    expect(gap).toBeGreaterThan(0);
    expect(byId.s1_download.style.marginTop).toBe(gap);
    // The card fills the line under the head row, so the gap is already spent.
    expect(byId.s1_card.style?.marginTop).toBeUndefined();
    // A kpi has no head row, so its card leads the group and takes the gap —
    // and the Statistic inside it must not, or it would push off its own card.
    expect(byId.s0_card.style.marginTop).toBe(gap);
    expect(byId.s0.style?.marginTop).toBeUndefined();
    // The margin rides alongside the right-alignment style, not over it.
    expect(byId.s1_download.style.marginLeft).toBe("auto");

    // s3 is anchored by the status filter, so the CONTROL leads the group and
    // the head row must not also carry the gap. Stamped on the heading instead,
    // the filter would sit one small row gap under the previous section and a
    // full SECTION_TOP_GAP above the section it actually drives — reading as
    // though it filtered the one before it.
    expect(byId.filter_status.style.marginTop).toBe(gap);
    expect(byId.s3_heading.style?.marginTop).toBeUndefined();
    expect(byId.s3_download.style.marginTop).toBeUndefined();
    // s3 is a table, so the grid itself is the line under the head row.
    expect(byId.s3.style?.marginTop).toBeUndefined();
    expect(byId.s3_download.style.marginLeft).toBe("auto");
  });

  // A table sized to its rows rather than to the block's 500px default, which
  // left a five-row table sitting in 350px of white. The ceiling keeps a table
  // near the pipeline's 1000-row cap scrolling and virtualised.
  test("a table's height follows its row count, floored and capped", () => {
    const tableOnly = {
      title: "T",
      sections: [
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region", label: "Region" }],
        },
      ],
    };
    const height = (rows) => {
      const blocks = compileReport({
        spec: tableOnly,
        results: [rows],
        catalog: testCatalog,
        roles,
        endpointId,
        chartEndpointId,
      });
      return flatten(blocks).find((b) => b.type === "AgGridBalham").properties
        .height;
    };

    expect(height([])).toBe(120);
    expect(height(Array(5).fill({ region: "EU", total: 1 }))).toBe(174);
    expect(height(Array(1000).fill({ region: "EU", total: 1 }))).toBe(500);
  });

  test("a KPI-only report emits no CSV download at all", () => {
    const blocks = compileReport({
      spec: kpiOnlySpec,
      results: [[{ total: 10 }]],
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
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

  // Controls are now flat top-level blocks interleaved above their sections, so
  // `filters` and `byId` are the same flat map — a control by `filter_<field>`,
  // an options-failure Alert by the filter section's id.
  const filterRow = (spec, results) => {
    const blocks = compileReport({
      spec,
      results,
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
    });
    const byId = byIdOf(blocks);
    return { blocks, byId, filters: byId };
  };

  const tableRows = [{ region: "EU", total: 1 }];

  test("each control emits its own block type, all inline above their section", () => {
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
    // The Alert takes the control's place above the bound section, keyed by the
    // filter section's id.
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
    const control = compileReport({
      spec,
      results: [tableRows],
      catalog,
      roles,
      endpointId,
      chartEndpointId,
    }).find((b) => b.id === "filter_status");
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
    // Denied → an Alert keyed by the filter section id (s0); allowed → the
    // Selector keyed by filter_status.
    const compile = (viewerRoles) => {
      const byId = byIdOf(
        compileReport({
          spec,
          results: [null, tableRows],
          catalog: gated,
          roles: viewerRoles,
          endpointId,
          chartEndpointId,
        }),
      );
      return byId.filter_status ?? byId.s0;
    };

    const denied = compile(["analyst"]);
    expect(denied.type).toBe("Alert");
    expect(denied.properties.description).toMatch(/failed to load/);

    // An admin, who may query it, still gets the fallback.
    const allowed = compile(["admin"]);
    expect(allowed.type).toBe("Selector");
    expect(allowed.properties.options).toEqual(["alpha", "beta"]);
  });
});

// A filter's POSITION answers "what does this move": each control renders once,
// directly above the first section it drives, never pooled into a top row.
describe("filter placement", () => {
  const tableRows = [{ region: "EU", total: 1 }];
  const idxIn = (blocks) => (id) => blocks.findIndex((b) => b.id === id);

  test("two independent filter groups each render above their own group's first section", () => {
    const spec = {
      title: "T",
      sections: [
        {
          type: "kpi",
          label: "Revenue",
          query: orderTotal,
          valueKey: "total",
          filterBy: ["status"],
        },
        { type: "filter", control: "select", field: "status", label: "Status" },
        { type: "filter", control: "select", field: "region", label: "Region" },
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: ["region"],
        },
      ],
    };
    const blocks = compileReport({
      spec,
      results: [[{ total: 5 }], tableRows],
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
    });
    const byId = byIdOf(blocks);
    const idx = idxIn(blocks);
    // status drives the kpi (s0); region drives the table (s3). Each sits
    // directly above its own group, neither divorced at the top, and each group
    // closes on its own Reset before the section it leads.
    expect(byId.report_filters).toBeUndefined();
    expect(idx("filter_status")).toBe(idx("filters_s0_reset") - 1);
    expect(idx("filters_s0_reset")).toBe(idx("s0_card") - 1);
    expect(idx("filter_region")).toBe(idx("filters_s3_reset") - 1);
    expect(idx("filters_s3_reset")).toBe(idx("s3_heading") - 1);
    expect(idx("filter_status")).toBeGreaterThan(idx("report_title"));
    // Single-bound: position carries it, so no scope note in either place.
    expect(byId.filter_status.properties.title).toBe("Status");
    expect(byId.filter_region.properties.title).toBe("Region");
    expect(byId.filter_status.properties.label).toBeUndefined();
    expect(byId.filter_region.properties.label).toBeUndefined();
    // Reset is per group too: a group clears its own filter and the sections it
    // drives, and nothing of the group beside it.
    expect(byId.filters_s0_reset.events.onClick[0].params).toEqual({
      filter_status: null,
      "sections.s0.rows": null,
    });
    expect(byId.filters_s3_reset.events.onClick[0].params).toEqual({
      filter_region: null,
      "sections.s3.rows": null,
    });
  });

  test("a filter bound to more than one section renders once above the first, its scope stated under the group", () => {
    const spec = {
      title: "T",
      sections: [
        { type: "filter", control: "select", field: "status", label: "Status" },
        {
          type: "kpi",
          label: "Revenue",
          query: orderTotal,
          valueKey: "total",
          filterBy: ["status"],
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
    const blocks = compileReport({
      spec,
      results: [[{ total: 5 }], tableRows],
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
    });
    const byId = byIdOf(blocks);
    const idx = idxIn(blocks);
    // ids: s0 filter, s1 kpi, s2 table. Bound to both — emitted exactly once,
    // above the first subscriber (the kpi), with the group's closing line
    // between it and that section.
    expect(blocks.filter((b) => b.id === "filter_status")).toHaveLength(1);
    expect(idx("filter_status")).toBe(idx("filters_s1_scope") - 1);
    expect(idx("filters_s1_reset")).toBe(idx("s1_card") - 1);
    // The scope is stated once under the group rather than on the control, in a
    // muted line of its own. The title stays the plain label either way, so a
    // filter naming several sections cannot wrap its title and push its input
    // out of line with the control beside it. A group of one states its scope
    // the way a group of four does: one place to read it at every group size.
    expect(byId.filter_status.properties.title).toBe("Status");
    expect(byId.filter_status.properties.label).toBeUndefined();
    expect(byId.filters_s1_scope).toMatchObject({
      type: "Paragraph",
      properties: { content: "Also filters: Orders", type: "secondary" },
    });
  });

  // Single-bound: position carries the scope, so no note at all — an empty extra
  // would still reserve the line under the control.
  test("a filter bound to one section carries no scope note", () => {
    const spec = {
      title: "T",
      sections: [
        { type: "filter", control: "select", field: "status", label: "Status" },
        {
          type: "kpi",
          label: "Revenue",
          query: orderTotal,
          valueKey: "total",
          filterBy: ["status"],
        },
      ],
    };
    const blocks = compileReport({
      spec,
      results: [[{ total: 5 }]],
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
    });
    const control = blocks.find((b) => b.id === "filter_status");
    expect(control.properties.title).toBe("Status");
    expect(control.properties.label).toBeUndefined();
  });

  // The truncation note stays on the control's title while the scope goes to the
  // group's line: one says what this control offers, the other what the group
  // moves. Two different subjects, so they cannot share a place.
  test("a truncated options list and a scope note occupy different places", () => {
    const rows = Array.from(
      { length: MAX_QUERY_FILTER_OPTIONS + 1 },
      (_, i) => ({
        _id: `c${i}`,
        name: `Company ${i}`,
      }),
    );
    const spec = {
      title: "T",
      sections: [
        {
          type: "filter",
          control: "select",
          field: "company_id",
          label: "Companies",
          optionsQuery: {
            collection: "demo_companies",
            pipeline: [{ $project: { _id: 1, name: 1 } }],
            valueKey: "_id",
            labelKey: "name",
          },
        },
        {
          type: "kpi",
          label: "Revenue",
          query: orderTotal,
          valueKey: "total",
          filterBy: ["company_id"],
        },
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: ["company_id"],
        },
      ],
    };
    const blocks = compileReport({
      spec,
      results: [rows, [{ total: 5 }], tableRows],
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
    });
    const byId = byIdOf(blocks);
    const control = byId.filter_company_id;
    expect(control.properties.title).toBe(
      `Companies — first ${MAX_QUERY_FILTER_OPTIONS}`,
    );
    expect(control.properties.label).toBeUndefined();
    expect(byId.filters_s1_scope.properties.content).toBe(
      "Also filters: Orders",
    );
  });

  // A filter with no first subscriber has no position to occupy. The old top row
  // could hold one, but the case never actually reaches compilation: the same
  // validateReportSpec pass compileReport runs up front rejects an unbound filter
  // loudly. So the degenerate case is handled by refusal, not a silent drop.
  // Filters anchored above the same section share a row: the span is 24 divided
  // by the group size, so three controls stop costing three rows before the
  // report's first number. Below the grid's md breakpoint every block is span 24
  // regardless, so this is a wide-viewport layout only.
  describe("filters anchored at the same section share a row", () => {
    const anchoredSpec = (fields) => ({
      title: "T",
      sections: [
        ...fields.map((field) => ({
          type: "filter",
          control: "select",
          field,
          label: field,
        })),
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: fields,
        },
      ],
    });
    const spans = (fields) => {
      const blocks = compileReport({
        spec: anchoredSpec(fields),
        results: [tableRows],
        catalog: testCatalog,
        roles,
        endpointId,
        chartEndpointId,
      });
      return fields.map(
        (field) => blocks.find((b) => b.id === `filter_${field}`).layout.span,
      );
    };

    test.each([
      [["status"], [24]],
      [
        ["status", "region"],
        [12, 12],
      ],
      [
        ["status", "region", "category"],
        [8, 8, 8],
      ],
      // Past three, rows are balanced rather than greedy: four controls are two
      // rows of two, not three and a lone fourth. Every wrap line then fills
      // exactly — which is what stops the following section sharing a line with
      // the controls — and no control stretches alone across the page.
      [
        ["status", "region", "category", "channel"],
        [12, 12, 12, 12],
      ],
      [
        ["status", "region", "category", "channel", "product"],
        [8, 8, 8, 12, 12],
      ],
    ])("%j → spans %j", (fields, expected) => {
      expect(spans(fields)).toEqual(expected);
    });

    // The property those numbers exist for, asserted directly: every wrap line a
    // filter group occupies is exactly full, at any group size. A ragged line
    // leaves columns the next section flows into, which is how a report with
    // four filters and four KPIs came to render the last filter beside the first
    // two numbers, with the KPIs split across two lines.
    test.each([[1], [2], [3], [4], [5], [6], [7], [8], [10]])(
      "%i filters fill every wrap line they occupy",
      (count) => {
        const fields = [
          "status",
          "region",
          "category",
          "channel",
          "product",
          "customer",
          "currency",
          "country",
          "city",
          "rep",
        ].slice(0, count);
        let line = 0;
        for (const span of spans(fields)) {
          line += span;
          expect(line).toBeLessThanOrEqual(24);
          if (line === 24) line = 0;
        }
        expect(line).toBe(0);
      },
    );

    // The group's leading wrap line carries the top gap — every control on it,
    // so a shared row stays level, and nothing past it, so controls that wrap
    // onto a second line are not pushed away from the first. With four controls
    // the leading line is two of them, since the group balances 2+2.
    test.each([
      [["status"], 1],
      [["status", "region"], 2],
      [["status", "region", "category"], 3],
      [["status", "region", "category", "channel"], 2],
    ])("%j → the first %i control(s) carry the gap", (fields, leading) => {
      const blocks = compileReport({
        spec: anchoredSpec(fields),
        results: [tableRows],
        catalog: testCatalog,
        roles,
        endpointId,
        chartEndpointId,
      });
      const byId = byIdOf(blocks);
      const gaps = fields.map((f) => byId[`filter_${f}`].style?.marginTop);
      expect(gaps.slice(0, leading).every((g) => g > 0)).toBe(true);
      expect(new Set(gaps.slice(0, leading)).size).toBe(1);
      expect(gaps.slice(leading)).toEqual(
        Array(fields.length - leading).fill(undefined),
      );
      // The controls lead the group, so the section's head row does not. The
      // table follows the filters in spec order, so its id trails their count.
      expect(
        byId[`s${fields.length}_heading`].style?.marginTop,
      ).toBeUndefined();
    });

    // The span is per anchor group, not per report: co-location is the point, so
    // filters scoping different sections must not be pulled onto one row.
    test("each anchor group is spanned on its own size", () => {
      const spec = {
        title: "T",
        sections: [
          { type: "filter", control: "select", field: "status", label: "S" },
          { type: "filter", control: "select", field: "region", label: "R" },
          {
            type: "kpi",
            label: "Revenue",
            query: orderTotal,
            valueKey: "total",
            filterBy: ["status", "region"],
          },
          { type: "filter", control: "select", field: "channel", label: "C" },
          {
            type: "table",
            label: "Orders",
            query: ordersByRegion,
            columns: [{ key: "region" }],
            filterBy: ["channel"],
          },
        ],
      };
      const blocks = compileReport({
        spec,
        results: [[{ total: 5 }], tableRows],
        catalog: testCatalog,
        roles,
        endpointId,
        chartEndpointId,
      });
      const byId = byIdOf(blocks);
      expect(byId.filter_status.layout.span).toBe(12);
      expect(byId.filter_region.layout.span).toBe(12);
      expect(byId.filter_channel.layout.span).toBe(24);
    });

    // A filter that loses its options is replaced by an Alert. It takes the
    // group's span, not the Alert block's own 24 — otherwise a full-width Alert
    // between two controls strands the survivor half-width on its own line.
    test("an options-failure Alert keeps its group's span", () => {
      const spec = {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "select",
            field: "company_id",
            label: "Companies",
            optionsQuery: {
              collection: "demo_companies",
              pipeline: [{ $project: { _id: 1, name: 1 } }],
              valueKey: "_id",
              labelKey: "name",
            },
          },
          { type: "filter", control: "select", field: "status", label: "S" },
          {
            type: "table",
            label: "Orders",
            query: ordersByRegion,
            columns: [{ key: "region" }],
            filterBy: ["company_id", "status"],
          },
        ],
      };
      const blocks = compileReport({
        spec,
        // The options query returned nothing usable; the table still has rows.
        results: [[], tableRows],
        catalog: testCatalog,
        roles,
        endpointId,
        chartEndpointId,
      });
      const byId = byIdOf(blocks);
      expect(byId.s0.type).toBe("Alert");
      expect(byId.s0.layout.span).toBe(12);
      expect(byId.filter_status.layout.span).toBe(12);
    });
  });

  // What closes a filter group: the scope its controls share, said once, and a
  // Reset that puts the sections they drive back to the report as it opened. Both
  // belong to the GROUP — one sentence and one button however many controls it
  // holds — which is the whole of why they exist: four filters over six sections
  // rendered the same three-line note four times, more vertical space than any
  // chart on the page.
  describe("a filter group's closing line", () => {
    const select = (field) => ({
      type: "filter",
      control: "select",
      field,
      label: field,
    });
    const kpi = (label, filterBy) => ({
      type: "kpi",
      label,
      query: orderTotal,
      valueKey: "total",
      filterBy,
    });
    const table = (label, filterBy) => ({
      type: "table",
      label,
      query: ordersByRegion,
      columns: [{ key: "region" }],
      filterBy,
    });
    const chart = (label, filterBy) => ({
      type: "chart",
      chart: "bar",
      label,
      query: ordersByRegion,
      x: "region",
      y: ["total"],
      filterBy,
    });
    const compile = (sections, results) =>
      byIdOf(
        compileReport({
          spec: { title: "T", sections },
          results,
          catalog: testCatalog,
          roles,
          endpointId,
          chartEndpointId,
        }),
      );
    const notes = (byId, fields) =>
      fields.map((field) => byId[`filter_${field}`].properties.label);

    // Every control drives the same two sections, so every per-control note
    // would have read identically. One line says it for all of them.
    test("filters over the same sections state their scope once, not per control", () => {
      const byId = compile(
        [
          select("status"),
          select("region"),
          kpi("Revenue", ["status", "region"]),
          table("Orders", ["status", "region"]),
        ],
        [[{ total: 5 }], tableRows],
      );
      expect(notes(byId, ["status", "region"])).toEqual([undefined, undefined]);
      expect(byId.filters_s2_scope.type).toBe("Paragraph");
      expect(byId.filters_s2_scope.properties).toEqual({
        content: "Also filters: Orders",
        type: "secondary",
      });
    });

    // The most common set gets the line; the odd one out cannot be spoken for by
    // it, so it keeps a note of its own — and only it does.
    test("a control whose scope differs from its group's keeps its own note", () => {
      const byId = compile(
        [
          select("status"),
          select("region"),
          select("category"),
          kpi("Revenue", ["status", "region", "category"]),
          table("Orders", ["status", "region"]),
          table("Regions", ["category"]),
        ],
        [[{ total: 5 }], tableRows, tableRows],
      );
      expect(byId.filters_s3_scope.properties.content).toBe(
        "Also filters: Orders",
      );
      expect(notes(byId, ["status", "region", "category"])).toEqual([
        undefined,
        undefined,
        { extra: "Also filters: Regions" },
      ]);
    });

    // No set is more common than any other, so there is nothing for a shared
    // line to say: n distinct scopes are already shortest as n notes.
    test("all scopes distinct keeps every per-control note and states none", () => {
      const byId = compile(
        [
          select("status"),
          select("region"),
          kpi("Revenue", ["status", "region"]),
          table("Orders", ["status"]),
          table("Regions", ["region"]),
        ],
        [[{ total: 5 }], tableRows, tableRows],
      );
      expect(byId.filters_s2_scope).toBeUndefined();
      expect(notes(byId, ["status", "region"])).toEqual([
        { extra: "Also filters: Orders" },
        { extra: "Also filters: Regions" },
      ]);
    });

    // Reset clears every key a filter change can have written — the group's own
    // control keys, and the section keys per type — which is what makes clearing
    // enough on its own: each section binding falls back to the value the first,
    // unfiltered resolve inlined, so an empty key IS the unfiltered data.
    test("Reset clears the group's filter keys and every bound section's keys", () => {
      const byId = compile(
        [
          select("status"),
          select("region"),
          kpi("Revenue", ["status", "region"]),
          chart("By region", ["region"]),
          table("Orders", ["status"]),
        ],
        [[{ total: 5 }], tableRows, tableRows],
      );
      const [reset] = byId.filters_s2_reset.events.onClick;
      expect(byId.filters_s2_reset.type).toBe("Button");
      expect(byId.filters_s2_reset.properties.title).toBe("Reset");
      expect(reset.type).toBe("SetState");
      // The union of what the group's filters drive, wider than any one
      // control's: status alone would leave the chart showing filtered data.
      expect(reset.params).toEqual({
        filter_status: null,
        filter_region: null,
        "sections.s2.rows": null,
        "sections.s3.option": null,
        "sections.s3.height": null,
        "sections.s4.rows": null,
      });
      // The invariant behind those keys, asserted against the re-query that
      // writes them: a key a filter change can write and Reset does not clear is
      // a section still showing filtered data after a Reset.
      const written = new Set();
      for (const field of ["status", "region"]) {
        for (const action of byId[`filter_${field}`].events.onChange) {
          if (action.type === "SetState") {
            Object.keys(action.params).forEach((key) => written.add(key));
          }
        }
      }
      expect(new Set(Object.keys(reset.params))).toEqual(
        new Set([...written, "filter_status", "filter_region"]),
      );
    });

    // The arithmetic filterSpans exists for, applied to what follows the
    // controls: a ragged closing line leaves columns the next section flows up
    // into, which is how filters and KPIs came to share a line.
    test("the closing line fills exactly 24 columns, with or without a scope line", () => {
      const both = compile(
        [
          select("status"),
          select("region"),
          kpi("Revenue", ["status", "region"]),
          table("Orders", ["status", "region"]),
        ],
        [[{ total: 5 }], tableRows],
      );
      expect(both.filters_s2_scope.layout.span).toBe(20);
      expect(both.filters_s2_reset.layout.span).toBe(4);
      expect(
        both.filters_s2_scope.layout.span + both.filters_s2_reset.layout.span,
      ).toBe(24);

      // Nothing to state, so Reset takes the whole line rather than a quarter of
      // it and leaving three quarters open.
      const alone = compile(
        [select("status"), kpi("Revenue", ["status"])],
        [[{ total: 5 }]],
      );
      expect(alone.filters_s1_scope).toBeUndefined();
      expect(alone.filters_s1_reset.layout.span).toBe(24);
    });

    // Nothing to put back: the section the group drives failed its resolve, so
    // it renders an Alert that reads no state at all.
    test("no Reset when the group's filters bind nothing that resolved", () => {
      const byId = compile(
        [select("status"), kpi("Revenue", ["status"])],
        [null],
      );
      expect(byId.s1.type).toBe("Alert");
      expect(byId.filters_s1_reset).toBeUndefined();
      expect(byId.filter_status.layout.span).toBe(24);
    });
  });

  test("a filter no section subscribes to is rejected before it can be placed", () => {
    const spec = {
      title: "T",
      sections: [
        { type: "filter", control: "select", field: "status", label: "Status" },
        { type: "kpi", label: "Revenue", query: orderTotal, valueKey: "total" },
      ],
    };
    expect(() =>
      compileReport({
        spec,
        results: [[{ total: 5 }]],
        catalog: testCatalog,
        roles,
        endpointId,
        chartEndpointId,
      }),
    ).toThrow(/not bound by any section/);
  });
});

// Owner-only recovery affordances. All are DISPLAY gates over a server-side one
// (remove-report-section owner-matches; chat is gated server-side) — a non-owner
// must never see one, so each is asserted per branch. The two chat links are
// additionally conditional on the report having a conversation to reopen.
// Sibling ids share the endpointId's entry prefix (ai-reporting/…), the only scope
// compileReport has at resolve time.
describe("owner-only affordances", () => {
  const owner = { user_id: "u1", name: "Jane Doe" };
  // s1 (the chart) fails; s0 kpi and s3 table render normally.
  const brokenResults = [results[0], undefined, results[2]];

  const compile = (extra) =>
    byIdOf(
      compileReport({
        spec,
        results: brokenResults,
        catalog: testCatalog,
        roles,
        endpointId,
        chartEndpointId,
        owner,
        ...extra,
      }),
    );

  test("owner + linked report: Continue-in-chat in the header, Fix + Drop on the broken section", () => {
    const byId = compile({ is_owner: true, conversation_id: "conv-1" });

    const continueBtn = byId.report_continue_in_chat;
    expect(continueBtn.type).toBe("Button");
    const [continueLink] = continueBtn.events.onClick;
    expect(continueLink.type).toBe("Link");
    expect(continueLink.params.pageId).toBe("ai-reporting/chat");
    expect(continueLink.params.urlQuery).toEqual({ conversation_id: "conv-1" });

    // The broken chart keeps its Alert; recoveries are flat siblings.
    expect(byId.s1.type).toBe("Alert");

    const [fixLink] = byId.s1_fix_in_chat.events.onClick;
    expect(fixLink.type).toBe("Link");
    expect(fixLink.params.pageId).toBe("ai-reporting/chat");
    expect(fixLink.params.urlQuery).toEqual({
      conversation_id: "conv-1",
      section_id: "s1",
    });

    const [drop, reload] = byId.s1_drop.events.onClick;
    expect(drop.type).toBe("CallAPI");
    expect(drop.params.endpointId).toBe("ai-reporting/remove-report-section");
    expect(drop.params.payload).toEqual({
      report_id: { __url_query: "report_id" },
      section_id: "s1",
    });
    // Refresh: re-open the report (the Dynamic block re-resolves on page GET).
    expect(reload.type).toBe("Link");
    expect(reload.params.pageId).toBe("ai-reporting/report");
    expect(reload.params.urlQuery).toEqual({
      report_id: { __url_query: "report_id" },
    });
  });

  test("owner + report with no conversation: no chat links, Drop still shows", () => {
    const byId = compile({ is_owner: true });
    expect(byId.report_continue_in_chat).toBeUndefined();
    expect(byId.s1_fix_in_chat).toBeUndefined();
    expect(byId.s1_drop).toBeDefined();
    expect(byId.s1.type).toBe("Alert");
  });

  test("non-owner: no owner affordances anywhere; the broken section names who can fix it", () => {
    const blocks = compileReport({
      spec,
      results: brokenResults,
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
      owner,
      is_owner: false,
      conversation_id: "conv-1",
    });
    const byId = byIdOf(blocks);

    expect(byId.report_continue_in_chat).toBeUndefined();
    expect(byId.s1_fix_in_chat).toBeUndefined();
    expect(byId.s1_drop).toBeUndefined();

    // The Alert stays and names the owner, with no action to take.
    expect(byId.s1.type).toBe("Alert");
    expect(byId.s1.properties.description).toContain("Jane Doe");

    // Per-branch guard: nothing owner-only leaked into the config. Not a blanket
    // "no Link anywhere" — the ★ a non-owner may legitimately click reloads the
    // page with one — so the guard names the owner-only targets instead. Anything
    // owner-only navigates to the chat or calls remove-report-section.
    const json = JSON.stringify(blocks);
    expect(json).not.toContain("remove-report-section");
    expect(json).not.toContain("ai-reporting/chat");
    // set-report-title is the rename endpoint the static modal calls; a non-owner's
    // menu carries no item that opens it. Nor the delete confirm.
    expect(json).not.toContain("rename_modal");
    expect(json).not.toContain("delete_confirm_modal");
    const links = blocks
      .flatMap((block) => block.events?.onClick ?? [])
      .filter((action) => action.type === "Link");
    // Both of these are a reader's: the ★ reload, and the new tab a duplicate opens.
    // The ⋯ menu's own actions are emitted per shown item, so an owner-only Link
    // (publish's reload) cannot appear here.
    expect(links.map((link) => link.id)).toEqual([
      "reload_after_favourite",
      "menu_duplicate_open",
    ]);
  });

  // Favouriting is a read-side act (the endpoint checks readability, not
  // ownership), so the ★ is the one header action a non-owner of a shared report
  // gets. It sends the DESIRED state, which the compiler already knows.
  test("the ★ is compiled for every viewer and sends the opposite of the current state", () => {
    const unstarred = compile({ is_owner: false, is_favourite: false });
    expect(unstarred.report_favourite.properties.icon).toBe("AiOutlineStar");
    const [call, reload] = unstarred.report_favourite.events.onClick;
    expect(call.type).toBe("CallAPI");
    expect(call.params.endpointId).toBe("ai-reporting/set-report-favourite");
    expect(call.params.payload).toEqual({
      report_id: { __url_query: "report_id" },
      favourite: true,
    });
    expect(reload.params.pageId).toBe("ai-reporting/report");

    const starred = compile({ is_owner: true, is_favourite: true });
    expect(starred.report_favourite.properties.icon).toBe("AiFillStar");
    expect(
      starred.report_favourite.events.onClick[0].params.payload.favourite,
    ).toBe(false);
  });

  // The title shares its row with the actions, so its span is whatever they
  // leave — 20 with the ★ and ⋯, 15 once the chat link joins them.
  test("the title's span makes room for exactly the actions compiled beside it", () => {
    const alone = compile({ is_owner: false });
    expect(alone.report_title.layout.span).toBe(20);
    expect(alone.report_continue_in_chat).toBeUndefined();

    const withChat = compile({ is_owner: true, conversation_id: "conv-1" });
    expect(withChat.report_title.layout.span).toBe(15);
    expect(withChat.report_continue_in_chat.layout.span).toBe(5);
  });

  // The ⋯ is compiled for EVERY viewer, like the ★: it always holds Duplicate, which
  // is any reader's path to a copy they control, and it leaves out the items a viewer
  // cannot use. It is a DropdownMenu rather than a Button opening a static Modal
  // because a dropdown owns its trigger — nothing can open one by id — which is what
  // puts the menu in compiled output and one block type in the Dynamic allowlist.
  describe("the ⋯ header menu", () => {
    const seedOf = (byId) => byId.report_menu.events.onClick[0].params;
    const keysOf = (byId) =>
      byId.report_menu.properties.links.map((link) => link.id);
    const actionsOf = (byId) => byId.report_menu.events.onClick.slice(1);
    // Every action but the seed belongs to exactly one item, named by its skip.
    const itemOf = (action) => action.skip.__ne[1];

    test("is a dropdown wrapping the ⋯ trigger, for every viewer", () => {
      for (const is_owner of [true, false]) {
        const byId = compile({ is_owner });
        expect(byId.report_menu.type).toBe("DropdownMenu");
        expect(byId.report_menu.properties.trigger).toBe("click");
        // The trigger is the block INSIDE the dropdown (slots.content), not the
        // dropdown itself — that is the whole reason this is compiled.
        const [trigger] = byId.report_menu.blocks;
        expect(trigger.type).toBe("Button");
        expect(trigger.properties.hideTitle).toBe(true);
        expect(trigger.properties.icon).toBe("AiOutlineEllipsis");
      }
    });

    // Which items show is decided here, server-side, so the compiled links are the
    // whole answer — there is no client-side `visible:` left to re-check them.
    describe("items per viewer", () => {
      test("an owner of a private report can rename, publish, duplicate, delete", () => {
        expect(
          keysOf(
            compile({ is_owner: true, visibility: "private", can_share: true }),
          ),
        ).toEqual(["rename", "publish", "duplicate", "delete"]);
      });

      // Publish is the one item that needs BOTH: unset share_roles means nothing in
      // the app can be published, and the endpoint rejects it regardless.
      test("without share_roles an owner gets no Publish", () => {
        expect(
          keysOf(
            compile({
              is_owner: true,
              visibility: "private",
              can_share: false,
            }),
          ),
        ).toEqual(["rename", "duplicate", "delete"]);
      });

      test("a shared report offers Unpublish in Publish's place", () => {
        expect(
          keysOf(
            compile({ is_owner: true, visibility: "shared", can_share: true }),
          ),
        ).toEqual(["rename", "unpublish", "duplicate", "delete"]);
      });

      // Unpublish falls back to the owner, so losing the role never strands a report
      // in front of the whole app. This is the asymmetry ownership.md spells out.
      test("an owner keeps Unpublish after losing the role", () => {
        expect(
          keysOf(
            compile({ is_owner: true, visibility: "shared", can_share: false }),
          ),
        ).toEqual(["rename", "unpublish", "duplicate", "delete"]);
      });

      // The moderation power: anyone trusted to decide what the whole app sees may
      // retract someone else's report. There is no equivalent power to publish one.
      test("a share_roles holder can retract a report they do not own", () => {
        expect(
          keysOf(
            compile({ is_owner: false, visibility: "shared", can_share: true }),
          ),
        ).toEqual(["unpublish", "duplicate"]);
      });

      test("a plain reader gets Duplicate alone", () => {
        expect(
          keysOf(
            compile({
              is_owner: false,
              visibility: "shared",
              can_share: false,
            }),
          ),
        ).toEqual(["duplicate"]);
      });

      // Absent inputs must land on the closed position: an undefined is_owner would
      // otherwise show the owner's items, and an undefined visibility would offer
      // Publish on a report that is already shared.
      test("gates fall back to the closed position when the resolver omits them", () => {
        expect(keysOf(compile({}))).toEqual(["duplicate"]);
        const seed = seedOf(compile({}));
        expect(seed.selected_report.is_owner).toBe(false);
        expect(seed.selected_report.visibility).toBe("private");
      });
    });

    // The block fires ONE onClick for the whole menu, so the dispatch is the skip on
    // each action. Two properties matter: every action belongs to an item that is
    // actually on this viewer's menu, and every item on it has actions.
    describe("item dispatch", () => {
      test("every action is claimed by a shown item, and every shown item has actions", () => {
        for (const extra of [
          { is_owner: true, visibility: "private", can_share: true },
          { is_owner: true, visibility: "shared", can_share: false },
          { is_owner: false, visibility: "shared", can_share: true },
          { is_owner: false },
        ]) {
          const byId = compile(extra);
          const keys = keysOf(byId);
          const claimed = actionsOf(byId).map(itemOf);
          expect(new Set(claimed)).toEqual(new Set(keys));
          expect(claimed.every((key) => keys.includes(key))).toBe(true);
        }
      });

      // The seed is the one unskipped action: it runs for every item because it is
      // what the static rename and delete modals read.
      test("the seed runs for every item and nothing else does", () => {
        const byId = compile({ is_owner: true, can_share: true });
        const [seed] = byId.report_menu.events.onClick;
        expect(seed.id).toBe("seed_report_menu");
        expect(seed.skip).toBeUndefined();
        expect(
          actionsOf(byId).every((action) => action.skip !== undefined),
        ).toBe(true);
      });

      test("rename and delete only open the static modals that own the writes", () => {
        const byId = compile({ is_owner: true, can_share: true });
        const opens = actionsOf(byId).filter(
          (action) => action.type === "CallMethod",
        );
        expect(opens.map((action) => action.params.blockId)).toEqual([
          "rename_modal",
          "delete_confirm_modal",
        ]);
        // The form is seeded from selected_report rather than from the compiled
        // literals, so a title saved without a reload survives.
        const seedForm = actionsOf(byId).find(
          (a) => a.id === "menu_rename_seed",
        );
        expect(seedForm.params.rename_title).toEqual({
          __state: "selected_report.title",
        });
      });

      test("publish and unpublish are one endpoint with opposite values, then a reload", () => {
        const shared = actionsOf(
          compile({ is_owner: true, visibility: "private", can_share: true }),
        );
        const publish = shared.find(
          (action) => action.id === "menu_publish_call",
        );
        expect(publish.params.endpointId).toBe(
          "ai-reporting/set-report-visibility",
        );
        expect(publish.params.payload).toEqual({
          report_id: { __url_query: "report_id" },
          visibility: "shared",
        });
        expect(
          shared.find((action) => action.id === "menu_publish_reload").params
            .pageId,
        ).toBe("ai-reporting/report");

        const retracted = actionsOf(
          compile({ is_owner: true, visibility: "shared", can_share: true }),
        );
        expect(
          retracted.find((action) => action.id === "menu_unpublish_call").params
            .payload.visibility,
        ).toBe("private");
      });

      // A duplicate is a different report, so this one opens a new tab instead of
      // reloading. Navigation goes through pageId/urlQuery: Link's `url` param means
      // an external address and gets an https:// prefix, which turns the endpoint's
      // root-relative url into a hostname. This assertion is the regression guard.
      test("duplicate opens the copy in a new tab, by pageId and urlQuery", () => {
        const actions = actionsOf(compile({ is_owner: false }));
        const call = actions.find(
          (action) => action.id === "menu_duplicate_call",
        );
        expect(call.params.endpointId).toBe("ai-reporting/duplicate-report");
        const open = actions.find(
          (action) => action.id === "menu_duplicate_open",
        );
        expect(open.params).toEqual({
          pageId: "ai-reporting/report",
          urlQuery: {
            report_id: {
              __api: "ai-reporting/duplicate-report.response.report_id",
            },
          },
          newTab: true,
        });
        expect(open.params.url).toBeUndefined();
      });
    });

    // The menu reads `selected_report` — the same shape the list seeds from a grid
    // row. Everything but the id is a compile-time literal; the id is not one of
    // compileReport's inputs, so it comes from the page URL, the same value
    // resolve-report loaded the report from.
    test("seeds the row shape the list's menu already reads", () => {
      const seed = seedOf(compile({ is_owner: true, visibility: "shared" }));
      expect(seed.selected_report).toEqual({
        _id: { __url_query: "report_id" },
        title: "Q2 Revenue by Region",
        description: "Revenue and order counts, filterable by status.",
        is_owner: true,
        visibility: "shared",
      });
    });

    // "" rather than undefined for a report with no description: the endpoint treats
    // null as leave-alone, so a field the edit form opened as undefined would silently
    // keep a description the user cannot see they still have.
    test("carries the description, empty rather than absent", () => {
      const withProse = seedOf(
        compile({
          spec: { ...spec, description: "Revenue and order counts." },
        }),
      );
      expect(withProse.selected_report.description).toBe(
        "Revenue and order counts.",
      );

      const bare = { ...spec };
      delete bare.description;
      expect(seedOf(compile({ spec: bare })).selected_report.description).toBe(
        "",
      );
    });

    // selected_report is the menu's SINGLE source. The edit form's own paths are
    // filled from it when the form opens (menu_rename_seed), never seeded here —
    // this SetState re-runs on every item click, so a compiled literal would
    // overwrite a rename saved a moment ago the next time the form was opened.
    test("seeds nothing but selected_report", () => {
      expect(Object.keys(seedOf(compile({})))).toEqual(["selected_report"]);
    });
  });
});

// A failed section is either withheld (valid, but role-gated) or broken. Both
// arrive as an error-free null row; the compiler tells them apart from catalog
// + viewer roles, the same enumeration the AnalyticsPipeline gate ran. The
// withheld Alert names no collection and no role and offers no recovery — not
// even to the owner, since nothing is broken to fix.
describe("withheld vs broken failed sections", () => {
  const owner = { user_id: "u1", name: "Jane Doe" };

  // demo_companies is role-gated (analyst/admin); a "viewer" cannot reach it.
  const gatedSpec = {
    title: "Companies",
    sections: [
      {
        type: "table",
        label: "Companies",
        query: {
          collection: "demo_companies",
          pipeline: [{ $project: { _id: 0, name: 1 } }],
        },
        columns: [{ key: "name" }],
      },
    ],
  };
  // demo_orders is ungated: a null row here is genuinely broken.
  const ungatedSpec = {
    title: "Orders",
    sections: [
      {
        type: "table",
        label: "Orders",
        query: ordersByRegion,
        columns: [{ key: "region" }],
      },
    ],
  };

  const compile = (spec, extra) =>
    byIdOf(
      compileReport({
        spec,
        results: [null],
        catalog: testCatalog,
        endpointId,
        chartEndpointId,
        owner,
        ...extra,
      }),
    );

  test("a viewer lacking the role gets the withheld Alert — no recoveries, no collection or role named", () => {
    const byId = compile(gatedSpec, {
      roles: ["viewer"],
      is_owner: true,
      conversation_id: "conv-1",
    });

    expect(byId.s0.type).toBe("Alert");
    expect(byId.s0.properties.message).toBe("Companies");
    expect(byId.s0.properties.description).toBe(
      "You don't have access to the data in this section.",
    );
    // No recovery affordances — even for the owner: nothing is broken to fix.
    expect(byId.s0_fix_in_chat).toBeUndefined();
    expect(byId.s0_drop).toBeUndefined();

    // The withheld copy leaks no gate detail — no collection, no role, no
    // "ask the owner" from the broken non-owner path.
    const json = JSON.stringify(byId.s0);
    expect(json).not.toContain("demo_companies");
    expect(json).not.toContain("analyst");
    expect(json).not.toContain("admin");
    expect(json).not.toContain("Jane Doe");
  });

  // The gate enforces each touched collection as it is reached — any-of within a
  // collection, ALL-OF across them. Classifying against the union of their role
  // lists instead reads "holds one of the roles somewhere" as satisfied, so a
  // section the gate genuinely withheld gets called broken and its owner is
  // offered Drop — a destructive spec edit — for an access problem.
  describe("a pipeline touching two collections gated on different roles", () => {
    const twoGates = {
      demo_sales: {
        roles: ["sales"],
        description: "Sales",
        fields: { total: { type: "number" }, cust: { type: "string" } },
      },
      demo_finance: {
        roles: ["finance"],
        description: "Finance",
        fields: { _id: { type: "string" } },
      },
    };
    const joinedSpec = {
      title: "Joined",
      sections: [
        {
          type: "table",
          label: "Joined",
          query: {
            collection: "demo_sales",
            pipeline: [
              {
                $lookup: {
                  from: "demo_finance",
                  localField: "cust",
                  foreignField: "_id",
                  as: "c",
                },
              },
              { $limit: 10 },
            ],
          },
          columns: [{ key: "total" }],
        },
      ],
    };
    const classify = (viewerRoles) =>
      byIdOf(
        compileReport({
          spec: joinedSpec,
          results: [null],
          catalog: twoGates,
          roles: viewerRoles,
          endpointId,
          chartEndpointId,
          owner,
          is_owner: true,
          conversation_id: "conv-1",
        }),
      );

    test("holding only one of the two roles is withheld, not broken", () => {
      const byId = classify(["sales"]);
      expect(byId.s0.properties.description).toBe(
        "You don't have access to the data in this section.",
      );
      // The spec is fine — there is nothing to fix and nothing to drop.
      expect(byId.s0_fix_in_chat).toBeUndefined();
      expect(byId.s0_drop).toBeUndefined();
    });

    test("holding both roles is broken — the gate would have passed", () => {
      const byId = classify(["sales", "finance"]);
      expect(byId.s0.properties.description).toMatch(/failed to load/);
      expect(byId.s0_drop).toBeDefined();
    });
  });

  test("owner viewing their own withheld section gets the withheld variant, not the broken one", () => {
    const blocks = compileReport({
      spec: gatedSpec,
      results: [null],
      catalog: testCatalog,
      roles: ["viewer"],
      endpointId,
      chartEndpointId,
      owner,
      is_owner: true,
      conversation_id: "conv-1",
    });
    const byId = byIdOf(blocks);

    expect(byId.s0.properties.description).toBe(
      "You don't have access to the data in this section.",
    );
    // No section recovery affordances (the header's own Continue-in-chat is
    // unrelated to the section and stays).
    expect(byId.s0_fix_in_chat).toBeUndefined();
    expect(byId.s0_drop).toBeUndefined();
    expect(JSON.stringify(blocks)).not.toContain("remove-report-section");
  });

  test("a null row over an ungated collection is broken, keeping owner recoveries", () => {
    const byId = compile(ungatedSpec, {
      roles: ["viewer"],
      is_owner: true,
      conversation_id: "conv-1",
    });

    expect(byId.s0.type).toBe("Alert");
    expect(byId.s0.properties.description).toMatch(/failed to load/);
    expect(byId.s0_fix_in_chat).toBeDefined();
    expect(byId.s0_drop).toBeDefined();
  });

  test("a null row over a catalog-absent collection is broken (touchedCollections throws)", () => {
    const missingSpec = {
      title: "Missing",
      sections: [
        {
          type: "table",
          label: "Missing",
          query: {
            collection: "demo_missing",
            pipeline: [{ $project: { _id: 0 } }],
          },
          columns: [{ key: "region" }],
        },
      ],
    };
    const byId = compile(missingSpec, { roles: ["viewer"], is_owner: true });

    expect(byId.s0.type).toBe("Alert");
    expect(byId.s0.properties.description).toMatch(/failed to load/);
    expect(byId.s0.properties.description).not.toContain("access to the data");
    // Broken → owner recoveries present.
    expect(byId.s0_drop).toBeDefined();
  });
});

// Layout is derived on every open from the section's type, its position in its
// run of same-type neighbours, and the shape of the rows the resolve returned —
// never from anything the agent authored. A run is what the derivation is
// computed over, and section ORDER is the author's only channel into it: two
// narrow charts placed adjacent pair up, the same two with a section between
// them do not.
describe("layout derivation", () => {
  const chartSection = (
    id,
    { x = "region", y = ["total"], chart = "bar" },
  ) => ({
    type: "chart",
    chart,
    label: `Chart ${id}`,
    query: ordersByRegion,
    x,
    y,
  });
  // Two categories, one series, no dates — narrow on every trigger.
  const narrowRows = [
    { region: "EU", total: 2500 },
    { region: "US", total: 1700 },
  ];
  const compile = (sections, results, extra = {}) =>
    compileReport({
      spec: { title: "T", sections },
      results,
      catalog: testCatalog,
      roles,
      endpointId,
      chartEndpointId,
      ...extra,
    });

  // The pair, in full: each section keeps its own head row and card, wrapped in
  // a half-width Box so the two sit side by side. A flat span-12 card would put
  // each heading on a full-width line of its own beside a twelve-column hole —
  // a head row is a whole wrap line — which is why the wrapper is a container
  // and not just a narrower card.
  test("two adjacent narrow charts pair into half-width boxes, each holding its own head row and card", () => {
    const blocks = compile(
      [chartSection("a", {}), chartSection("b", {})],
      [narrowRows, narrowRows],
    );
    const topIds = blocks.map((b) => b.id);
    expect(topIds).toContain("s0_box");
    expect(topIds).toContain("s1_box");
    // The sections' own blocks are inside the wrappers, not beside them.
    expect(topIds).not.toContain("s0_heading");
    expect(topIds).not.toContain("s0_card");

    for (const id of ["s0", "s1"]) {
      const box = blocks.find((b) => b.id === `${id}_box`);
      expect(box.type).toBe("Box");
      expect(box.layout).toEqual({ span: 12 });
      // Child spans re-base against the wrapper, so the head row's 20/4 split
      // divides the half-width line and the card fills it.
      expect(box.blocks.map((b) => [b.id, b.layout.span])).toEqual([
        [`${id}_heading`, 20],
        [`${id}_download`, 4],
        [`${id}_card`, 24],
      ]);
      expect(box.blocks[2].type).toBe("Card");
      expect(box.blocks[2].blocks[0].id).toBe(id);
    }

    // The two boxes are one wrap line, so both take the section gap — and
    // nothing inside them does, or a heading would part from its ⤓.
    const gap = blocks.find((b) => b.id === "s0_box").style.marginTop;
    expect(gap).toBeGreaterThan(0);
    expect(blocks.find((b) => b.id === "s1_box").style.marginTop).toBe(gap);
    const byId = byIdOf(blocks);
    expect(byId.s0_heading.style?.marginTop).toBeUndefined();
    expect(byId.s0_card.style?.marginTop).toBeUndefined();
  });

  // Assembly is told the width of the span the section is drawn at, so a paired
  // chart lays its legend and labels out for half a column rather than for a
  // canvas twice the one it is on.
  test("a paired chart is assembled for half the column", () => {
    const byId = byIdOf(
      compile(
        [chartSection("a", { y: ["total", "tax"] }), chartSection("b", {})],
        [
          [
            { region: "EU", total: 2500, tax: 250 },
            { region: "US", total: 1700, tax: 170 },
          ],
          narrowRows,
        ],
      ),
    );
    const wide = byIdOf(
      compile(
        [chartSection("a", { y: ["total", "tax"] })],
        [
          [
            { region: "EU", total: 2500, tax: 250 },
            { region: "US", total: 1700, tax: 170 },
          ],
        ],
      ),
    );
    expect(chartWidthForSpan(12)).toBeLessThan(chartWidthForSpan(24));
    // The compiled option carries the assembly decisions rather than the width,
    // so the proof is that the pair's legend is laid out the way a narrow canvas
    // lays one out — a horizontal band — where the full column funds a
    // right-hand column for it.
    expect(byId.s0.properties.option.legend.orient).toBe("horizontal");
    expect(wide.s0.properties.option.legend.orient).toBe("vertical");
  });

  // The re-query has to be told the same width the compiled option was built
  // for: spans do not move mid-session, so the span decided at this open is the
  // span the re-queried option lands in.
  test("a paired chart's re-query carries the half-column width", () => {
    const blocks = compile(
      [
        { type: "filter", control: "select", field: "status", label: "Status" },
        { ...chartSection("a", {}), filterBy: ["status"] },
        chartSection("b", {}),
      ],
      [narrowRows, narrowRows],
    );
    const byId = byIdOf(blocks);
    expect(byId.s1_box.layout.span).toBe(12);
    const [call] = byId.filter_status.events.onChange;
    expect(call.params.payload.width).toBe(chartWidthForSpan(12));
  });

  // A narrow chart with no partner is not left half-width: a card beside an
  // empty half column reads as a rendering fault, not as a decision.
  test.each([
    ["its neighbour needs the width", { y: ["a", "b", "c", "d", "e"] }],
    ["it trails the run", undefined],
  ])(
    "a narrow chart that cannot pair takes the whole column (%s)",
    (_, next) => {
      const wideRows = [
        { region: "EU", a: 1, b: 2, c: 3, d: 4, e: 5 },
        { region: "US", a: 5, b: 4, c: 3, d: 2, e: 1 },
      ];
      const sections = [chartSection("a", {})];
      if (next) sections.push(chartSection("b", next));
      const blocks = compile(
        sections,
        next ? [narrowRows, wideRows] : [narrowRows],
      );
      const byId = byIdOf(blocks);
      expect(byId.s0_box).toBeUndefined();
      expect(byId.s0_card.layout).toEqual({ span: 24 });
      // Flat, so the head row leads the section as it always did.
      expect(blocks.map((b) => b.id)).toContain("s0_heading");
      if (next) expect(byId.s1_card.layout).toEqual({ span: 24 });
    },
  );

  // Order is the intent channel: a section of any other type between two charts
  // separates them, so prose between two narrow charts keeps both full width.
  test("markdown between two narrow charts breaks the run", () => {
    const byId = byIdOf(
      compile(
        [
          chartSection("a", {}),
          { type: "markdown", content: "## Notes" },
          chartSection("c", {}),
        ],
        [narrowRows, narrowRows],
      ),
    );
    expect(byId.s0_box).toBeUndefined();
    expect(byId.s2_box).toBeUndefined();
    expect(byId.s0_card.layout).toEqual({ span: 24 });
    expect(byId.s2_card.layout).toEqual({ span: 24 });
  });

  // Each trigger on its own is enough. Asserted through the pairing that would
  // otherwise happen: the partner is a chart that is narrow on every count, so
  // the only reason either can end up full width is the trigger under test.
  describe("needsWidth", () => {
    const dayRows = [
      { day: new Date("2026-01-01T00:00:00Z"), total: 1 },
      { day: new Date("2026-01-02T00:00:00Z"), total: 2 },
    ];
    const nineRows = Array.from({ length: 9 }, (_, index) => ({
      region: `R${index + 1}`,
      total: (9 - index) * 100,
    }));
    const fiveSeriesRows = [
      { region: "EU", a: 1, b: 2, c: 3, d: 4, e: 5 },
      { region: "US", a: 5, b: 4, c: 3, d: 2, e: 1 },
    ];

    test.each([
      ["a temporal x axis", chartSection("t", { x: "day" }), dayRows],
      ["more than eight distinct categories", chartSection("n", {}), nineRows],
      [
        "more than four series",
        chartSection("s", { y: ["a", "b", "c", "d", "e"] }),
        fiveSeriesRows,
      ],
    ])("%s forces the whole column", (_, section, rows) => {
      expect(needsWidth(section, rows)).toBe(true);
      const byId = byIdOf(
        compile([section, chartSection("b", {})], [rows, narrowRows]),
      );
      expect(byId.s0_box).toBeUndefined();
      expect(byId.s0_card.layout).toEqual({ span: 24 });
      expect(byId.s1_card.layout).toEqual({ span: 24 });
    });

    // A year read off a $group is a number, and Flint types an all-numeric
    // column quantitative rather than temporal — so it draws a category axis and
    // the column stays narrow. Mirrored here rather than guessed at, because the
    // consequence has to match what gets drawn.
    test("a numeric x axis is not temporal", () => {
      const yearRows = [
        { year: 2025, total: 1 },
        { year: 2026, total: 2 },
      ];
      expect(needsWidth(chartSection("y", { x: "year" }), yearRows)).toBe(
        false,
      );
    });

    // A pie has no axis to label, no legend column to fund and a radius that
    // fills whatever square it is given, so it pairs however many rows it
    // summarises — and assembly still folds the tail into Other.
    test("a pie stays narrow at twenty slices, and still caps at six plus Other", () => {
      const pieRows = Array.from({ length: 20 }, (_, index) => ({
        status: `S${index + 1}`,
        total: (20 - index) * 100,
      }));
      const pie = chartSection("p", { x: "status", chart: "pie" });
      expect(needsWidth(pie, pieRows)).toBe(false);
      const byId = byIdOf(
        compile([pie, chartSection("b", {})], [pieRows, narrowRows]),
      );
      expect(byId.s0_box.layout).toEqual({ span: 12 });
      expect(byId.s1_box.layout).toEqual({ span: 12 });
      const slices = byId.s0.properties.option.series[0].data;
      expect(slices).toHaveLength(7);
      expect(slices[6].name).toBe("Other");
    });

    // A section with no rows renders an Alert, which has no business in a
    // half-column hole — and there is no data to judge in any case.
    test("a section with no rows reads as needing the width and never pairs", () => {
      expect(needsWidth(chartSection("a", {}), null)).toBe(true);
      const byId = byIdOf(
        compile(
          [chartSection("a", {}), chartSection("b", {})],
          [null, narrowRows],
        ),
      );
      expect(byId.s0.type).toBe("Alert");
      expect(byId.s0_box).toBeUndefined();
      expect(byId.s1_box).toBeUndefined();
      expect(byId.s1_card.layout).toEqual({ span: 24 });
    });
  });

  // Adjacent kpis are one tile row, balanced so every wrap line it takes is
  // exactly full — four to a line rather than the filters' three, since a label
  // over a number still reads at a quarter of the column where a select showing
  // its selection does not.
  describe("a run of kpis is one tile row", () => {
    const kpis = (count) =>
      Array.from({ length: count }, (_, index) => ({
        type: "kpi",
        label: `K${index}`,
        query: orderTotal,
        valueKey: "total",
      }));
    const compileKpis = (count) => {
      const sections = kpis(count);
      return byIdOf(
        compile(
          sections,
          sections.map(() => [{ total: 1 }]),
        ),
      );
    };

    test.each([
      [1, [24]],
      [2, [12, 12]],
      [3, [8, 8, 8]],
      [4, [6, 6, 6, 6]],
      [5, [8, 8, 8, 12, 12]],
      [6, [8, 8, 8, 8, 8, 8]],
    ])("%i kpis → spans %j", (count, expected) => {
      const byId = compileKpis(count);
      expect(
        expected.map((_, index) => byId[`s${index}_card`].layout.span),
      ).toEqual(expected);
    });

    // Every tile keeps its own card: the row is a row of panels, not one panel
    // holding several numbers.
    test("each tile keeps its own card", () => {
      const byId = compileKpis(4);
      for (const index of [0, 1, 2, 3]) {
        expect(byId[`s${index}_card`].type).toBe("Card");
        expect(byId[`s${index}_card`].blocks[0].type).toBe("Statistic");
      }
    });

    // The whole run leads as ONE group, so the gap stamps its first line only: a
    // run of five is two lines of tiles, and a second gap between them would
    // read as two sections of numbers.
    test("the gap leads the tile row's first line only", () => {
      const byId = compileKpis(5);
      const gap = byId.s0_card.style.marginTop;
      expect(gap).toBeGreaterThan(0);
      expect(byId.s1_card.style.marginTop).toBe(gap);
      expect(byId.s2_card.style.marginTop).toBe(gap);
      expect(byId.s3_card.style?.marginTop).toBeUndefined();
      expect(byId.s4_card.style?.marginTop).toBeUndefined();
    });
  });

  // A run of downloads leads as one group the same way a run of kpis does: the
  // whole run compiles to one titled Downloads card, its buttons balanced
  // across the row(s) at filterSpans(n) rather than each stacking full-width
  // or wrapping ragged at the page's raw width.
  describe("a run of downloads is one card", () => {
    const downloads = (count) =>
      Array.from({ length: count }, (_, index) => ({
        type: "download",
        label: `Download ${index}`,
        query: ordersByRegion,
      }));
    // download sections query client-side on click (querySections excludes
    // them), so they consume no entry in the resolver's results array.
    const compileDownloads = (count) => byIdOf(compile(downloads(count), []));

    test("five downloads → one titled card, five buttons at spans [8,8,8,12,12], events unchanged", () => {
      const byId = compileDownloads(5);
      const card = byId.s0_downloads;
      expect(card.type).toBe("Card");
      expect(card.layout).toEqual({ span: 24 });
      expect(card.properties.title).toBe("Downloads");
      expect(card.blocks.map((b) => b.id)).toEqual([
        "s0",
        "s1",
        "s2",
        "s3",
        "s4",
      ]);
      expect(card.blocks.map((b) => b.layout.span)).toEqual([8, 8, 8, 12, 12]);
      card.blocks.forEach((button, index) => {
        expect(button.type).toBe("Button");
        expect(button.properties.title).toBe(`Download ${index}`);
        expect(button.properties.icon).toBe("AiOutlineDownload");
        const [call, dl] = button.events.onClick;
        expect(call.type).toBe("CallAPI");
        expect(call.params.endpointId).toBe(endpointId);
        expect(call.params.payload).toEqual({ query: ordersByRegion });
        expect(dl.type).toBe("DownloadCsv");
        expect(dl.params.data).toEqual({ __api: `${endpointId}.response` });
        expect(dl.params.filename).toBe(`download-${index}.csv`);
      });
    });

    // One idiom, no special case: a lone download still gets the titled card
    // rather than a bare button at the page's raw width.
    test("a single download is still one titled card", () => {
      const byId = compileDownloads(1);
      const card = byId.s0_downloads;
      expect(card.type).toBe("Card");
      expect(card.properties.title).toBe("Downloads");
      expect(card.blocks).toHaveLength(1);
      expect(card.blocks[0].layout.span).toBe(24);
    });

    // The whole run leads as ONE group, so only the card takes the gap.
    test("the gap leads the card", () => {
      const byId = compileDownloads(5);
      expect(byId.s0_downloads.style.marginTop).toBeGreaterThan(0);
    });
  });

  // A table is full width whatever it holds: half a column of AgGrid is a
  // horizontal-scroll trap, and two adjacent tables are two rows, not a pair.
  test.each([[1], [2], [8]])(
    "a table spans the column at %i column(s)",
    (columnCount) => {
      const columns = Array.from({ length: columnCount }, (_, index) => ({
        key: `c${index}`,
        label: `C${index}`,
      }));
      const row = Object.fromEntries(columns.map((c) => [c.key, 1]));
      const byId = byIdOf(
        compile(
          [
            { type: "table", label: "One", query: ordersByRegion, columns },
            { type: "table", label: "Two", query: ordersByRegion, columns },
          ],
          [[row], [row]],
        ),
      );
      expect(byId.s0.layout).toEqual({ span: 24 });
      expect(byId.s1.layout).toEqual({ span: 24 });
      expect(byId.s0_box).toBeUndefined();
    },
  );
});

test("a table has no card of its own; every other section does", () => {
  const blocks = compileReport({
    spec: {
      title: "Padding",
      sections: [
        {
          type: "table",
          label: "Orders",
          query: { collection: "demo_orders", pipeline: [] },
          columns: [{ key: "region", label: "Region" }],
        },
        {
          type: "kpi",
          label: "Count",
          query: { collection: "demo_orders", pipeline: [] },
          valueKey: "total",
        },
      ],
    },
    results: [[{ region: "North" }], [{ total: 3 }]],
    catalog: testCatalog,
    roles: ["analyst"],
    endpointId: "ai-reporting/query-data",
    chartEndpointId: "ai-reporting/chart-data",
  });
  const byId = byIdOf(blocks);
  // A grid draws its own border, header band and row rules, so a card around it
  // is a second frame holding nothing the first doesn't.
  expect(byId.s0_card).toBeUndefined();
  expect(blocks.map((block) => block.id)).toContain("s0");
  // The KPI beside it has no edge of its own and keeps its panel.
  expect(byId.s1_card.type).toBe("Card");
  expect(byId.s1_card.blocks).toEqual([byId.s1]);
});

describe("a pair of charts lines up", () => {
  // Two narrow charts that pair, with label sets that size their canvases
  // differently: four short labels stay flat, five long ones rotate and buy
  // extra room below the plot.
  const pairSpec = (filterBy = []) => ({
    title: "Pair",
    sections: [
      ...(filterBy.length > 0
        ? [{ type: "filter", control: "select", field: "region", label: "R" }]
        : []),
      {
        type: "chart",
        chart: "bar",
        label: "Short labels",
        query: { collection: "demo_orders", pipeline: [] },
        x: "region",
        y: ["revenue"],
        filterBy,
      },
      {
        type: "chart",
        chart: "bar",
        label: "Long labels",
        query: { collection: "demo_orders", pipeline: [] },
        x: "region",
        y: ["revenue"],
      },
    ],
  });
  const shortRows = [
    { region: "North", revenue: 10 },
    { region: "East", revenue: 20 },
  ];
  const longRows = [
    { region: "Northern territory one", revenue: 10 },
    { region: "Eastern territory two", revenue: 20 },
    { region: "Southern territory three", revenue: 30 },
    { region: "Western territory four", revenue: 40 },
    { region: "Central territory five", revenue: 50 },
  ];
  const compile = (spec, results) =>
    byIdOf(
      compileReport({
        spec,
        results,
        catalog: testCatalog,
        roles: ["analyst"],
        endpointId: "ai-reporting/query-data",
        chartEndpointId: "ai-reporting/chart-data",
      }),
    );

  test("both take the taller canvas, so their cards end level", () => {
    const byId = compile(pairSpec(), [shortRows, longRows]);
    const first = byId.s0.properties.height;
    const second = byId.s1.properties.height;
    expect(typeof first).toBe("number");
    expect(first).toBe(second);
    // The taller of the two is what they share — the shorter chart grows into
    // the extra room rather than the taller one being cropped to fit.
    const alone = compile(
      {
        title: "Alone",
        sections: [
          {
            type: "chart",
            chart: "bar",
            label: "Long labels",
            query: { collection: "demo_orders", pipeline: [] },
            x: "region",
            y: ["revenue"],
          },
        ],
      },
      [longRows],
    );
    expect(first).toBe(alone.s0.properties.height);
  });

  test("a filtered member keeps the pinned height and still swaps its option", () => {
    // A select filter sources its options from the catalog, so it consumes no
    // result slot: the two charts are still results[0] and results[1].
    const byId = compile(pairSpec(["region"]), [shortRows, longRows]);
    // s1 is the filtered chart: its option is bound to state, its height is not
    // — a re-query must not knock the pair out of alignment.
    expect(byId.s1.properties.height).toBe(byId.s2.properties.height);
    expect(typeof byId.s1.properties.height).toBe("number");
    expect(byId.s1.properties.option.__if_none).toBeDefined();
  });
});
