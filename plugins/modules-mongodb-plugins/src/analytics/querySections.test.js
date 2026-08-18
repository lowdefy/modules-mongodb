import querySections, { orderedQueries } from "./querySections.js";
import validateReportSpec from "./validateReportSpec.js";

const roles = ["analyst"];

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
const regionOptions = {
  collection: "demo_orders",
  pipeline: [{ $group: { _id: "$region", label: { $first: "$region" } } }],
};

// A filter's optionsQuery section (s1) sits between a kpi (s0) and a table
// (s3) — orderedQueries must interleave its entry at that spec position, not
// group all data-section entries first. Two other filters (s2: declared
// `options`, s4: daterange, neither carrying optionsQuery) must contribute
// nothing.
const spec = {
  title: "Regional Revenue",
  sections: [
    {
      type: "kpi",
      label: "Total Revenue",
      query: orderTotal,
      valueKey: "total",
      filterBy: ["region"],
    },
    {
      type: "filter",
      control: "select",
      field: "region",
      label: "Region",
      optionsQuery: { ...regionOptions, valueKey: "_id", labelKey: "label" },
    },
    {
      type: "filter",
      control: "select",
      field: "status",
      label: "Status",
      options: ["pending", "paid"],
    },
    {
      type: "table",
      label: "Orders",
      query: ordersByRegion,
      columns: [{ key: "region" }, { key: "total" }],
      filterBy: ["status", "order_date"],
    },
    {
      type: "filter",
      control: "daterange",
      field: "order_date",
      label: "Created",
    },
  ],
};

test("interleaves a filter's optionsQuery entry between data sections, in spec order", () => {
  const entries = querySections({ spec, roles });
  expect(entries.map((e) => e.id)).toEqual(["s0", "s1", "s3"]);
  expect(entries[0]).toEqual({ id: "s0", type: "kpi", query: orderTotal });
  expect(entries[1]).toEqual({
    id: "s1",
    type: "filter",
    query: regionOptions,
  });
  expect(entries[2]).toEqual({
    id: "s3",
    type: "table",
    query: ordersByRegion,
  });
});

test("a filter with declared options, or a daterange filter, contributes no entry", () => {
  const entries = querySections({ spec, roles });
  expect(entries.some((e) => e.id === "s2")).toBe(false);
  expect(entries.some((e) => e.id === "s4")).toBe(false);
});

test("orderedQueries operates on already-normalized sections", () => {
  const { sections } = validateReportSpec({ spec, roles });
  expect(orderedQueries(sections).map((e) => e.id)).toEqual(["s0", "s1", "s3"]);
});
