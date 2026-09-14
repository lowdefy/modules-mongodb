import buildDataParts from "./buildDataParts.js";

const roles = ["analyst"];

const chartSpec = {
  chart: "pie",
  title: "Orders by Status",
  query: {
    collection: "demo_orders",
    pipeline: [
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
    ],
  },
  x: "status",
  y: ["count"],
};

const tableSpec = {
  title: "Orders",
  query: {
    collection: "demo_orders",
    pipeline: [{ $project: { _id: 0, status: 1, total: 1 } }],
  },
  columns: [{ key: "status", label: "Status" }, { key: "total" }],
};

const exportSpec = {
  label: "Orders export",
  query: {
    collection: "demo_orders",
    pipeline: [{ $group: { _id: "$region", total: { $sum: "$total" } } }],
  },
};

test("a stacked chart spec assembles stacked and keeps stacked in the part's spec", () => {
  const stackedSpec = {
    chart: "bar",
    title: "Sales by Region and Channel",
    query: chartSpec.query,
    x: "region",
    y: ["online", "retail"],
    stacked: true,
  };
  const rows = [
    { region: "west", online: 5, retail: 3 },
    { region: "east", online: 2, retail: 4 },
  ];
  const parts = buildDataParts({
    charts: [stackedSpec],
    results: [rows],
    roles,
  });
  expect(parts).toHaveLength(1);
  const { option, spec } = parts[0].data;
  const stacks = new Set(option.series.map((series) => series.stack));
  expect(stacks.size).toBe(1);
  expect([...stacks][0]).toBeTruthy();
  expect(spec.stacked).toBe(true);
});

test("an unstacked chart part's spec carries no stacked key", () => {
  const parts = buildDataParts({
    charts: [chartSpec],
    results: [[{ status: "paid", count: 5 }]],
    roles,
  });
  expect("stacked" in parts[0].data.spec).toBe(false);
});

test("builds chart and download parts", () => {
  const rows = [
    { status: "paid", count: 5, region: "west" },
    { status: "pending", count: 2, region: "east" },
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
  expect(parts[0].data.option.series[0].data).toEqual([
    { name: "paid", value: 5 },
    { name: "pending", value: 2 },
  ]);
  expect(parts[0].data.option.series[0].type).toBe("pie");
  expect(parts[1]).toEqual({
    type: "data-report-download",
    data: { label: "Orders export", description: "", query: exportSpec.query },
  });
});

// A part is an artefact the save-as-report surface builds a report section out
// of, and a section needs a query — the baked option cannot be reversed into a
// pipeline, so the spec has to travel beside it.
test("a chart part carries the validated spec that produced it", () => {
  const parts = buildDataParts({
    charts: [chartSpec],
    results: [[{ status: "paid", count: 5 }]],
    roles,
  });
  expect(parts[0].data.spec).toEqual({
    chart: "pie",
    query: chartSpec.query,
    x: "status",
    y: ["count"],
  });
});

test("builds a table part carrying its rows, its total and its spec", () => {
  const parts = buildDataParts({
    tables: [tableSpec],
    tableResults: [
      [
        { status: "paid", total: 10 },
        { status: "pending", total: 4 },
      ],
    ],
    roles,
  });
  expect(parts).toEqual([
    {
      type: "data-report-table",
      data: {
        title: "Orders",
        rows: [
          { status: "paid", total: 10 },
          { status: "pending", total: 4 },
        ],
        row_count: 2,
        // The columns live on the spec only — the panel reads its column
        // definitions from there, and a second copy would be a second thing to
        // keep in step.
        spec: { query: tableSpec.query, columns: tableSpec.columns },
      },
    },
  ]);
});

test("retains at most 200 rows, with row_count holding the true total", () => {
  const rows = Array.from({ length: 964 }, (_, index) => ({
    status: "paid",
    total: index,
  }));
  const parts = buildDataParts({
    tables: [tableSpec],
    tableResults: [rows],
    roles,
  });
  expect(parts[0].data.rows).toHaveLength(200);
  expect(parts[0].data.rows[199]).toEqual({ status: "paid", total: 199 });
  // The number a card needs to say "first 200 of 964" rather than imply it is
  // showing everything.
  expect(parts[0].data.row_count).toBe(964);
});

test("a table part's rows carry only the declared columns, not a fat extra field", () => {
  const parts = buildDataParts({
    tables: [tableSpec],
    tableResults: [
      [
        {
          status: "paid",
          total: 10,
          meta: { region: "west", tags: ["a", "b"] },
        },
      ],
    ],
    roles,
  });
  expect(parts[0].data.rows).toEqual([{ status: "paid", total: 10 }]);
});

test("a table whose declared column is missing from its rows is skipped", () => {
  const parts = buildDataParts({
    charts: [chartSpec],
    results: [[{ status: "paid", count: 1 }]],
    tables: [{ ...tableSpec, columns: [{ key: "wrongKey" }] }, tableSpec],
    tableResults: [
      [{ status: "paid", total: 10 }],
      [{ status: "paid", total: 10 }],
    ],
    downloads: [exportSpec],
    roles,
  });
  expect(parts.map((p) => p.type)).toEqual([
    "data-report-chart",
    "data-report-table",
    "data-report-download",
  ]);
});

test("caps tables on their own budget, so tables cannot starve charts or downloads", () => {
  const chartRows = [{ status: "paid", count: 1 }];
  const tableRows = [{ status: "paid", total: 10 }];
  const parts = buildDataParts({
    charts: Array.from({ length: 8 }, () => chartSpec),
    results: Array.from({ length: 8 }, () => chartRows),
    tables: Array.from({ length: 9 }, () => tableSpec),
    tableResults: Array.from({ length: 9 }, () => tableRows),
    downloads: Array.from({ length: 8 }, () => exportSpec),
    roles,
  });
  const kinds = parts.map((p) => p.type);
  expect(kinds.filter((k) => k === "data-report-chart")).toHaveLength(8);
  // The ninth table is dropped; the eight charts and eight downloads are not.
  expect(kinds.filter((k) => k === "data-report-table")).toHaveLength(8);
  expect(kinds.filter((k) => k === "data-report-download")).toHaveLength(8);
  expect(parts).toHaveLength(24);
});

test("skips tables whose query failed (sparse tableResults)", () => {
  const parts = buildDataParts({
    tables: [tableSpec, tableSpec],
    tableResults: [undefined, [{ status: "paid", total: 10 }]],
    roles,
  });
  expect(parts).toHaveLength(1);
});

test("carries the export description through to the download part", () => {
  const parts = buildDataParts({
    downloads: [{ ...exportSpec, description: "Revenue by region" }],
    roles,
  });
  expect(parts).toEqual([
    {
      type: "data-report-download",
      data: {
        label: "Orders export",
        description: "Revenue by region",
        query: exportSpec.query,
      },
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
      {
        chart: "scatter3d",
        title: "X",
        query: chartSpec.query,
        x: "status",
        y: ["count"],
      },
      chartSpec,
    ],
    results: [[], rows],
    downloads: [exportSpec],
    roles,
  });
  expect(parts.map((p) => p.type)).toEqual([
    "data-report-chart",
    "data-report-download",
  ]);
  expect(parts[0].data.title).toBe("Orders by Status");
});

test("a chart whose declared column is missing from its rows is skipped", () => {
  const parts = buildDataParts({
    charts: [chartSpec, chartSpec],
    results: [
      [{ status: "paid", wrongKey: 5 }],
      [{ status: "paid", count: 1 }],
    ],
    roles,
  });
  expect(parts).toHaveLength(1);
  expect(parts[0].data.option.series[0].data).toEqual([
    { name: "paid", value: 1 },
  ]);
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
  expect(empty[0].data.option.series[0].data).toEqual([]);

  const withNulls = buildDataParts({
    charts: [chartSpec],
    results: [[{ status: null, count: null }]],
    roles,
  });
  expect(withNulls).toHaveLength(1);
});

test("a chart part's option carries only the contract's columns, not a fat extra field", () => {
  const parts = buildDataParts({
    charts: [chartSpec],
    results: [
      [
        {
          status: "paid",
          count: 5,
          meta: { region: "west", tags: ["a", "b"] },
        },
      ],
    ],
    roles,
  });
  expect(parts).toHaveLength(1);
  expect(parts[0].data.option.series[0].data).toEqual([
    { name: "paid", value: 5 },
  ]);
});

// The part is persisted and travels through JSON on the way to the panel, so a
// private `_`-key or a formatter function would either break the round trip or
// be frozen into every stored conversation.
test("a chart part carries a numeric height and a JSON-safe option", () => {
  const parts = buildDataParts({
    charts: [chartSpec],
    results: [[{ status: "paid", count: 5 }]],
    roles,
  });
  expect(typeof parts[0].data.height).toBe("number");
  expect(parts[0].data.option.dataset).toBeUndefined();
  expect(
    Object.keys(parts[0].data.option).filter((key) => key.startsWith("_")),
  ).toEqual([]);
  expect(parts[0].data.option).toEqual(
    JSON.parse(JSON.stringify(parts[0].data.option)),
  );
});

test("a contract-shaped export payload is skipped, not thrown", () => {
  const parts = buildDataParts({
    downloads: [{ ...exportSpec, columns: [{ key: "region" }] }, exportSpec],
    roles,
  });
  expect(parts).toHaveLength(1);
  expect(parts[0].data.label).toBe("Orders export");
});
