/**
 * Reproduces every finding in findings.md against flint-chart@0.4.1.
 *
 *   mkdir /tmp/flint-probe && cd /tmp/flint-probe
 *   echo '{"type":"module"}' > package.json
 *   npm install flint-chart@0.4.1
 *   node probe.mjs
 */
import {
  assembleECharts,
  ecAllTemplateDefs,
  ecGetTemplateChannels,
} from "flint-chart/echarts";
import { SemanticTypes } from "flint-chart/core";

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
for (const t of ["Bar Chart", "Line Chart", "Pie Chart"]) {
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

// Finding 3 — two y columns leak __flint_* names and switch to stacking.
console.log("\n=== Finding 3: multi-y leaks internal names ===");
const twoY = assemble(rows, {
  chartType: "Bar Chart",
  encodings: { x: { field: "region" }, y: [{ field: "revenue" }, { field: "cost" }] },
});
console.log("yAxis.name:", twoY.yAxis.name);
console.log("graphic text:", twoY.graphic?.[0]?.style?.text);
console.log("series stack:", twoY.series.map((s) => s.stack).join(", "));

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

// Finding 6 — baseSize is a floor Flint grows from.
console.log("\n=== Finding 6: baseSize and _height ===");
const long = [{ region: "North Region With A Very Long Label", revenue: 1200 }, ...rows.slice(1)];
for (const baseSize of [undefined, { width: 800, height: 400 }, { width: 300, height: 200 }]) {
  const out = assemble(long, {
    chartType: "Bar Chart",
    encodings: { x: { field: "region" }, y: { field: "revenue" } },
    ...(baseSize ? { baseSize } : {}),
  });
  console.log(
    "baseSize", JSON.stringify(baseSize) ?? "none",
    "=> _width", out._width, "_height", out._height,
    "grid", JSON.stringify(out.grid),
    "rotate", out.xAxis.axisLabel.rotate,
  );
}

// semantic_types is optional — this matches the bar option above exactly.
const withTypes = assemble(
  rows,
  { chartType: "Bar Chart", encodings: { x: { field: "region" }, y: { field: "revenue" } } },
  { region: "Category", revenue: "Quantity" },
);
console.log("\nsemantic_types optional — identical output:", JSON.stringify(withTypes) === JSON.stringify(bar));
