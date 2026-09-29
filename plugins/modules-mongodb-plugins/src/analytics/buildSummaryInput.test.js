import buildSummaryInput, { NO_FILTERS_SCOPE } from "./buildSummaryInput.js";
import summaryQueries from "./summaryQueries.js";
import { MAX_SUMMARY_ROWS_PER_SECTION } from "./constants.js";

const roles = ["analyst"];

const ordersByRegion = {
  collection: "demo_orders",
  pipeline: [
    { $group: { _id: "$region", total: { $sum: "$total" } } },
    { $project: { _id: 0, region: "$_id", total: 1 } },
  ],
};

const spec = {
  title: "Revenue",
  description: "Revenue by region.",
  sections: [
    {
      type: "kpi",
      label: "Total revenue",
      query: ordersByRegion,
      valueKey: "total",
      filterBy: ["region", "order_date"],
    },
    {
      type: "filter",
      control: "multiselect",
      field: "region",
      label: "Region",
      options: ["EU", "US"],
    },
    {
      type: "filter",
      control: "daterange",
      field: "order_date",
      label: "Order date",
    },
    {
      type: "filter",
      control: "select",
      field: "company_id",
      label: "Company",
      optionsQuery: {
        collection: "demo_companies",
        pipeline: [{ $project: { _id: 1, name: 1 } }],
        valueKey: "_id",
        labelKey: "name",
      },
    },
    {
      type: "chart",
      chart: "bar",
      label: "Revenue by region",
      query: ordersByRegion,
      x: "region",
      y: ["total"],
      filterBy: ["company_id"],
    },
    { type: "markdown", content: "## Notes" },
    {
      type: "table",
      label: "Orders",
      query: ordersByRegion,
      columns: [{ key: "region" }, { key: "total" }],
    },
    { type: "download", label: "Download CSV", query: ordersByRegion },
  ],
};

// summaryQueries order: kpi, company optionsQuery, chart, table.
const kpiRows = [{ total: 4200 }];
const companyRows = [
  { _id: "c1", name: "Acme" },
  { _id: "c2", name: "Globex" },
];
const chartRows = [
  { region: "EU", total: 2500 },
  { region: "US", total: 1700 },
];
const tableRows = [{ region: "EU", total: 2500 }];

describe("summaryQueries", () => {
  test("one entry per data section and optionsQuery, in spec order, each with its own filters", () => {
    const queries = summaryQueries({
      spec,
      roles,
      filterValues: {
        region: ["EU"],
        order_date: ["2026-01-01", "2026-03-31"],
        company_id: "c1",
      },
    });
    expect(queries.map((q) => q.type)).toEqual([
      "kpi",
      "filter",
      "chart",
      "table",
    ]);
    // The kpi subscribes to region and order_date: a multiselect becomes one
    // `in` triple, a daterange a gte/lte pair over the two ends.
    expect(queries[0].filters).toEqual([
      { field: "region", op: "in", value: ["EU"] },
      { field: "order_date", op: "gte", value: "2026-01-01" },
      { field: "order_date", op: "lte", value: "2026-03-31" },
    ]);
    // An optionsQuery runs unfiltered — its rows are the label source.
    expect(queries[1].filters).toEqual([]);
    // The chart subscribes to the select alone.
    expect(queries[2].filters).toEqual([
      { field: "company_id", op: "eq", value: "c1" },
    ]);
    // The table binds nothing, so nothing constrains it whatever is selected.
    expect(queries[3].filters).toEqual([]);
  });

  test("an untouched control yields null-valued triples, which the pipeline drops", () => {
    const queries = summaryQueries({ spec, roles, filterValues: {} });
    expect(queries[0].filters).toEqual([
      { field: "region", op: "in", value: null },
      { field: "order_date", op: "gte", value: null },
      { field: "order_date", op: "lte", value: null },
    ]);
  });

  test("a multiselect with match all compiles to the all op", () => {
    const allSpec = {
      title: "Tags",
      sections: [
        {
          type: "table",
          label: "Tagged",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: ["tags"],
        },
        {
          type: "filter",
          control: "multiselect",
          field: "tags",
          label: "Tags",
          match: "all",
          options: ["a", "b"],
        },
      ],
    };
    const [table] = summaryQueries({
      spec: allSpec,
      roles,
      filterValues: { tags: ["a", "b"] },
    });
    expect(table.filters).toEqual([
      { field: "tags", op: "all", value: ["a", "b"] },
    ]);
  });

  test("a value for a field no filter declares is ignored", () => {
    const queries = summaryQueries({
      spec,
      roles,
      filterValues: { $where: "1", status: "paid" },
    });
    for (const query of queries) {
      expect(query.filters.map((f) => f.field)).not.toContain("$where");
      expect(query.filters.map((f) => f.field)).not.toContain("status");
    }
  });
});

describe("buildSummaryInput", () => {
  test("shapes data sections in spec order with their contract keys, keeps markdown, drops downloads", () => {
    const input = buildSummaryInput({
      spec,
      results: [kpiRows, companyRows, chartRows, tableRows],
      filterValues: {},
      roles,
    });
    expect(input.title).toBe("Revenue");
    expect(input.description).toBe("Revenue by region.");
    expect(input.sections.map((s) => s.type)).toEqual([
      "kpi",
      "chart",
      "markdown",
      "table",
    ]);
    const [kpi, chart, markdown, table] = input.sections;
    expect(kpi).toMatchObject({
      label: "Total revenue",
      valueKey: "total",
      rows: kpiRows,
      rowCount: 1,
      truncated: false,
    });
    expect(chart).toMatchObject({ chart: "bar", x: "region", y: ["total"] });
    expect(markdown).toEqual({
      id: markdown.id,
      type: "markdown",
      content: "## Notes",
    });
    expect(table.columns).toEqual(["region", "total"]);
    expect(input.excluded).toEqual([]);
  });

  test("no active filters reads as the whole dataset", () => {
    const input = buildSummaryInput({
      spec,
      results: [kpiRows, companyRows, chartRows, tableRows],
      filterValues: { region: [], order_date: null },
      roles,
    });
    expect(input.hasFilters).toBe(false);
    expect(input.scope).toBe(NO_FILTERS_SCOPE);
  });

  test("the scope names each active filter by its label, ids by their option label, dates as dates", () => {
    const input = buildSummaryInput({
      spec,
      results: [kpiRows, companyRows, chartRows, tableRows],
      filterValues: {
        region: ["EU", "US"],
        order_date: [new Date("2026-01-01"), "2026-03-31T00:00:00.000Z"],
        company_id: "c2",
      },
      roles,
    });
    expect(input.hasFilters).toBe(true);
    expect(input.scope).toBe(
      "Region: EU, US · Order date: 1 January 2026 – 31 March 2026 · Company: Globex",
    );
  });

  test("a half-open date range says which end is set", () => {
    const from = buildSummaryInput({
      spec,
      results: [kpiRows, companyRows, chartRows, tableRows],
      filterValues: { order_date: ["2026-01-01", null] },
      roles,
    });
    expect(from.scope).toBe("Order date: from 1 January 2026");
    const until = buildSummaryInput({
      spec,
      results: [kpiRows, companyRows, chartRows, tableRows],
      filterValues: { order_date: [null, "2026-03-31"] },
      roles,
    });
    expect(until.scope).toBe("Order date: until 31 March 2026");
  });

  test("an id its options query cannot label falls back to the raw value, including when that query failed", () => {
    const unknown = buildSummaryInput({
      spec,
      results: [kpiRows, companyRows, chartRows, tableRows],
      filterValues: { company_id: "c9" },
      roles,
    });
    expect(unknown.scope).toBe("Company: c9");
    // The options query's slot is empty: it failed inside :try.
    const failed = buildSummaryInput({
      spec,
      results: [kpiRows, undefined, chartRows, tableRows],
      filterValues: { company_id: "c1" },
      roles,
    });
    expect(failed.scope).toBe("Company: c1");
    // A failed OPTIONS query excludes nothing — it is not a data section.
    expect(failed.excluded).toEqual([]);
  });

  test("a failed data section is left out and named in excluded", () => {
    const input = buildSummaryInput({
      spec,
      results: { 0: kpiRows, 1: companyRows, 3: tableRows },
      filterValues: {},
      roles,
    });
    expect(input.sections.map((s) => s.type)).toEqual([
      "kpi",
      "markdown",
      "table",
    ]);
    expect(input.excluded).toEqual(["Revenue by region"]);
  });

  test("rows are capped per section and the truncation is disclosed", () => {
    const many = Array.from(
      { length: MAX_SUMMARY_ROWS_PER_SECTION + 50 },
      (_, i) => ({ region: `r${i}`, total: i }),
    );
    const input = buildSummaryInput({
      spec,
      results: [kpiRows, companyRows, chartRows, many],
      filterValues: {},
      roles,
    });
    const table = input.sections.find((s) => s.type === "table");
    expect(table.rows).toHaveLength(MAX_SUMMARY_ROWS_PER_SECTION);
    expect(table.rowCount).toBe(MAX_SUMMARY_ROWS_PER_SECTION + 50);
    expect(table.truncated).toBe(true);
  });
});
