import validateTableSpec from "./validateTableSpec.js";
import testCatalog from "./testDatasets.js";
import { MAX_LABEL_LENGTH } from "./constants.js";

const roles = ["analyst"];

const ordersByRegion = {
  collection: "demo_orders",
  pipeline: [
    { $group: { _id: "$region", total: { $sum: "$total" } } },
    { $project: { _id: 0, region: "$_id", total: 1 } },
  ],
};

const validSpec = {
  title: "Orders",
  query: ordersByRegion,
  columns: [
    { key: "region", label: "Region" },
    {
      key: "total",
      label: "Total",
      format: { style: "currency", currency: "USD" },
    },
  ],
};

test("validates a table spec and returns the normalized shape", () => {
  const result = validateTableSpec({
    spec: validSpec,
    catalog: testCatalog,
    roles,
  });
  expect(result).toEqual({
    title: "Orders",
    query: ordersByRegion,
    columns: [
      { key: "region", label: "Region" },
      {
        key: "total",
        label: "Total",
        format: { style: "currency", currency: "USD" },
      },
    ],
  });
});

test("an absent optional is absent in the output, and a null label reads as absent", () => {
  const result = validateTableSpec({
    spec: {
      title: "Orders",
      query: ordersByRegion,
      columns: [{ key: "region", label: null }],
    },
    catalog: testCatalog,
    roles,
  });
  expect("label" in result.columns[0]).toBe(false);
  expect("format" in result.columns[0]).toBe(false);
});

test("a spec with a catalog runs the pipeline gate", () => {
  expect(() =>
    validateTableSpec({
      spec: {
        title: "Companies",
        query: {
          collection: "demo_companies",
          pipeline: [{ $project: { name: 1 } }],
        },
        columns: [{ key: "name" }],
      },
      catalog: testCatalog,
      roles: ["viewer"],
    }),
  ).toThrow(/not authorized/);
});

test("a spec without a catalog skips the pipeline gate (shape checks only)", () => {
  const result = validateTableSpec({
    spec: {
      title: "Companies",
      query: {
        collection: "demo_companies",
        pipeline: [{ $project: { name: 1 } }],
      },
      columns: [{ key: "name" }],
    },
    roles: ["viewer"],
  });
  expect(result.query.collection).toBe("demo_companies");
});

test.each([
  ["spec is missing", undefined, /spec must be an object/],
  ["spec is an array", [], /spec must be an object/],
  ["title is missing", { query: ordersByRegion, columns: [{ key: "region" }] }, /title is required/],
  [
    "title is blank",
    { title: "", query: ordersByRegion, columns: [{ key: "region" }] },
    /title is required/,
  ],
  [
    "title is over the label cap",
    {
      title: "x".repeat(MAX_LABEL_LENGTH + 1),
      query: ordersByRegion,
      columns: [{ key: "region" }],
    },
    /title exceeds 200 characters/,
  ],
  [
    "columns is empty",
    { title: "Orders", query: ordersByRegion, columns: [] },
    /columns must be a non-empty array/,
  ],
  [
    "columns is missing",
    { title: "Orders", query: ordersByRegion },
    /columns must be a non-empty array/,
  ],
  [
    "a column has no key",
    { title: "Orders", query: ordersByRegion, columns: [{ label: "Region" }] },
    /column 0 requires a key/,
  ],
  [
    "a column carries an unexpected key",
    {
      title: "Orders",
      query: ordersByRegion,
      columns: [{ key: "region", tag: true }],
    },
    /column 0 has an unexpected key "tag"/,
  ],
  [
    "a column key is over the label cap",
    {
      title: "Orders",
      query: ordersByRegion,
      columns: [{ key: "x".repeat(MAX_LABEL_LENGTH + 1) }],
    },
    /column 0 key exceeds 200 characters/,
  ],
  [
    "a column format has a bad style",
    {
      title: "Orders",
      query: ordersByRegion,
      columns: [{ key: "total", format: { style: "percent" } }],
    },
    /format.style "percent" is not one of/,
  ],
])("rejects a spec where %s", (_name, spec, message) => {
  expect(() =>
    validateTableSpec({ spec, catalog: testCatalog, roles }),
  ).toThrow(message);
});

test("every thrown message carries the 'Invalid table spec:' prefix", () => {
  expect(() =>
    validateTableSpec({
      spec: { title: "", query: ordersByRegion, columns: [{ key: "region" }] },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/^Invalid table spec: /);
});
