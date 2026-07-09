import validateReportSpec from "./validateReportSpec.js";
import testDatasets from "./testDatasets.js";

const roles = ["analyst"];

const designExampleSpec = {
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
      query: {
        dataset: "orders",
        select: ["region", "status"],
        measures: [
          { id: "total", agg: "sum" },
          { id: "count", agg: "count" },
        ],
      },
      filterBy: ["status"],
    },
    {
      type: "download",
      label: "Download CSV",
      query: { dataset: "orders", select: ["region", "status"], measures: [{ id: "total", agg: "sum" }] },
    },
  ],
};

test("validates the design example and assigns positional ids", () => {
  const result = validateReportSpec({ spec: designExampleSpec, datasets: testDatasets, roles });
  expect(result.sections.map((s) => s.id)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
  expect(result.sections[0].valueKey).toBe("total_sum");
  // Table columns are descriptors: enum dimensions (with `values`) tag, measures
  // carry type/format so the renderer can format them.
  expect(result.sections[3].columns).toEqual([
    { key: "region", tag: false },
    { key: "status", tag: true },
    { key: "total_sum", measure: true, type: "number", format: "currency", currency: "ZAR", locale: "en-ZA" },
    { key: "count_count", measure: true, type: "count", format: null, currency: null, locale: null },
  ]);
  // Select filter without explicit options resolves them from dimension values.
  expect(result.sections[2].options).toEqual(["pending", "paid", "shipped", "cancelled"]);
});

test("rejects more than 12 sections", () => {
  const sections = Array.from({ length: 13 }, () => ({
    type: "markdown",
    content: "hello",
  }));
  expect(() =>
    validateReportSpec({ spec: { title: "Big", sections }, datasets: testDatasets, roles })
  ).toThrow(/at most 12 sections/);
});

test("rejects unknown section type", () => {
  expect(() =>
    validateReportSpec({
      spec: { title: "T", sections: [{ type: "iframe", label: "X" }] },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/type "iframe" is not one of/);
});

test("rejects labels over 200 characters", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "kpi",
            label: "x".repeat(201),
            query: { dataset: "orders", measures: [{ id: "total", agg: "sum" }] },
          },
        ],
      },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/label exceeds 200 characters/);
});

test("rejects filterBy referencing a missing filter section", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "table",
            label: "Orders",
            query: { dataset: "orders", select: ["region"] },
            filterBy: ["status"],
          },
        ],
      },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/no filter section with that field/);
});

test("rejects filterBy field that is not a dimension of the section's dataset", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          { type: "filter", control: "select", field: "plan", label: "Plan" },
          {
            type: "table",
            label: "Orders",
            query: { dataset: "orders", select: ["region"] },
            filterBy: ["plan"],
          },
        ],
      },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/"plan" is not a dimension of dataset "orders"/);
});

test("rejects unbound filter sections", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          { type: "filter", control: "select", field: "status", label: "Status" },
          {
            type: "table",
            label: "Orders",
            query: { dataset: "orders", select: ["region"] },
          },
        ],
      },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/not bound by any section/);
});

test("daterange control requires a date dimension", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          { type: "filter", control: "daterange", field: "status", label: "Status" },
          {
            type: "table",
            label: "Orders",
            query: { dataset: "orders", select: ["region"] },
            filterBy: ["status"],
          },
        ],
      },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/daterange control but the dimension is not a date/);
});

test("select filter with no options and no dimension values is rejected", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          { type: "filter", control: "select", field: "region", label: "Region" },
          {
            type: "table",
            label: "Orders",
            query: { dataset: "orders", select: ["region"] },
            filterBy: ["region"],
          },
        ],
      },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/has no options/);
});

test("dataset roles are enforced through section queries", () => {
  expect(() =>
    validateReportSpec({ spec: designExampleSpec, datasets: testDatasets, roles: ["viewer"] })
  ).toThrow(/not authorized/);
});
