import validateReportSpec from "./validateReportSpec.js";
import testCatalog from "./testDatasets.js";

const roles = ["analyst"];

// A raw `{ collection, pipeline }` query against the open (unrestricted)
// demo_orders collection — grouped totals by region.
const ordersByRegion = {
  collection: "demo_orders",
  pipeline: [{ $group: { _id: "$region", total: { $sum: "$total" } } }, { $project: { _id: 0, region: "$_id", total: 1 } }],
};
const orderTotal = {
  collection: "demo_orders",
  pipeline: [{ $group: { _id: null, total: { $sum: "$total" } } }],
};

const designExampleSpec = {
  title: "Q2 Revenue by Region",
  description: "Revenue and order counts, filterable by status.",
  sections: [
    { type: "kpi", label: "Total Revenue", query: orderTotal, valueKey: "total", format: { style: "currency", currency: "USD" } },
    { type: "chart", chart: "bar", label: "Revenue by Region", query: ordersByRegion, x: "region", y: ["total"] },
    { type: "filter", control: "select", field: "status", label: "Status" },
    {
      type: "table",
      label: "Orders",
      query: ordersByRegion,
      columns: [{ key: "region", label: "Region" }, { key: "total", label: "Total", format: { style: "currency", currency: "USD" } }],
      filterBy: ["status"],
    },
    { type: "download", label: "Download CSV", query: ordersByRegion },
  ],
};

test("validates the design example and assigns positional ids", () => {
  const result = validateReportSpec({ spec: designExampleSpec, catalog: testCatalog, roles });
  expect(result.sections.map((s) => s.id)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
  expect(result.sections[0].valueKey).toBe("total");
  expect(result.sections[0].format).toEqual({ style: "currency", currency: "USD" });
  expect(result.sections[1].x).toBe("region");
  expect(result.sections[1].y).toEqual(["total"]);
  // Table columns are contract descriptors — no `tag` flag.
  expect(result.sections[3].columns).toEqual([
    { key: "region", label: "Region" },
    { key: "total", label: "Total", format: { style: "currency", currency: "USD" } },
  ]);
});

test("validates without a catalog (resolve-time inert check, no pipeline gate)", () => {
  const result = validateReportSpec({ spec: designExampleSpec, roles });
  expect(result.sections.map((s) => s.id)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
});

test("rejects a table column carrying a tag key", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          { type: "table", label: "Orders", query: ordersByRegion, columns: [{ key: "region", tag: true }] },
        ],
      },
      catalog: testCatalog,
      roles,
    })
  ).toThrow(/unexpected key "tag"/);
});

test("rejects a chart section missing x/y", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [{ type: "chart", chart: "bar", label: "C", query: ordersByRegion, y: ["total"] }],
      },
      catalog: testCatalog,
      roles,
    })
  ).toThrow(/x must be a non-empty column name/);
});

test("rejects a kpi section missing valueKey", () => {
  expect(() =>
    validateReportSpec({
      spec: { title: "T", sections: [{ type: "kpi", label: "K", query: orderTotal }] },
      catalog: testCatalog,
      roles,
    })
  ).toThrow(/requires a valueKey/);
});

test("rejects an invalid format descriptor", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [{ type: "kpi", label: "K", query: orderTotal, valueKey: "total", format: { style: "percent" } }],
      },
      catalog: testCatalog,
      roles,
    })
  ).toThrow(/format.style "percent" is not one of/);
});

test("rejects more than 12 sections", () => {
  const sections = Array.from({ length: 13 }, () => ({ type: "markdown", content: "hello" }));
  expect(() =>
    validateReportSpec({ spec: { title: "Big", sections }, catalog: testCatalog, roles })
  ).toThrow(/at most 12 sections/);
});

test("rejects unknown section type", () => {
  expect(() =>
    validateReportSpec({
      spec: { title: "T", sections: [{ type: "iframe", label: "X" }] },
      catalog: testCatalog,
      roles,
    })
  ).toThrow(/type "iframe" is not one of/);
});

test("rejects labels over 200 characters", () => {
  expect(() =>
    validateReportSpec({
      spec: { title: "T", sections: [{ type: "kpi", label: "x".repeat(201), query: orderTotal, valueKey: "total" }] },
      catalog: testCatalog,
      roles,
    })
  ).toThrow(/label exceeds 200 characters/);
});

test("rejects filterBy referencing a missing filter section", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [{ type: "table", label: "Orders", query: ordersByRegion, columns: [{ key: "region" }], filterBy: ["status"] }],
      },
      catalog: testCatalog,
      roles,
    })
  ).toThrow(/no filter section with that field/);
});

test("rejects a '$'-prefixed filter field", () => {
  expect(() =>
    validateReportSpec({
      spec: { title: "T", sections: [{ type: "filter", control: "select", field: "$where", label: "X", options: ["a"] }] },
      catalog: testCatalog,
      roles,
    })
  ).toThrow(/requires a field/);
});

test("rejects unbound filter sections", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          { type: "filter", control: "select", field: "status", label: "Status" },
          { type: "table", label: "Orders", query: ordersByRegion, columns: [{ key: "region" }] },
        ],
      },
      catalog: testCatalog,
      roles,
    })
  ).toThrow(/not bound by any section/);
});

test("select filter with no options and no catalog values is rejected (at persist)", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          { type: "filter", control: "select", field: "month", label: "Month" },
          { type: "table", label: "Orders", query: ordersByRegion, columns: [{ key: "region" }], filterBy: ["month"] },
        ],
      },
      catalog: testCatalog,
      roles,
    })
  ).toThrow(/has no options/);
});

test("select filter resolves against a catalog field's enum values (no throw)", () => {
  const result = validateReportSpec({
    spec: {
      title: "T",
      sections: [
        { type: "filter", control: "select", field: "status", label: "Status" },
        { type: "table", label: "Orders", query: ordersByRegion, columns: [{ key: "region" }], filterBy: ["status"] },
      ],
    },
    catalog: testCatalog,
    roles,
  });
  expect(result.sections[0].type).toBe("filter");
});

test("collection roles are enforced through section queries (validate-before-persist)", () => {
  const spec = {
    title: "Companies",
    sections: [
      { type: "table", label: "Companies", query: { collection: "demo_companies", pipeline: [{ $project: { name: 1 } }] }, columns: [{ key: "name" }] },
    ],
  };
  // demo_companies is role-gated; a viewer lacking the role is rejected.
  expect(() => validateReportSpec({ spec, catalog: testCatalog, roles: ["viewer"] })).toThrow(/not authorized/);
});

test("export validator rejects a contract payload", async () => {
  const { default: validateExportSpec } = await import("./validateExportSpec.js");
  expect(() =>
    validateExportSpec({ spec: { query: ordersByRegion, columns: [{ key: "region" }] }, catalog: testCatalog, roles })
  ).toThrow(/exports carry no presentation contract/);
});
