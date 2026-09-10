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
const dynamicProperties = reportPage._ref.vars.blocks.find(
  (b) => b.type === "Dynamic",
).properties;
const declared = dynamicProperties.types;

// Icons are the same class of problem with a quieter failure. The build collects
// icon imports by scanning the STATIC page config for icon names, so an icon only
// the compiled output names is bundled only if the consuming app happens to use
// it elsewhere — and renders as the exclamation-circle fallback otherwise. The
// report page lists compileReport's icons in `properties.icons` (unread by the
// block, present for the scan); this is the guard that the list is complete.
const declaredIcons = dynamicProperties.icons;

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

// An `icon` is either the bare name or `{ name, ... }`. Anything else under an
// `icon` key (an operator, say) is not a static name and is left to the operator
// walk.
function iconName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.name === "string") {
    return value.name;
  }
  return null;
}

function collect(blocks) {
  const found = {
    blocks: new Set(),
    actions: new Set(),
    operators: new Set(),
    icons: new Set(),
  };

  const walkValue = (value) => {
    if (Array.isArray(value)) return value.forEach(walkValue);
    if (value === null || typeof value !== "object") return;
    const op = operatorName(value);
    if (op) found.operators.add(op);
    for (const [k, v] of Object.entries(value)) {
      if (k === "icon") {
        const icon = iconName(v);
        if (icon) found.icons.add(icon);
      }
      walkValue(v);
    }
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
// rows), a download (DownloadCsv), and markdown. The two charts are adjacent and
// both narrow, so layout derivation pairs them and the Box wrapper is emitted
// too — the second container type, and the one whose nesting the walk below has
// to descend two levels for.
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
      type: "chart",
      chart: "line",
      label: "Tax by region",
      query: {
        collection: "demo_orders",
        pipeline: [{ $group: { _id: "$region", tax: { $sum: "$tax" } } }],
      },
      x: "region",
      y: ["tax"],
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
// at its section's position — ahead of the kpi, the two charts and the table.
const results = [
  [{ region: "EU", name: "EU" }],
  [{ total: 10 }],
  [{ region: "EU", total: 10 }],
  [{ region: "EU", tax: 1 }],
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
  // refactor that stopped emitting them would still pass that check while
  // quietly reducing this test's nesting coverage to nothing.
  expect(used.blocks.has("Card")).toBe(true);
  expect(used.blocks.has("Box")).toBe(true);

  const undeclared = {
    blocks: [...used.blocks].filter((t) => !declared.blocks.includes(t)),
    actions: [...used.actions].filter((t) => !declared.actions.includes(t)),
    operators: [...used.operators].filter(
      (t) => !declared.operators.includes(t),
    ),
  };

  expect(undeclared).toEqual({ blocks: [], actions: [], operators: [] });
});

// The header compiles for every viewer, and which icons it carries depends on
// the viewer: the ★ is AiFillStar or AiOutlineStar by `is_favourite`, and the ⋯
// menu's items (Rename, Publish, Unpublish, Duplicate, Delete) follow
// `is_owner`, `visibility` and `can_share`. Compile the header under every
// branch that changes an icon, so a list that covers one viewer's header but
// not another's fails here rather than on the reader's screen.
test("every icon compileReport emits is listed on the report page's Dynamic block", () => {
  const usedIcons = new Set();
  const viewers = [
    {
      is_owner: true,
      is_favourite: true,
      visibility: "private",
      can_share: true,
    },
    {
      is_owner: true,
      is_favourite: false,
      visibility: "shared",
      can_share: true,
    },
    {
      is_owner: false,
      is_favourite: false,
      visibility: "shared",
      can_share: false,
    },
  ];
  for (const viewer of viewers) {
    const blocks = compileReport({
      spec,
      results,
      catalog: testCatalog,
      roles: ["analyst"],
      endpointId: "ai-reporting/query-data",
      chartEndpointId: "ai-reporting/chat-data",
      conversation_id: "conv-1",
      ...viewer,
    });
    for (const icon of collect(blocks).icons) usedIcons.add(icon);
  }

  // The two the issue was about, named so a refactor that stopped emitting them
  // does not quietly shrink this test's coverage.
  expect(usedIcons.has("AiOutlineEllipsis")).toBe(true);
  expect(usedIcons.has("AiFillStar")).toBe(true);

  expect([...usedIcons].filter((i) => !declaredIcons.includes(i))).toEqual([]);
  // And nothing stale: an icon listed but never emitted is a name the bundle
  // carries for nothing.
  expect([...declaredIcons].filter((i) => !usedIcons.has(i))).toEqual([]);
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
