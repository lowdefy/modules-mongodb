# What `flint-chart` 0.4.1 actually does

Evidence for [the Flint charts design](design.md). Everything below was observed by running the
package, not read from its documentation — the docs site (`microsoft.github.io/flint-chart`) serves
a JS-rendered shell that returns nothing to a fetcher, and the README describes the happy path
only. Probed against **`flint-chart@0.4.1`**, published 2026-07-27.

Reproduce with [`probe.mjs`](probe.mjs) — `npm install flint-chart@0.4.1` in an empty directory and
run it.

## The package

|                          |                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Version                  | `0.4.1` (10 releases, `0.1.0` → `0.4.1`)                                                                 |
| Licence                  | MIT © Microsoft                                                                                          |
| Runtime dependencies     | **none**                                                                                                 |
| Peer dependencies        | `echarts`, `vega`, `vega-lite`, `chart.js`, `plotly.js` — **all `optional: true`**                       |
| Engines                  | `node >= 18`                                                                                             |
| Subpath exports          | `.`, `./core`, `./echarts`, `./vegalite`, `./plotly`, `./chartjs`, `./excel`, `./test-data`, `./gallery` |
| `flint-chart/echarts` JS | **520 KB** (the 33 MB unpacked figure is source maps, `test-data` and `gallery`)                         |
| `sideEffects`            | `false`                                                                                                  |

`flint-chart/echarts` imports nothing — the adapter is self-contained, and `echarts` itself is
never loaded. It is a pure spec transform: rows in, ECharts option object out. It runs in a plain
Node context with no browser globals.

There is also a `flint-chart-mcp` package. It is not relevant here: it exists so an agent can drive
Flint conversationally, and this module's agent must not choose chart config at all.

## `assembleECharts` — the one function that matters

```js
import { assembleECharts } from "flint-chart/echarts";

assembleECharts({
  data: { values: rows },
  semantic_types: { region: "Category", revenue: "Quantity" }, // optional
  chart_spec: {
    chartType: "Bar Chart",
    encodings: { x: { field: "region" }, y: { field: "revenue" } },
    baseSize: { width: 800, height: 400 }, // optional
  },
});
```

**`semantic_types` is optional.** Omitting it produced an identical option to supplying
`{ region: "Category", revenue: "Quantity" }` in the bar case — Flint profiles the data itself. It
is not a required input we would have to make the agent supply.

**37 chart types**, from the exported `ecAllTemplateDefs` — an array (not a function) of template
objects whose `chart` key is the name:
Scatter Plot, Regression, Connected Scatter Plot, Ranged Dot Plot, Boxplot, Strip Plot, Bar Chart,
Grouped Bar Chart, Stacked Bar Chart, Lollipop Chart, Pyramid Chart, Heatmap, Calendar Heatmap,
Line Chart, Bump Chart, Slope Chart, Area Chart, Streamgraph, Range Area Chart, Pie Chart, Funnel
Chart, Treemap, Sunburst Chart, Tree, Histogram, Density Plot, ECDF Plot, Parallel Coordinates,
Candlestick Chart, Waterfall Chart, Gantt Chart, Bullet Chart, Radar Chart, Rose Chart, Gauge
Chart, Sankey Diagram, Network Graph.

## Finding 1 — it inlines the data, and the shape varies

Flint writes values directly into the option. It never emits an ECharts `dataset`. Worse for our
purposes, **the shape it writes depends on the chart type and on the semantics it infers**:

| Case                        | Where the data lands                                             |
| --------------------------- | ---------------------------------------------------------------- |
| Bar, categorical x          | `xAxis.data: ["North", …]` + `series[0].data: [1200, …]`         |
| Line, x inferred temporal   | no `xAxis.data`; `series[0].data: [["2026-01", 500], …]` (pairs) |
| Line, x declared `Category` | `xAxis.data` + numeric `series[0].data`                          |
| Pie                         | `series[0].data: [{ name: "North", value: 1200 }, …]`            |

Three different row encodings across three chart kinds. There is no single key an assembled option
can have its rows swapped into afterwards.

This is the finding that shapes the design: `compileReport` currently builds an option with
`rows: []` and then assigns `option.dataset.source` (`compileReport.js:526`), which is only possible
because the current builder uses the `dataset` + `encode` form deliberately.

## Finding 2 — ordering is derived, not taken from the pipeline

Charting `region` (unordered category labels) reordered the rows **by value descending** —
`North, East, South` out of `North, South, East` in. Charting `month` strings (`2026-01`…`2026-03`)
preserved their order.

So Flint decides ordering from the semantics it infers about the x field. For a pipeline that
`$sort`ed deliberately and did not sort by the charted measure, Flint will override it.

**The lever is `semantic_types`, and it is narrow.** Sweeping all 44 exported `SemanticTypes` over
the same bar chart, exactly three of them re-sort by value: **`Category`**, `Direction` and
`Unknown`. The other 41 — including `Name`, `Status`, `Region`, `ID`, `Rank` — preserve the order
the rows arrived in. `Category` is also what Flint infers for a plain string column, so the sort is
the _default_ rather than an edge case, and `semantic_types: { [x]: "Name" }` is the one-line
override.

`encodings.x.sort` is not the lever — `null`, `false` and `"none"` were all accepted silently and
all still sorted.

## Finding 3 — multiple `y` columns leak internal names into the rendered chart

Our `y` is an array of columns rendered as sibling series. Flint's `y` encoding takes one field.
Passing two (`y: [{field: "revenue"}, {field: "cost"}]`) makes it pivot internally, and two
placeholder names escape into things a user reads:

```json
"yAxis": { "name": "__flint_series_value" },
"graphic": [{ "type": "text", "style": { "text": "__flint_series_key" } }]
```

The `graphic` entry renders that literal string on the chart. It also silently switched to
`stack: "total"` — a stacked bar, where the current builder produces grouped bars.

`flint-chart/core` exports `normalizeStaticSeries` and `STATIC_SERIES_KEY_COLUMN` /
`STATIC_SERIES_VALUE_COLUMN`, which is evidently the supported route for this. Multi-`y` needs that
path plus label overrides; it is not a drop-in.

## Finding 4 — a wrong encoding channel is silently wrong, not an error

Channels are **per template**, from `ecGetTemplateChannels(chartType)`:

| Chart type | Channels                            |
| ---------- | ----------------------------------- |
| Bar Chart  | `x, y, color, opacity, column, row` |
| Line Chart | `x, y, color, opacity, column, row` |
| Pie Chart  | `size, color, column, row`          |

Pie has no `y` and no `theta`. Feeding it `{ color: { field: "region" }, theta: { field: "revenue" } }`
threw nothing and produced **every slice equal to `1`** — the unrecognised channel was dropped and
the value fell back to a row count. With `{ color, size }` it produced the right values.

An unknown chart _type_ does throw, with a good message:
`Unknown ECharts chart type: Banana Chart. Use ecAllTemplateDefs to see available types.`

So type errors are loud and channel errors are silent. Any expansion of the chart vocabulary has to
gate encodings against `ecGetTemplateChannels`, not against a hand-written list.

## Finding 5 — the `_`-prefixed keys are safe to pass through, but should still be stripped

The option comes back carrying `_width`, `_height`, `_dataLength`, `_transform` and `_pivot`
alongside the real ECharts keys.

**These do not break Lowdefy's operator parsing.** Operator detection fires only on an object whose
_single_ non-`~` key starts with the prefix — `evaluateOperators.js:93-96,110-111` in
`@lowdefy/operators`:

```js
const nonTildeKeys = keys.filter((k) => !k.startsWith("~"));
const isSingleKeyObject = nonTildeKeys.length === 1;
const key = isSingleKeyObject ? nonTildeKeys[0] : null;
const isOperatorObject = key && key.startsWith(operatorPrefix);
```

A walk over the bar, two-series bar, line and pie outputs found **no single-key `_`-prefixed object
anywhere** — every one of those keys sits among many siblings, so none is read as an operator. The
reasons to strip them are that they are private metadata that would otherwise be persisted forever
into `data_parts` and report specs, that `_width`/`_height` compete with the block's own `height`
property, and that a future Flint version could emit a shape where the single-key rule does bite.

## Finding 6 — `baseSize` is a floor Flint grows from, and `_height` is its answer

| `baseSize` given | `_width` / `_height` returned |
| ---------------- | ----------------------------- |
| none             | 523 × 507                     |
| 800 × 400        | 922 × 587                     |
| 300 × 200        | 424 × 387                     |

Flint takes `baseSize` as a starting canvas and expands it to fit the axis furniture it decided on.
`grid` is absolute pixels (`{left: 86, right: 38, top: 36, bottom: 151}` for a long rotated label),
and it set `xAxis.axisLabel.rotate: 90` for the long label — the label handling that is exactly the
polish worth having.

The consequence is that Flint assumes a canvas it can grow. Our blocks have a fixed height (300 in
the chat panel, 400 in a report section) and a fluid, span-driven width. A label-heavy chart given
a 400px block spends 187px of it on furniture. `_height` is Flint's own answer to how tall the
chart wants to be, which makes it usable as the block's `height` rather than something to discard.

`flint-chart/echarts` also exports `ecApplyLayoutToSpec`, which is presumably how a client
recomputes layout on resize. That is only reachable from a browser bundle.
