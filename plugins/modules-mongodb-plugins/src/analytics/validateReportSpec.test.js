import validateReportSpec from "./validateReportSpec.js";
import testCatalog from "./testDatasets.js";
import { MAX_LABEL_LENGTH, MAX_SECTIONS } from "./constants.js";

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

test("a stacked bar section keeps stacked; unstacked sections don't grow the key", () => {
  const { sections } = validateReportSpec({
    spec: {
      title: "T",
      sections: [
        {
          type: "chart",
          chart: "bar",
          label: "Stacked",
          query: ordersByRegion,
          x: "region",
          y: ["total"],
          stacked: true,
        },
        {
          type: "chart",
          chart: "bar",
          label: "Grouped",
          query: ordersByRegion,
          x: "region",
          y: ["total"],
        },
      ],
    },
    catalog: testCatalog,
    roles,
  });
  expect(sections[0].stacked).toBe(true);
  expect("stacked" in sections[1]).toBe(false);
});

test("rejects stacked on a non-bar chart section", () => {
  expect(() =>
    validateReportSpec({
      spec: {
        title: "T",
        sections: [
          {
            type: "chart",
            chart: "line",
            label: "C",
            query: ordersByRegion,
            x: "region",
            y: ["total"],
            stacked: true,
          },
        ],
      },
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/stacked only applies to bar charts/);
});

// Display-name collisions fail at validation — the one place the authoring
// agent still gets the message — rather than only at assembly, where the chat
// path skips the part silently and a persisted report renders an Alert forever.
test("rejects chart columns that collide after humanizing, at validation time", () => {
  const chartSection = (overrides) => ({
    spec: {
      title: "T",
      sections: [
        {
          type: "chart",
          chart: "bar",
          label: "C",
          query: ordersByRegion,
          ...overrides,
        },
      ],
    },
    catalog: testCatalog,
    roles,
  });
  // Multi-series x landing on a fold column.
  expect(() =>
    validateReportSpec(chartSection({ x: "value", y: ["total", "tax"] })),
  ).toThrow(/which the multi-series fold reserves/);
  // Two y columns humanizing to one display name.
  expect(() =>
    validateReportSpec(
      chartSection({ x: "region", y: ["total_sales", "totalSales"] }),
    ),
  ).toThrow(/both display as "Total Sales"/);
  // Single-series x/y collision.
  expect(() =>
    validateReportSpec(chartSection({ x: "total_sales", y: ["totalSales"] })),
  ).toThrow(/both display as "Total Sales"/);
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
  // Feed the normalized filter section back in; the id is read and preserved.
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

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency: the reports store persists this function's OUTPUT
// ─────────────────────────────────────────────────────────────────────────────
//
// Every writer stores the return value rather than the spec it was handed, so a
// stored spec is re-validated by this same function on every read (querySections,
// compileReport) and again on remove_report_section's read → cascade → revalidate
// → write path. Validating the output must therefore return the output.
//
// This is the only thing holding that property, and the failure it guards is not
// subtle: before it, a kpi that omitted `format` came back with `format: null`
// and the next read threw `format must be an object` — which surfaces as the
// whole-report "Report not found" fallback, so every kpi report was broken on
// first open. A new optional field reintroduces it unless this block fails.

const boundTable = (filterField) => ({
  type: "table",
  label: "Orders",
  query: ordersByRegion,
  columns: [{ key: "region" }],
  filterBy: [filterField],
});

const roundTripCases = {
  "kpi with format": [
    {
      type: "kpi",
      label: "Total Revenue",
      query: orderTotal,
      valueKey: "total",
      format: { style: "currency", currency: "USD", locale: "en-US" },
    },
  ],
  // The case that was broken: `format` absent came back as `format: null`.
  "kpi without format": [
    { type: "kpi", label: "Orders", query: orderTotal, valueKey: "total" },
  ],
  chart: [
    {
      type: "chart",
      chart: "bar",
      label: "Revenue by Region",
      query: ordersByRegion,
      x: "region",
      y: ["total"],
    },
  ],
  "table with a plain and a formatted column": [
    {
      type: "table",
      label: "Orders",
      query: ordersByRegion,
      columns: [
        { key: "region" },
        { key: "total", label: "Total", format: { style: "decimal" } },
      ],
    },
  ],
  "select filter with declared options": [
    {
      type: "filter",
      control: "select",
      field: "status",
      label: "Status",
      options: ["pending", "paid"],
    },
    boundTable("status"),
  ],
  // `match` omitted normalizes to "any", and that default must FREEZE in the
  // document — it is a create-time input, not a read-time fallback.
  "multiselect filter with match omitted": [
    {
      type: "filter",
      control: "multiselect",
      field: "region",
      label: "Region",
      options: ["North", "South"],
    },
    boundTable("region"),
  ],
  "multiselect filter with match: all": [
    {
      type: "filter",
      control: "multiselect",
      field: "region",
      label: "Region",
      options: ["North", "South"],
      match: "all",
    },
    boundTable("region"),
  ],
  // A daterange carries no options source at all, so all three optionals are
  // absent — the shape that tripped three separate checks before this change.
  "daterange filter": [
    {
      type: "filter",
      control: "daterange",
      field: "created_at",
      label: "Created",
    },
    boundTable("created_at"),
  ],
  "optionsQuery filter": [
    {
      type: "filter",
      control: "multiselect",
      field: "month",
      label: "Month",
      optionsQuery: regionOptionsQuery,
    },
    boundTable("month"),
  ],
  markdown: [{ type: "markdown", content: "## Notes" }],
  download: [
    { type: "download", label: "Download CSV", query: ordersByRegion },
  ],
};

// Simulates what persisting the output does to it: the MongoDB driver's
// ignoreUndefined default is false and nothing in this repo sets it, so an
// explicit `undefined` property value is stored as BSON null and reads back null.
//
// This step is what makes the filter cases load-bearing. An in-process round trip
// passes them either way — `:set_state` hands the operator's result to the insert
// with no serialization, so an absent `options` is still undefined and any
// `!== undefined` check treats it as absent. Only a spec that has actually been
// through the store comes back with nulls where the optionals were.
function throughTheStore(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(throughTheStore);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, throughTheStore(v)]),
    );
  }
  return value;
}

describe("validateReportSpec is idempotent — validating its output returns it", () => {
  for (const [name, sections] of Object.entries(roundTripCases)) {
    test(name, () => {
      const spec = { title: "T", description: "D", sections };
      const once = validateReportSpec({ spec, catalog: testCatalog, roles });
      const twice = validateReportSpec({
        spec: once,
        catalog: testCatalog,
        roles,
      });
      expect(twice).toEqual(once);
      // ...and again after a trip through the store.
      expect(
        validateReportSpec({
          spec: throughTheStore(once),
          catalog: testCatalog,
          roles,
        }),
      ).toEqual(once);
    });
  }

  // description is a document field in the store, and `_payload` of an absent
  // key resolves to null rather than undefined — so the no-description round
  // trip is the one that goes through a null, not merely an absent key.
  test("a spec with no description", () => {
    const spec = {
      title: "T",
      sections: [{ type: "markdown", content: "## Notes" }],
    };
    const once = validateReportSpec({ spec, catalog: testCatalog, roles });
    expect("description" in once).toBe(false);
    expect(
      validateReportSpec({ spec: once, catalog: testCatalog, roles }),
    ).toEqual(once);
    expect(
      validateReportSpec({
        spec: { ...once, description: null },
        catalog: testCatalog,
        roles,
      }),
    ).toEqual(once);
  });

  test("the whole design example, with and without a catalog", () => {
    const withCatalog = validateReportSpec({
      spec: designExampleSpec,
      catalog: testCatalog,
      roles,
    });
    expect(
      validateReportSpec({ spec: withCatalog, catalog: testCatalog, roles }),
    ).toEqual(withCatalog);

    // resolve-time: no catalog, so no pipeline gate and no options-source check.
    const noCatalog = validateReportSpec({ spec: designExampleSpec, roles });
    expect(validateReportSpec({ spec: noCatalog, roles })).toEqual(noCatalog);
  });
});

// Walks the return value for nulls and undefineds, skipping `pipeline` contents.
// A pipeline is pass-through payload the validator returns byte-for-byte, and a
// legitimate one contains nulls — `{ $group: { _id: null } }` is how you group a
// whole collection. The invariant is about the keys this validator AUTHORS.
function findNullish(value, path = "<root>") {
  if (value === null || value === undefined) return [path];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findNullish(v, `${path}[${i}]`));
  }
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, v]) =>
      key === "pipeline" ? [] : findNullish(v, `${path}.${key}`),
    );
  }
  return [];
}

test("no null or undefined at any depth of the output", () => {
  for (const [name, sections] of Object.entries(roundTripCases)) {
    const out = validateReportSpec({
      spec: { title: "T", description: "D", sections },
      catalog: testCatalog,
      roles,
    });
    expect(findNullish(out, name)).toEqual([]);
  }
  expect(
    findNullish(
      validateReportSpec({
        spec: designExampleSpec,
        catalog: testCatalog,
        roles,
      }),
    ),
  ).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Durable section ids
// ─────────────────────────────────────────────────────────────────────────────
//
// remove_report_section addresses a section by id, and compileReport uses the id
// as a block id, a request id, a download id and a page-state path
// (`sections.${id}.rows`). A stored spec must keep the id it was saved with, and
// a supplied id is checked rather than trusted because this function cannot tell
// a stored id from one the model invented.

const specWithSectionIds = (...ids) => ({
  title: "T",
  sections: ids.map((id, i) => ({
    ...(id === undefined ? {} : { id }),
    type: "markdown",
    content: `## Section ${i}`,
  })),
});

test("a valid supplied section id is preserved, not re-derived", () => {
  const result = validateReportSpec({
    spec: specWithSectionIds("revenue", "notes"),
    catalog: testCatalog,
    roles,
  });
  expect(result.sections.map((s) => s.id)).toEqual(["revenue", "notes"]);
});

test("an absent or null section id derives from position", () => {
  expect(
    validateReportSpec({
      spec: specWithSectionIds(undefined, null, "kept"),
      catalog: testCatalog,
      roles,
    }).sections.map((s) => s.id),
  ).toEqual(["s0", "s1", "kept"]);
});

test.each([
  ["an empty string", "", /section 0 id must be a non-empty string/],
  ["a non-string", 7, /section 0 id must be a non-empty string/],
  ["a '.'", "rev.enue", /section 0 id must not contain/],
  ["a '\\$'", "$revenue", /section 0 id must not contain/],
  [
    "over the label cap",
    "x".repeat(MAX_LABEL_LENGTH + 1),
    /section 0 id exceeds/,
  ],
])("rejects a section id that is %s", (_name, id, message) => {
  expect(() =>
    validateReportSpec({
      spec: specWithSectionIds(id),
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(message);
});

test("rejects two sections supplying the same id", () => {
  expect(() =>
    validateReportSpec({
      spec: specWithSectionIds("revenue", "revenue"),
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/section ids must be unique across the report — "revenue"/);
});

// Uniqueness is checked over the RESOLVED ids, not the supplied ones: a supplied
// "s1" on section 0 collides with the id section 1 derives from its position.
// Two sections sharing an id collide in compileReport's rows Map, so both render
// the same rows — wrong numbers, not a rendering glitch.
test("rejects a supplied id that collides with a derived one", () => {
  expect(() =>
    validateReportSpec({
      spec: specWithSectionIds("s1", undefined),
      catalog: testCatalog,
      roles,
    }),
  ).toThrow(/section ids must be unique across the report — "s1"/);
});
