# What `flint-chart` 0.5.0 actually does

Evidence for [the Flint charts design](design.md). Everything below was observed by running the
package, not read from its documentation — the docs site (`microsoft.github.io/flint-chart`) serves
a JS-rendered shell that returns nothing to a fetcher, and the README describes the happy path
only. Probed against **`flint-chart@0.5.0`**, published 2026-08-06. First probed against `0.4.1`
(2026-07-27); the two versions produced **byte-identical probe output** across findings 1–6, so
the pre-1.0 churn has not, so far, touched assembled options.

Reproduce with [`probe.mjs`](probe.mjs) — `npm install flint-chart@0.5.0` in an empty directory and
run it.

## The package

|                          |                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Version                  | `0.5.0` (11 releases, `0.1.0` → `0.5.0`)                                                                 |
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
    baseSize: { width: 1100, height: 220 }, // optional; pass both or neither (finding 7)
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
`rows: []` and then assigns `option.dataset.source` (`compileReport.js:1175`), which is only
possible because the current builder uses the `dataset` + `encode` form deliberately.

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
all still sorted. The re-sort also applies unchanged to hand-folded multi-series data (finding 3's
route): the grouped bar re-ordered the same way, and the same `semantic_types` override restored
input order.

## Finding 3 — multi-`y` leaks internal names on the official routes; hand-folding avoids it

Our `y` is an array of columns rendered as sibling series. Flint's `y` encoding takes one field.
Passing two (`y: [{field: "revenue"}, {field: "cost"}]`) makes it pivot internally, and two
placeholder names escape into things a user reads:

```json
"yAxis": { "name": "__flint_series_value" },
"graphic": [{ "type": "text", "style": { "text": "__flint_series_key" } }]
```

The `graphic` entry renders that literal string on the chart. It also silently switched to
`stack: "total"` — a stacked bar, where the current builder produces grouped bars.

**`normalizeStaticSeries` does not fix this.** Its signature is
`normalizeStaticSeries(rawEncodings, data, semanticTypes)` and it is exactly the fold `assembleECharts`
performs internally: it rewrites the encodings to
`y: { field: "__flint_series_value" }, color: { field: "__flint_series_key" }` and folds the rows
onto those same `__flint_*` column names. Assembling from its output reproduces the identical leak
and the identical silent stacking.

**The route that works is folding the rows ourselves, with our own column names**, and picking the
template whose series semantics we want:

```js
// wide → long: { region, revenue, cost } → { region, Measure: "revenue", Value: 1200 } …
const long = rows.flatMap((r) => y.map((m) => ({ [x]: r[x], Measure: m, Value: r[m] })));

// bar, multiple y → Grouped Bar Chart (plain Bar Chart stacks folded series)
encodings: { x: { field: x }, y: { field: "Value" }, group: { field: "Measure" } }

// line, multiple y → Line Chart with a color channel
encodings: { x: { field: x }, y: { field: "Value" }, color: { field: "Measure" } }
```

Both produced one named series per `y` column (`revenue`, `cost` — real names on the legend),
`stack: none` on the grouped bar, y-axis named `Value`, and the corner annotation reading `Measure`
instead of `__flint_series_key`. Nothing `__flint_*` anywhere in the option.

The template choice is load-bearing: folded data through plain `Bar Chart` (with `color`) comes
back **stacked**; only `Grouped Bar Chart` — whose channels are
`x, y, group, color, column, row` — dodges the bars side by side.

## Finding 4 — a wrong encoding channel is silently wrong, not an error

Channels are **per template**, from `ecGetTemplateChannels(chartType)`:

| Chart type        | Channels                            |
| ----------------- | ----------------------------------- |
| Bar Chart         | `x, y, color, opacity, column, row` |
| Line Chart        | `x, y, color, opacity, column, row` |
| Grouped Bar Chart | `x, y, group, color, column, row`   |
| Pie Chart         | `size, color, column, row`          |

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

## Finding 6 — `baseSize.height` pins the **plot**; `_height` is plot + furniture, exactly

The earlier reading — "`baseSize` is a floor Flint grows from" — was correct but missed the
invariant underneath. Holding labels constant and sweeping `baseSize.height`:

| `baseSize.height` | `grid.top` | `grid.bottom` | `_height` | `_height − top − bottom` |
| ----------------- | ---------- | ------------- | --------- | ------------------------ |
| 150               | 36         | 151           | 337       | **150**                  |
| 220               | 36         | 151           | 407       | **220**                  |
| 280               | 36         | 151           | 467       | **280**                  |
| 400               | 36         | 151           | 587       | **400**                  |

`_height = baseSize.height + grid.top + grid.bottom`, exactly, in every case. **`baseSize.height`
is the plot height**, and the axis furniture is added on top of it. The furniture is absolute
pixels sized to the labels, not to the canvas:

| Labels                                | rotate | `grid.bottom` |
| ------------------------------------- | ------ | ------------- |
| `N`, `S`, `E`                         | 0      | 61            |
| `North`, `South`, `East`              | 0      | 61            |
| `North Region With A Very Long Label` | 90     | 151           |

The consequence for a fixed-height block is arithmetic: rendering a long-label chart into a 280px
canvas leaves `280 − 36 − 151 = 93px` of actual plot. Flint's contract is the opposite way around —
you pin the plot, it tells you the canvas — and `_height` is the canvas it needs.

## Finding 7 — width is layout-inert, pie honours the pin, partial `baseSize` breaks

- **`baseSize.width` changes no layout decision.** Twelve medium-length categories at widths 500,
  800, 1100 and 1600: identical rotation (90) and identical `grid` at every width. Width only feeds
  the discarded `_width`, so there is no per-surface width to get right — one constant `baseSize`
  serves every canvas, and the block's fluid CSS width stretches the result.
- **Pie fits the same contract.** It emits no `grid`; pinned at `height: 220` it returned
  `_height: 280` — the pin plus 60px of legend/label furniture. `_height` is uniformly "the canvas
  this chart wants", chart kind regardless.
- **Pass both `baseSize` fields or neither.** `baseSize: { height: 220 }` alone returned
  `_width: NaN` (and a furniture-only default height) rather than throwing.

## Finding 8 — `ecApplyLayoutToSpec` is an internal assembly step, not a resize API

Its type is `ecApplyLayoutToSpec(option, context: InstantiateContext, warnings: ChartWarning[]): void` —
the context is Flint's internal instantiation state, not a `{width, height}`. Called with a size as
the context it throws (`Cannot read properties of undefined (reading 'y')`). There is no exported
"re-fit this assembled option to a new canvas" function: re-layout means re-assembly. Any
resize-aware layout would need the full assembly path (and therefore the rows) wherever the resize
is observed.

## Finding 9 — every option carries a `tooltip.formatter` function

Walking all four templates in use (`Bar Chart`, `Line Chart`, `Pie Chart`, `Grouped Bar Chart` over
folded data) for function-valued paths finds exactly one in each: `tooltip.formatter`. Every path an
option travels in this module is JSON — persisted `data_parts`, the compiled report definition, the
`chart-data` response — and `JSON.stringify` drops function values silently, so Flint's tooltip
formatting can never reach a browser regardless of what the builder does. The builder strips
functions explicitly so the loss is visible in one place, snapshots assert what ships, and a future
Flint version cannot smuggle a function somewhere load-bearing (`axisLabel.formatter` would be the
obvious next one).

The folded multi-series option additionally carries a `graphic` text element — bold, top-right
(`right: 10, top: 4`, z 100) — whose text is the fold key column's name. Single-series options have
no `graphic`. It is series-key labeling the legend already covers, and it is stripped.

## Finding 10 — data-shape robustness: empty, null, Date, object

- **Empty rows don't throw.** All four templates assemble `values: []` cleanly; the result is an
  empty chart at full furniture height.
- **Null/missing values don't throw.** Bar drops a null-category row and gaps null measures
  (`series.data: [1200, null, null]`); pie renders them as zero-value slices.
- **Date objects coerce to ISO strings**, ObjectId-like objects via `toString`. A plain-object
  measure value produces a silently wrong chart — but the current builder hands the same rows to
  ECharts with the same class of result, so this is not a regression.
