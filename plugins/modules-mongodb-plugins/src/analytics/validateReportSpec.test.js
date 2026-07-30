import validateReportSpec from "./validateReportSpec.js";
import testCatalog from "./testDatasets.js";
import { MAX_SECTIONS } from "./constants.js";

const roles = ["analyst"];

// A raw `{ collection, pipeline }` query against the open (unrestricted)
// demo_orders collection — grouped totals by region.
const ordersByRegion = {
  collection: "demo_orders",
  pipeline: [
    { $group: { _id: "$region", total: { $sum: "$total" } } },
    { $project: { _id: 0, region: "$_id", total: 1 } },
  ],
};
const orderTotal = {
  collection: "demo_orders",
  pipeline: [{ $group: { _id: null, total: { $sum: "$total" } } }],
};

const designExampleSpec = {
  title: "Q2 Revenue by Region",
  description: "Revenue and order counts, filterable by status.",
  sections: [
    {
      type: "kpi",
      label: "Total Revenue",
      query: orderTotal,
      valueKey: "total",
      format: { style: "currency", currency: "USD" },
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
        {
          key: "total",
          label: "Total",
          format: { style: "currency", currency: "USD" },
        },
      ],
      filterBy: ["status"],
    },
    { type: "download", label: "Download CSV", query: ordersByRegion },
  ],
};

test("validates the design example and assigns positional ids", () => {
  const result = validateReportSpec({
    spec: designExampleSpec,
    catalog: testCatalog,
    roles,
  });
  expect(result.sections.map((s) => s.id)).toEqual([
    "s0",
    "s1",
    "s2",
    "s3",
    "s4",
  ]);
  expect(result.sections[0].valueKey).toBe("total");
  expect(result.sections[0].format).toEqual({
    style: "currency",
    currency: "USD",
  });
  expect(result.sections[1].x).toBe("region");
  expect(result.sections[1].y).toEqual(["total"]);
  // Table columns are contract descriptors — no `tag` flag.
  expect(result.sections[3].columns).toEqual([
    { key: "region", label: "Region" },
    {
      key: "total",
      label: "Total",
      format: { style: "currency", currency: "USD" },
    },
  ]);
});

test("validates without a catalog (resolve-time inert check, no pipeline gate)", () => {
  const result = validateReportSpec({ spec: designExampleSpec, roles });
  expect(result.sections.map((s) => s.id)).toEqual([
    "s0",
    "s1",
    "s2",
    "s3",
    "s4",
  ]);
});

test("rejects a table column carrying a tag key", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "table",
            label: "Orders",
            query: ordersByRegion,
            columns: [{ key: "region", tag: true }],
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/unexpected key "tag"/);
});

test("rejects a chart section missing x/y", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "chart",
            chart: "bar",
            label: "C",
            query: ordersByRegion,
            y: ["total"],
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/x must be a non-empty column name/);
});

test("rejects a kpi section missing valueKey", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [{ type: "kpi", label: "K", query: orderTotal }],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/requires a valueKey/);
});

test("rejects an invalid format descriptor", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "kpi",
            label: "K",
            query: orderTotal,
            valueKey: "total",
            format: { style: "percent" },
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/format.style "percent" is not one of/);
});

test("rejects more sections than the cap", () => {
  const sections = Array.from({ length: MAX_SECTIONS + 1 }, () => ({
    type: "markdown",
    content: "hello",
  }));
  expect(() =>
    validateReportSpec({
      spec: { title: "Big", sections },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/at most \d+ sections/);
});

test("rejects unknown section type", () => {
  expect(() =>
    validateReportSpec({
      spec: { title: "T", sections: [{ type: "iframe", label: "X" }] },
      catalog: testCatalog,
      roles,
    }),
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
            query: orderTotal,
            valueKey: "total",
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
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
            query: ordersByRegion,
            columns: [{ key: "region" }],
            filterBy: ["status"],
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/no filter section with that field/);
});

test("rejects a '$'-prefixed filter field", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "select",
            field: "$where",
            label: "X",
            options: ["a"],
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/requires a field/);
});

test("rejects unbound filter sections", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "select",
            field: "status",
            label: "Status",
          },
          {
            type: "table",
            label: "Orders",
            query: ordersByRegion,
            columns: [{ key: "region" }],
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/not bound by any section/);
});

test("select filter with no options and no catalog values is rejected (at persist)", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          { type: "filter", control: "select", field: "month", label: "Month" },
          {
            type: "table",
            label: "Orders",
            query: ordersByRegion,
            columns: [{ key: "region" }],
            filterBy: ["month"],
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/has no options/);
});

test("select filter resolves against a catalog field's enum values (no throw)", () => {
  const result = validateReportSpec({
    spec: {
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
      {
        type: "table",
        label: "Companies",
        query: {
          collection: "demo_companies",
          pipeline: [{ $project: { name: 1 } }],
        },
        columns: [{ key: "name" }],
      },
    ],
  };
  // demo_companies is role-gated; a viewer lacking the role is rejected.
  expect(() =>
    validateReportSpec({ spec, catalog: testCatalog, roles: ["viewer"] }),
  ).toThrow(/not authorized/);
});

test("export validator rejects a contract payload", async () => {
  const { default: validateExportSpec } =
    await import("./validateExportSpec.js");
  expect(() =>
    validateExportSpec({
      spec: { query: ordersByRegion, columns: [{ key: "region" }] },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/exports carry no presentation contract/);
});

const regionOptionsQuery = {
  collection: "demo_orders",
  pipeline: [
    { $group: { _id: "$region" } },
    { $project: { _id: 0, value: "$_id", label: "$_id" } },
  ],
  valueKey: "value",
  labelKey: "label",
};

test("control: multiselect is accepted; an unknown control names all three", () => {
  const result = validateReportSpec({
    spec: {
      title: "T",
      sections: [
        {
          type: "filter",
          control: "multiselect",
          field: "status",
          label: "Status",
          options: ["a"],
        },
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: ["status"],
        },
      ],
    },
    catalog: testCatalog,
    roles,
  });
  expect(result.sections[0].control).toBe("multiselect");

  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "radio",
            field: "status",
            label: "Status",
            options: ["a"],
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/control "radio" is not one of select, multiselect, daterange/);
});

test("rejects an unexpected filter key, including a misspelled optionsquery", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "select",
            field: "status",
            label: "Status",
            options: ["pending"],
            optionsquery: regionOptionsQuery,
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/unexpected key "optionsquery"/);
});

// `id` is the one key the agent never writes and the validator always assigns.
// Excluding it from the allowed list would make a normalized section the only
// section shape that cannot be fed back through validation.
test("a filter section carrying the id this validator assigns re-validates", () => {
  const filter = {
    type: "filter",
    control: "select",
    field: "status",
    label: "Status",
    options: ["pending"],
  };
  const spec = {
    title: "T",
    sections: [
      filter,
      {
        type: "table",
        label: "Orders",
        query: ordersByRegion,
        columns: [{ key: "region" }],
        filterBy: ["status"],
      },
    ],
  };
  const once = validateReportSpec({ spec, catalog: testCatalog, roles });
  expect(once.sections[0].id).toBe("s0");
  // Feed the normalized filter section back in; the id is ignored, not read.
  const twice = validateReportSpec({
    spec: { ...spec, sections: [once.sections[0], spec.sections[1]] },
    catalog: testCatalog,
    roles,
  });
  expect(twice.sections[0].id).toBe("s0");
});

// Neither key is inert on a daterange: compileReport's daterange branch reads
// no options, and querySections would still run the optionsQuery on every
// report open for rows nothing reads.
test.each(["options", "optionsQuery"])(
  "%s on a daterange control is rejected, not silently ignored",
  (key) => {
    expect(() =>
      validateReportSpec({
        spec: {
          title: "T",
          sections: [
            {
              type: "filter",
              control: "daterange",
              field: "order_date",
              label: "Created",
              [key]: key === "options" ? ["a"] : regionOptionsQuery,
            },
          ],
        },
        catalog: testCatalog,
        roles,
      }),
    ).toThrow(
      /options and optionsQuery are only valid on a select or multiselect control/,
    );
  },
);

test("match: all on a multiselect is accepted and normalized; rejected on select/daterange; rejected for a bad value", () => {
  const result = validateReportSpec({
    spec: {
      title: "T",
      sections: [
        {
          type: "filter",
          control: "multiselect",
          field: "status",
          label: "Status",
          options: ["pending"],
          match: "all",
        },
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: ["status"],
        },
      ],
    },
    catalog: testCatalog,
    roles,
  });
  expect(result.sections[0].match).toBe("all");

  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "select",
            field: "status",
            label: "Status",
            options: ["pending"],
            match: "all",
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/match is only valid on a multiselect control/);

  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "daterange",
            field: "order_date",
            label: "Created",
            match: "all",
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/match is only valid on a multiselect control/);

  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "multiselect",
            field: "status",
            label: "Status",
            options: ["pending"],
            match: "either",
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/match "either" is not one of any, all/);
});

test("a multiselect with no match normalizes to match: any", () => {
  const result = validateReportSpec({
    spec: {
      title: "T",
      sections: [
        {
          type: "filter",
          control: "multiselect",
          field: "status",
          label: "Status",
          options: ["pending"],
        },
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: ["status"],
        },
      ],
    },
    catalog: testCatalog,
    roles,
  });
  expect(result.sections[0].match).toBe("any");
});

test("optionsQuery normalizes with collection, pipeline, valueKey, labelKey all re-attached", () => {
  const result = validateReportSpec({
    spec: {
      title: "T",
      sections: [
        {
          type: "filter",
          control: "multiselect",
          field: "region",
          label: "Region",
          optionsQuery: regionOptionsQuery,
        },
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: ["region"],
        },
      ],
    },
    catalog: testCatalog,
    roles,
  });
  // The trap: validateQuery alone returns only { collection, pipeline } —
  // valueKey/labelKey must be explicitly re-attached or they're silently lost.
  expect(result.sections[0].optionsQuery).toEqual({
    collection: "demo_orders",
    pipeline: regionOptionsQuery.pipeline,
    valueKey: "value",
    labelKey: "label",
  });
});

test("optionsQuery with a missing or empty valueKey/labelKey fails", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "multiselect",
            field: "region",
            label: "Region",
            optionsQuery: {
              collection: "demo_orders",
              pipeline: regionOptionsQuery.pipeline,
              labelKey: "label",
            },
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/optionsQuery requires a valueKey/);

  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "multiselect",
            field: "region",
            label: "Region",
            optionsQuery: {
              collection: "demo_orders",
              pipeline: regionOptionsQuery.pipeline,
              valueKey: "value",
              labelKey: "",
            },
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/optionsQuery requires a labelKey/);
});

test("optionsQuery with a bad collection/pipeline fails through validateQuery", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "multiselect",
            field: "region",
            label: "Region",
            optionsQuery: {
              collection: "",
              pipeline: regionOptionsQuery.pipeline,
              valueKey: "value",
              labelKey: "label",
            },
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/query.collection is required/);

  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "multiselect",
            field: "region",
            label: "Region",
            optionsQuery: {
              collection: "demo_orders",
              pipeline: "not-an-array",
              valueKey: "value",
              labelKey: "label",
            },
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/query.pipeline must be an array/);
});

test("declaring both options and optionsQuery fails", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "multiselect",
            field: "region",
            label: "Region",
            options: ["North"],
            optionsQuery: regionOptionsQuery,
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/declares both options and optionsQuery/);
});

test("options-source check: a multiselect with no source and no catalog values fails; an optionsQuery passes", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "filter",
            control: "multiselect",
            field: "month",
            label: "Month",
          },
          {
            type: "table",
            label: "Orders",
            query: ordersByRegion,
            columns: [{ key: "region" }],
            filterBy: ["month"],
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/has no options/);

  const result = validateReportSpec({
    spec: {
      title: "T",
      sections: [
        {
          type: "filter",
          control: "multiselect",
          field: "month",
          label: "Month",
          optionsQuery: regionOptionsQuery,
        },
        {
          type: "table",
          label: "Orders",
          query: ordersByRegion,
          columns: [{ key: "region" }],
          filterBy: ["month"],
        },
      ],
    },
    catalog: testCatalog,
    roles,
  });
  expect(result.sections[0].type).toBe("filter");
});
