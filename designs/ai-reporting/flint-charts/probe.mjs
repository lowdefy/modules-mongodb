/**
 * Reproduces every finding in findings.md against flint-chart@0.5.0.
 * (0.4.1 produced byte-identical output for findings 1–6; re-run against
 * both to re-verify.)
 *
 *   mkdir /tmp/flint-probe && cd /tmp/flint-probe
 *   echo '{"type":"module"}' > package.json
 *   npm install flint-chart@0.5.0
 *   node probe.mjs
 */
import {
  assembleECharts,
  ecAllTemplateDefs,
  ecApplyLayoutToSpec,
  ecGetTemplateChannels,
} from "flint-chart/echarts";
import {
  normalizeStaticSeries,
  SemanticTypes,
  STATIC_SERIES_KEY_COLUMN,
  STATIC_SERIES_VALUE_COLUMN,
} from "flint-chart/core";

const rows = [
  { region: "North", revenue: 1200, cost: 800 },
  { region: "South", revenue: 900, cost: 700 },
  { region: "East", revenue: 1500, cost: 1100 },
];
const months = [
  { month: "2026-01", revenue: 500 },
  { month: "2026-02", revenue: 1500 },
  { month: "2026-03", revenue: 900 },
];

const assemble = (values, chart_spec, semantic_types) =>
  assembleECharts({ data: { values }, ...(semantic_types ? { semantic_types } : {}), chart_spec });

console.log("=== 37 chart types ===");
console.log(ecAllTemplateDefs.map((d) => d.chart).join(", "));

// Finding 4 — channels are per template; pie has no y and no theta.
for (const t of ["Bar Chart", "Line Chart", "Pie Chart", "Grouped Bar Chart"]) {
  console.log(`channels ${t}:`, JSON.stringify(ecGetTemplateChannels(t)));
}

// Finding 1 — data is inlined, and in three different shapes.
const bar = assemble(rows, {
  chartType: "Bar Chart",
  encodings: { x: { field: "region" }, y: { field: "revenue" } },
});
console.log("\n=== Finding 1: inlined data ===");
console.log("bar   xAxis.data:", JSON.stringify(bar.xAxis?.data), "series:", JSON.stringify(bar.series[0].data));
console.log("bar   has dataset?", "dataset" in bar);

const lineTemporal = assemble(months, {
  chartType: "Line Chart",
  encodings: { x: { field: "month" }, y: { field: "revenue" } },
});
console.log("line  xAxis.data:", JSON.stringify(lineTemporal.xAxis?.data), "series:", JSON.stringify(lineTemporal.series[0].data));

const pie = assemble(rows, {
  chartType: "Pie Chart",
  encodings: { color: { field: "region" }, size: { field: "revenue" } },
});
console.log("pie   series:", JSON.stringify(pie.series[0].data));

// Finding 2 — ordering is derived from inferred semantics.
console.log("\n=== Finding 2: derived ordering ===");
console.log("input region order: North, South, East");
console.log("charted order:     ", JSON.stringify(bar.xAxis.data));
for (const sort of [null, false, "none"]) {
  const out = assemble(rows, {
    chartType: "Bar Chart",
    encodings: { x: { field: "region", sort }, y: { field: "revenue" } },
  });
  console.log(`encodings.x.sort = ${JSON.stringify(sort)}:`, JSON.stringify(out.xAxis.data));
}
const semanticTypeNames = Object.keys(SemanticTypes);
const sorters = semanticTypeNames.filter((t) => {
  const out = assemble(
    rows,
    { chartType: "Bar Chart", encodings: { x: { field: "region" }, y: { field: "revenue" } } },
    { region: t, revenue: "Quantity" },
  );
  return JSON.stringify(out.xAxis.data) !== JSON.stringify(["North", "South", "East"]);
});
console.log(`semantic types that re-sort (of ${semanticTypeNames.length}):`, sorters.join(", "));

// Finding 3 — two y columns leak __flint_* names, whichever official route
// carries them; hand-folding to long format with our own column names does not.
console.log("\n=== Finding 3: multi-y ===");
const twoY = assemble(rows, {
  chartType: "Bar Chart",
  encodings: { x: { field: "region" }, y: [{ field: "revenue" }, { field: "cost" }] },
});
console.log("direct 2×y     yAxis.name:", twoY.yAxis.name, "| graphic:", twoY.graphic?.[0]?.style?.text, "| stack:", twoY.series.map((s) => s.stack).join(","));

const folded = normalizeStaticSeries(
  { x: { field: "region" }, y: [{ field: "revenue" }, { field: "cost" }] },
  rows,
  {},
);
console.log("normalizeStaticSeries encodings:", JSON.stringify(folded.encodings));
const viaNormalize = assemble(folded.data, { chartType: "Bar Chart", encodings: folded.encodings });
console.log("via normalize  yAxis.name:", viaNormalize.yAxis.name, "| graphic:", viaNormalize.graphic?.[0]?.style?.text, "| stack:", viaNormalize.series.map((s) => s.stack).join(","));
console.log("(key/value constants:", STATIC_SERIES_KEY_COLUMN, "/", STATIC_SERIES_VALUE_COLUMN, ")");

// The route that works: fold ourselves, with human column names, and pick the
// template whose series semantics we want (group => side-by-side bars).
const fold = (data, x, ys) =>
  data.flatMap((r) => ys.map((m) => ({ [x]: r[x], Measure: m, Value: r[m] })));
const grouped = assemble(fold(rows, "region", ["revenue", "cost"]), {
  chartType: "Grouped Bar Chart",
  encodings: { x: { field: "region" }, y: { field: "Value" }, group: { field: "Measure" } },
});
console.log("hand-fold GBC  yAxis.name:", grouped.yAxis.name, "| graphic:", grouped.graphic?.[0]?.style?.text, "| stack:", grouped.series.map((s) => s.stack ?? "none").join(","), "| series:", grouped.series.map((s) => s.name).join(","));
const multiLine = assemble(fold(months.map((m) => ({ ...m, cost: m.revenue - 100 })), "month", ["revenue", "cost"]), {
  chartType: "Line Chart",
  encodings: { x: { field: "month" }, y: { field: "Value" }, color: { field: "Measure" } },
});
console.log("hand-fold line series:", multiLine.series.map((s) => `${s.name}[${s.type}]`).join(","), "| yAxis.name:", multiLine.yAxis?.name);

// Finding 4 — a wrong channel is silent; a wrong type throws.
console.log("\n=== Finding 4: silent channel failure ===");
const pieTheta = assemble(rows, {
  chartType: "Pie Chart",
  encodings: { color: { field: "region" }, theta: { field: "revenue" } },
});
console.log("pie via theta (wrong channel):", JSON.stringify(pieTheta.series[0].data));
try {
  assemble(rows, { chartType: "Banana Chart", encodings: { x: { field: "region" } } });
} catch (e) {
  console.log("unknown type throws:", e.message);
}

// Finding 5 — no single-key _-prefixed object anywhere, so no operator misparse.
console.log("\n=== Finding 5: _-prefixed keys ===");
for (const [name, option] of Object.entries({ bar, twoY, line: lineTemporal, pie })) {
  const singles = [];
  const seen = new Set();
  (function walk(node, path) {
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (!node || typeof node !== "object") return;
    const keys = Object.keys(node);
    keys.filter((k) => k.startsWith("_")).forEach((k) => seen.add(k));
    if (keys.length === 1 && keys[0].startsWith("_")) singles.push(`${path}.${keys[0]}`);
    keys.forEach((k) => walk(node[k], `${path}.${k}`));
  })(option, "option");
  console.log(name.padEnd(5), "_keys:", [...seen].join(","), "| single-key _objects:", singles.length ? singles.join(" ") : "none");
}

// Finding 6 — baseSize.height pins the PLOT; _height = plot + grid.top + grid.bottom.
console.log("\n=== Finding 6: baseSize.height is the plot height ===");
const long = [
  { region: "North Region With A Very Long Label", revenue: 1200 },
  { region: "South Region Rather Long", revenue: 900 },
  { region: "East", revenue: 1500 },
];
for (const h of [150, 220, 280, 400]) {
  const o = assemble(long, {
    chartType: "Bar Chart",
    encodings: { x: { field: "region" }, y: { field: "revenue" } },
    baseSize: { width: 1100, height: h },
  });
  const plot = o._height - o.grid.top - o.grid.bottom;
  console.log(
    "baseSize.height", String(h).padStart(3),
    "=> _height", String(o._height).padStart(4),
    "grid", JSON.stringify(o.grid),
    "plot", plot,
    plot === h ? "== baseSize.height" : "!= baseSize.height",
  );
}
// grid scales with label length, not with canvas — the furniture is absolute px.
const labelSets = {
  short: ["N", "S", "E"],
  words: ["North", "South", "East"],
  long: ["North Region With A Very Long Label", "South Region Rather Long", "East"],
};
for (const [name, labels] of Object.entries(labelSets)) {
  const o = assemble(
    labels.map((region, i) => ({ region, revenue: rows[i].revenue })),
    { chartType: "Bar Chart", encodings: { x: { field: "region" }, y: { field: "revenue" } } },
  );
  console.log(name.padEnd(6), "rotate", String(o.xAxis.axisLabel.rotate).padStart(2), "grid.bottom", o.grid.bottom, "_height", o._height);
}

// Finding 7 — width is layout-inert; pie honours the pin; partial baseSize is NaN.
console.log("\n=== Finding 7: width inert, pie pins, partial baseSize breaks ===");
const cats = Array.from({ length: 12 }, (_, i) => ({ region: `Region Number ${i + 1}`, revenue: 100 + i * 37 }));
for (const width of [500, 1100, 1600]) {
  const o = assemble(cats, {
    chartType: "Bar Chart",
    encodings: { x: { field: "region" }, y: { field: "revenue" } },
    baseSize: { width, height: 220 },
  });
  console.log("width", String(width).padStart(4), "=> rotate", o.xAxis.axisLabel.rotate, "grid", JSON.stringify(o.grid));
}
const pinnedPie = assemble(rows, {
  chartType: "Pie Chart",
  encodings: { color: { field: "region" }, size: { field: "revenue" } },
  baseSize: { width: 1100, height: 220 },
});
console.log("pie pinned 220 => _height", pinnedPie._height, "grid", JSON.stringify(pinnedPie.grid));
const partial = assemble(rows, {
  chartType: "Bar Chart",
  encodings: { x: { field: "region" }, y: { field: "revenue" } },
  baseSize: { height: 220 },
});
console.log("partial baseSize {height} => _width", partial._width, "(always pass both)");

// Finding 8 — ecApplyLayoutToSpec is an internal assembly step, not a refit API.
console.log("\n=== Finding 8: ecApplyLayoutToSpec is not a resize API ===");
console.log("signature arity:", ecApplyLayoutToSpec.length, "(option, InstantiateContext, warnings)");
try {
  ecApplyLayoutToSpec(JSON.parse(JSON.stringify(bar)), { width: 1100, height: 280 }, []);
} catch (e) {
  console.log("called with a size as context, throws:", e.message);
}

// semantic_types is optional — this matches the bar option above exactly.
const withTypes = assemble(
  rows,
  { chartType: "Bar Chart", encodings: { x: { field: "region" }, y: { field: "revenue" } } },
  { region: "Category", revenue: "Quantity" },
);
console.log("\nsemantic_types optional — identical output:", JSON.stringify(withTypes) === JSON.stringify(bar));

// Finding 9 — function-valued keys and the multi-series graphic.
console.log("\n=== Finding 9: function values ===");
const groupedForFns = assemble(fold(rows, "region", ["revenue", "cost"]), {
  chartType: "Grouped Bar Chart",
  encodings: { x: { field: "region" }, y: { field: "Value" }, group: { field: "Measure" } },
});
for (const [name, option] of Object.entries({ bar, line: lineTemporal, pie, grouped: groupedForFns })) {
  const fns = [];
  (function walk(node, path) {
    if (typeof node === "function") return void fns.push(path);
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (node && typeof node === "object") Object.entries(node).forEach(([k, v]) => walk(v, `${path}.${k}`));
  })(option, name);
  console.log(name.padEnd(7), "function paths:", fns.join(" ") || "none");
}
console.log("grouped graphic:", JSON.stringify(groupedForFns.graphic));

// Finding 10 — empty, null, Date, object values.
console.log("\n=== Finding 10: data-shape robustness ===");
for (const [t, enc] of [
  ["Bar Chart", { x: { field: "region" }, y: { field: "revenue" } }],
  ["Line Chart", { x: { field: "month" }, y: { field: "revenue" } }],
  ["Pie Chart", { color: { field: "region" }, size: { field: "revenue" } }],
  ["Grouped Bar Chart", { x: { field: "region" }, y: { field: "Value" }, group: { field: "Measure" } }],
]) {
  try {
    assemble([], { chartType: t, encodings: enc });
    console.log(`empty rows ${t}: OK`);
  } catch (e) {
    console.log(`empty rows ${t}: THREW ${e.message.slice(0, 80)}`);
  }
}
const dirty = [
  { region: "North", revenue: 1200 },
  { region: null, revenue: 900 },
  { region: "East" },
  { region: "West", revenue: null },
];
const dirtyBar = assemble(dirty, { chartType: "Bar Chart", encodings: { x: { field: "region" }, y: { field: "revenue" } } });
console.log("nulls bar xAxis:", JSON.stringify(dirtyBar.xAxis?.data), "series:", JSON.stringify(dirtyBar.series[0].data));
const dated = assemble(
  [{ day: new Date("2026-01-01"), revenue: 500 }, { day: new Date("2026-02-01"), revenue: 900 }],
  { chartType: "Line Chart", encodings: { x: { field: "day" }, y: { field: "revenue" } } },
);
console.log("Date x series:", JSON.stringify(dated.series[0].data).slice(0, 90));
