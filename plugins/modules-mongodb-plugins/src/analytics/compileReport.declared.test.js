import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

import { load as loadYaml } from "js-yaml";

import compileReport from "./compileReport.js";
import testCatalog from "./testDatasets.js";

// compileReport emits Lowdefy config that the report page's Dynamic block
// resolves server-side. Dynamic validates every block, action and operator type
// in the resolved output against the list the block DECLARES, and throws on
// anything undeclared — which, with no `required: true`, drops the WHOLE report
// to the fallback slot rather than degrading the offending section.
//
// That is how a formatted table column came to 404 every report containing one:
// a `format` descriptor compiles to a `__function` cell renderer wrapping
// `___intl.numberFormat`, and `_intl` was declared nowhere. Nothing caught it —
// `ldf:b` cannot, because reports compile at runtime from a stored spec, and the
// other tests call compileReport() directly rather than through Dynamic.
//
// So assert the invariant directly: everything the compiler can emit must be
// declared on the block. This is the compile-side half; the render-side half is
// the e2e spec in apps/demo/e2e/ai-reporting.

const here = dirname(fileURLToPath(import.meta.url));
const reportPage = loadYaml(
  readFileSync(
    resolve(here, "../../../../modules/ai-reporting/pages/report.yaml"),
    "utf8",
  ),
);

// report.yaml is a `_ref` into layout's `page` component, so its blocks live
// under the ref's vars, not at the document root.
const declared = reportPage._ref.vars.blocks.find((b) => b.type === "Dynamic")
  .properties.types;

// Dynamic collapses an operator's leading underscores to one before checking
// membership, so `__state`, `___intl.numberFormat` and `_intl` are all `_intl`-
// style names by the time they are validated. Mirror that normalisation.
const KNOWN_NON_OPERATORS = new Set(["_id"]);

function operatorName(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  const keys = Object.keys(value).filter((k) => !k.startsWith("~"));
  if (keys.length !== 1) return null;
  const [head] = keys[0].split(".");
  const name = head.replace(/^_+/, "_");
  if (
    name.length > 1 &&
    name.startsWith("_") &&
    !KNOWN_NON_OPERATORS.has(name)
  ) {
    return name;
  }
  return null;
}

function collect(blocks) {
  const found = { blocks: new Set(), actions: new Set(), operators: new Set() };

  const walkValue = (value) => {
    if (Array.isArray(value)) return value.forEach(walkValue);
    if (value === null || typeof value !== "object") return;
    const op = operatorName(value);
    if (op) found.operators.add(op);
    for (const v of Object.values(value)) walkValue(v);
  };

  const walkActions = (events) => {
    for (const actions of Object.values(events ?? {})) {
      for (const action of actions ?? []) {
        if (action?.type) found.actions.add(action.type);
      }
    }
  };

  // Children reach the check through whichever container shape they are in:
  // `blocks` (the content-slot shorthand the compiler uses), or an explicit
  // `areas`/`slots` map. A child the walk misses is a block type this test
  // silently stops covering, which is the one failure the whole file exists to
  // prevent.
  const walkBlocks = (list) => {
    for (const block of list ?? []) {
      if (block?.type) found.blocks.add(block.type);
      walkActions(block?.events);
      walkValue(block?.properties);
      walkValue(block?.events);
      walkBlocks(block?.blocks);
      for (const area of Object.values(block?.areas ?? {})) {
        walkBlocks(area?.blocks);
      }
      for (const slot of Object.values(block?.slots ?? {})) {
        walkBlocks(slot?.blocks);
      }
    }
  };

  walkBlocks(blocks);
  return found;
}

// Exercises every section type and every optional feature the compiler branches
// on: number formats on both a KPI and a table column (the _intl path), a bound
// filter per control — select, daterange and multiselect (the __state/__api
// re-query path) — with the multiselect sourcing its options from a query so the
// MultipleSelector branch is actually emitted, an unbound section (inlined
// rows), a download (DownloadCsv), and markdown.
//
// Every control must appear here: this test is the only guard on the block-type
// declaration, and a control the fixture never emits is a control whose type
// could go undeclared unnoticed.
const spec = {
  title: "Everything",
  description: "Exercises every compiler branch.",
  sections: [
    { type: "filter", control: "select", field: "status", label: "Status" },
    {
      type: "filter",
      control: "daterange",
      field: "created_at",
      label: "Created",
    },
    {
      type: "filter",
      control: "multiselect",
      field: "region",
      label: "Regions",
      match: "any",
      optionsQuery: {
        collection: "demo_orders",
        pipeline: [
          { $group: { _id: "$region" } },
          { $project: { _id: 0, region: "$_id", name: "$_id" } },
        ],
        valueKey: "region",
        labelKey: "name",
      },
    },
    { type: "markdown", content: "## Notes" },
    {
      type: "kpi",
      label: "Revenue",
      query: {
        collection: "demo_orders",
        pipeline: [{ $group: { _id: null, total: { $sum: "$total" } } }],
      },
      valueKey: "total",
      format: {
        style: "currency",
        currency: "ZAR",
        locale: "en-ZA",
        decimals: 2,
      },
      filterBy: ["status", "created_at"],
    },
    {
      type: "chart",
      chart: "bar",
      label: "By region",
      query: {
        collection: "demo_orders",
        pipeline: [{ $group: { _id: "$region", total: { $sum: "$total" } } }],
      },
      x: "region",
      y: ["total"],
      filterBy: ["status", "region"],
    },
    {
      type: "table",
      label: "Orders",
      query: {
        collection: "demo_orders",
        pipeline: [{ $group: { _id: "$region", total: { $sum: "$total" } } }],
      },
      columns: [
        { key: "region", label: "Region" },
        {
          key: "total",
          label: "Total",
          format: { style: "currency", currency: "USD", locale: "en-US" },
        },
      ],
    },
    {
      type: "download",
      label: "Download CSV",
      query: {
        collection: "demo_orders",
        pipeline: [{ $project: { _id: 0, region: 1 } }],
      },
    },
  ],
};

// Aligned to orderedQueries, which interleaves the multiselect's options query
// at its section's position — ahead of the kpi, chart and table.
const results = [
  [{ region: "EU", name: "EU" }],
  [{ total: 10 }],
  [{ region: "EU", total: 10 }],
  [{ region: "EU", total: 10 }],
];

test("every type compileReport emits is declared on the report page's Dynamic block", () => {
  const blocks = compileReport({
    spec,
    results,
    catalog: testCatalog,
    roles: ["analyst"],
    endpointId: "ai-reporting/query-data",
    chartEndpointId: "ai-reporting/chart-data",
  });
  const used = collect(blocks);

  expect([...used.operators].sort()).toEqual(
    expect.arrayContaining([
      "_intl",
      "_function",
      "_args",
      "_state",
      "_api",
      "_if_none",
    ]),
  );

  // The wrapper types, named rather than left to the undeclared check below: a
  // refactor that stopped emitting cards would still pass that check while
  // quietly reducing this test's nesting coverage to nothing.
  expect(used.blocks.has("Card")).toBe(true);
  // Box is declared for the grouping wrapper but nothing emits one yet, so the
  // guard on it is that the declaration survives — not that it is used.
  expect(declared.blocks).toContain("Box");

  const undeclared = {
    blocks: [...used.blocks].filter((t) => !declared.blocks.includes(t)),
    actions: [...used.actions].filter((t) => !declared.actions.includes(t)),
    operators: [...used.operators].filter(
      (t) => !declared.operators.includes(t),
    ),
  };

  expect(undeclared).toEqual({ blocks: [], actions: [], operators: [] });
});

// A section that fails verification compiles to an Alert instead of its normal
// block, so Alert must be declared too — otherwise the graceful per-section
// degradation would itself take down the whole report.
test("the failed-section Alert path emits only declared types", () => {
  const blocks = compileReport({
    spec: {
      title: "Failing",
      sections: [
        {
          type: "kpi",
          label: "Broken",
          query: { collection: "demo_orders", pipeline: [] },
          valueKey: "missing",
        },
      ],
    },
    results: [[{ present: 1 }]],
    catalog: testCatalog,
    roles: ["analyst"],
    endpointId: "ai-reporting/query-data",
    chartEndpointId: "ai-reporting/chart-data",
  });
  const used = collect(blocks);
  expect(used.blocks.has("Alert")).toBe(true);
  expect([...used.blocks].filter((t) => !declared.blocks.includes(t))).toEqual(
    [],
  );
});
