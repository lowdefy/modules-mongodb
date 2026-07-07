import validateQuerySpec from "./validateQuerySpec.js";
import testDatasets from "./testDatasets.js";

const roles = ["analyst"];

test("valid spec normalizes with measure keys and default limit", () => {
  const result = validateQuerySpec({
    spec: {
      dataset: "orders",
      select: ["region"],
      measures: [
        { id: "total", agg: "sum" },
        { id: "count", agg: "count" },
      ],
      filters: [{ field: "status", op: "eq", value: "paid" }],
      sort: [{ field: "total_sum", dir: "desc" }],
    },
    datasets: testDatasets,
    roles,
  });
  expect(result.dataset.id).toBe("orders");
  expect(result.measures).toEqual([
    { id: "total", agg: "sum", key: "total_sum", type: "number" },
    { id: "count", agg: "count", key: "count_count", type: "count" },
  ]);
  expect(result.limit).toBe(100);
  expect(result.sort).toEqual([{ field: "total_sum", dir: "desc" }]);
});

test("unknown dataset lists available datasets", () => {
  expect(() =>
    validateQuerySpec({ spec: { dataset: "nope" }, datasets: testDatasets, roles })
  ).toThrow(/dataset "nope" does not exist.*orders, signups/);
});

test("dataset roles gate rejects unauthorized user", () => {
  expect(() =>
    validateQuerySpec({
      spec: { dataset: "orders", select: ["region"] },
      datasets: testDatasets,
      roles: ["viewer"],
    })
  ).toThrow(/not authorized to query dataset "orders"/);
});

test("dataset without roles is open to any user", () => {
  const result = validateQuerySpec({
    spec: { dataset: "signups", select: ["plan"] },
    datasets: testDatasets,
    roles: [],
  });
  expect(result.dataset.id).toBe("signups");
});

test("unknown select dimension is rejected", () => {
  expect(() =>
    validateQuerySpec({
      spec: { dataset: "orders", select: ["password"] },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/select references dimension "password"/);
});

test("disallowed aggregation is rejected", () => {
  expect(() =>
    validateQuerySpec({
      spec: { dataset: "orders", measures: [{ id: "total", agg: "count" }] },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/measure "total" does not allow aggregation "count"/);
});

test("count measure only allows count", () => {
  expect(() =>
    validateQuerySpec({
      spec: { dataset: "orders", measures: [{ id: "count", agg: "sum" }] },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/measure "count" does not allow aggregation "sum"/);
});

test("filter op must match the field type", () => {
  expect(() =>
    validateQuerySpec({
      spec: {
        dataset: "orders",
        select: ["region"],
        filters: [{ field: "status", op: "gt", value: "paid" }],
      },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/does not allow op "gt"/);
});

test("filter value must match the field type", () => {
  expect(() =>
    validateQuerySpec({
      spec: {
        dataset: "orders",
        select: ["region"],
        filters: [{ field: "status", op: "eq", value: 42 }],
      },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/value must be a string/);
});

test("null-valued filters are dropped (unset report filter controls)", () => {
  const result = validateQuerySpec({
    spec: {
      dataset: "orders",
      select: ["region"],
      filters: [{ field: "status", op: "eq", value: null }],
    },
    datasets: testDatasets,
    roles,
  });
  expect(result.filters).toEqual([]);
});

test("unknown filter field is rejected", () => {
  expect(() =>
    validateQuerySpec({
      spec: {
        dataset: "orders",
        select: ["region"],
        filters: [{ field: "$where", op: "eq", value: "x" }],
      },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/not a filterable field/);
});

test("sort must reference an output column", () => {
  expect(() =>
    validateQuerySpec({
      spec: {
        dataset: "orders",
        select: ["region"],
        measures: [{ id: "total", agg: "sum" }],
        sort: [{ field: "total", dir: "desc" }],
      },
      datasets: testDatasets,
      roles,
    })
  ).toThrow(/sort field "total" is not an output column.*total_sum/);
});

test("limit is clamped to 1000", () => {
  const result = validateQuerySpec({
    spec: { dataset: "orders", select: ["region"], limit: 999999 },
    datasets: testDatasets,
    roles,
  });
  expect(result.limit).toBe(1000);
});

test("spec must request a dimension or measure", () => {
  expect(() =>
    validateQuerySpec({ spec: { dataset: "orders" }, datasets: testDatasets, roles })
  ).toThrow(/at least one select dimension or one measure/);
});

test("dictionary field ids must be plain identifiers", () => {
  const evil = [
    {
      id: "evil",
      source: { collection: "evil" },
      dimensions: [{ id: "$out", type: "string" }],
      measures: [],
    },
  ];
  expect(() =>
    validateQuerySpec({ spec: { dataset: "evil", select: ["$out"] }, datasets: evil, roles })
  ).toThrow(/field id "\$out" is not a valid identifier/);
});
