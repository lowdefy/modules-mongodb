# Flint charts: hand the ECharts option to a chart compiler

Every chart this module draws is shaped by one small function,
[`buildEChartsOption.js`](../../../plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js).
It takes a chart kind, the agent's declared `x`/`y` columns and the query's rows, and emits an
ECharts option with a `dataset`, an axis pair and one series per `y` column. It sets no label
rotation, no grid padding, no number formatting, no colour scheme, and no pie label layout — a bar
chart of eight long category names renders with its labels overlapping into illegibility. That is a
deliberate floor, not an oversight: the function's own comment says "The AI never contributes chart
config: it names a chart kind, a query and the x/y columns; this function shapes everything else
server-side." The repo has already paid for that floor once: `CHART_HEIGHT` was cut from 400 to 280
(`compileReport.js:114-118`) to stop short charts floating in whitespace, because the builder cannot
size a chart to its content.

[`flint-chart`](https://github.com/microsoft/flint-chart) is a chart compiler for exactly that
seam. It takes rows, optional semantic types, and a chart type plus field encodings, and derives the
rest — axis names, label rotation, grid padding computed from label extents, colour scheme, pie
label formatters with overlap avoidance — then emits a native **ECharts option**. MIT, zero runtime
dependencies, `echarts` an optional peer, pure Node. It is the same contract our function already
has, implemented by people who have thought about it much harder.

This design swaps the implementation. The chat block, the `EChart` block, the `data-report-chart`
part type and the agent's tool schema all stay as they are — [what the chat block does and does not
need to change](#neither-the-chat-block-nor-the-echart-block-changes) is answered below, because it
is the first thing anyone asks.

Everything asserted about Flint's behaviour here was verified by running it, against both `0.4.1`
and `0.5.0` (byte-identical probe output). See [findings.md](findings.md), reproducible with
[probe.mjs](probe.mjs).

## Proposed change

1. **`buildEChartsOption` becomes a call to `assembleECharts`** from `flint-chart/echarts`, keeping
   its `({ chart, x, y, rows })` signature so both call sites — `buildDataParts.js:104` and
   `compileReport.js:1169` — keep their shape. It returns `{ option, height }`: the option stripped
   of everything that must not ship — Flint's private `_`-keys, function-valued keys, and the
   multi-series corner annotation ([the strip decision](#strip-what-must-not-ship-_-keys-functions-and-the-series-annotation))
   — with Flint's `_height` handed back separately.
2. **`bar | line | pie` stays the whole vocabulary.** They map to Flint's `Bar Chart`, `Line Chart`
   and `Pie Chart` — except a multi-`y` `bar`, which maps to `Grouped Bar Chart` (point 3).
   `CHART_TYPES`, `validateChartSpec`, `render-chart.yaml`'s `payloadSchema` and the agent's
   instructions are all untouched.
3. **Multiple `y` columns are hand-folded to long format** — `{ [x], Measure, Value }` rows with the
   `y` column name as `Measure` — then encoded as `Grouped Bar Chart` with `group: Measure` (bar) or
   `Line Chart` with `color: Measure` (line). This keeps grouped bars, puts the real column names on
   the legend, and leaks nothing: Flint's own multi-`y` routes — an array `y` encoding _and_
   `normalizeStaticSeries` — both paint the literal string `__flint_series_key` onto the canvas and
   silently switch to stacking
   ([finding 3](findings.md#finding-3--multi-y-leaks-internal-names-on-the-official-routes-hand-folding-avoids-it)).
4. **The plot is pinned; the canvas varies.** `baseSize.height` is Flint's plot height and
   `_height = plot + grid.top + grid.bottom`, exactly
   ([finding 6](findings.md#finding-6--basesizeheight-pins-the-plot-_height-is-plot--furniture-exactly)).
   The builder passes a constant `baseSize` (`{ width: 1100, height: 180 }` — width is layout-inert,
   [finding 7](findings.md#finding-7--width-is-layout-inert-pie-honours-the-pin-partial-basesize-breaks))
   and **every surface binds the block's `height` to the returned value**: the chat panel from the
   data part (fallback `300` for persisted parts), a report section from the compiled literal or,
   when filtered, from state. `CHART_HEIGHT` is deleted — it exists to compensate for the defect
   this design removes.
5. **Filtered chart sections stop binding `dataset.source` and bind the whole `option` plus
   `height`.** Flint inlines rows into three different shapes depending on chart type and inferred
   semantics ([finding 1](findings.md#finding-1--it-inlines-the-data-and-the-shape-varies)), so there
   is no longer one key to swap. `compileReport`'s `dataBinding` keeps working unchanged for tables;
   chart sections get a new two-key binding.
6. **A new `chart-data` endpoint** returns `{ option, height }` for one chart section under one set
   of filter values. Its payload carries the section's presentation spec alongside the query —
   `{ chart, x, y, query, filters }` — revalidated server-side with `validateChartSpec` before
   anything runs, then the same guard, the same `AnalyticsPipeline` call and the same filter triples
   as `query-data`, then `buildFlintOption` over the rows. `requeryActions` targets it for chart
   sections and leaves table sections on `query-data`.
7. **A Flint throw is contained per chart, on every path.** The chat path already is —
   `buildDataParts` wraps each chart's validate/verify/build in a try that skips that chart
   (`buildDataParts.js:95-108`). The report path is not: today's builder cannot throw, so the
   assembly call sits outside any try and `resolve-report.yaml` runs `compileReport` unguarded — an
   assembly throw would reject the whole resolve. `compileReport` wraps each chart section's
   assembly and renders `brokenSectionBlocks` on failure, the same fallback a contract mismatch
   already gets. On `chart-data`, a throw rejects the endpoint: the `CallAPI` errors, the section
   keeps its last good render — accepted.
8. **Pin `flint-chart` to an exact version** (`0.5.0`) in the plugin package, and add snapshot tests
   over the **stripped** option for each chart kind — what actually ships, not the raw assembly —
   so a Flint upgrade that changes output fails loudly rather than silently redecorating every
   chart in the product.
9. **Document the appearance change** in `docs/reporting/reference/presentation-contract.md`. The
   authoring contract does not move — `chart`, `x`, `y` mean exactly what they meant — but what a
   reader gets on screen does, including that a chart's height now follows its content and that
   tooltips are ECharts defaults (Flint's tooltip formatter is a function, which JSON cannot carry).

## Neither the chat block nor the EChart block changes

`AgentChat` never sees a chart. The path, end to end:

1. The agent calls `render_chart`; `render-chart.yaml` validates the spec and acks with it. Nothing
   is drawn yet — a tool result is model context, re-sent every later step, so it stays small.
2. At turn end the `emit-data-parts` onFinish hook runs each chart's pipeline once and calls
   `buildDataParts`, which calls the builder and returns
   `{ type: "data-report-chart", data: { title, option } }` (`buildDataParts.js:100-105`).
3. `AgentChat`'s `onDataPart` (`pages/chat/components/chat_workspace.yaml:355`) appends that `data`
   — an opaque blob to the block — to `_state: charts`.
4. The **sibling** results panel renders `type: EChart` with `option: _state: charts.$.option`
   (`chat_workspace.yaml:690`, today at a hardcoded `height: 300`). `EChart` is a core Lowdefy block
   from `@lowdefy/blocks-echarts`, in the default block set; reporting's manifest declares no plugin
   for it.

So the chart is assembled in a plugin function on the server and rendered by a stock block in a
panel beside the transcript. Flint compiles _to_ ECharts, which is the format both of those already
speak.

The variable-height decision (point 4) was checked against the block's source rather than assumed.
`EChart` applies `properties.height ?? 300` as an inline style on a wrapper div and renders
`echarts-for-react` at `100%`; `echarts-for-react@3.0.6` binds a `size-sensor` to that div and calls
`echarts.resize()` when it changes, and the block passes `notMerge: true` so a re-assembled option
replaces the old one wholesale. A state-bound `height` therefore takes effect at runtime with no
block change. What the resize does **not** do is re-run Flint: the `grid` in the option is absolute
pixels baked at assembly, so a browser-window resize re-fits the canvas but never rechooses rotation
or padding. That is acceptable because the furniture is width-independent
([finding 7](findings.md#finding-7--width-is-layout-inert-pie-honours-the-pin-partial-basesize-breaks))
— height, the dimension that matters, stays correct at any width.

The one thing that _would_ need Lowdefy work is rendering charts **inline in the message stream**
instead of the side panel — that needs `AgentChat` to render custom data parts among the messages.
The side panel is this module's choice, not a framework limit, and it is out of scope here.

## Why this, and why now

The [reporting UX designs](../ux/design.md) put charts in front of people on two surfaces at once —
a chat results panel and a saved, shareable, filterable report page, now landed. A shared report is
the first artefact in this module that someone sends to someone else, and "the bar labels overlap"
is a much more expensive complaint about a shared report than about a chat panel.

The reason it is cheap is that the seam was designed correctly from the start. The agent contributes
a chart kind, a query, and two column names; everything else is derived server-side by one function
with one signature and two call sites. Replacing the derivation is a contained change precisely
because the AI was never allowed to touch chart config.

## Current state

- `plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js` — the whole current builder.
  Uses the ECharts `dataset` + `encode` form specifically so the data source can be swapped later;
  pie gets `encode: { itemName: x, value: y[0] }`, bar/line one series per `y`.
- `buildDataParts.js:100-105` — `data: { title, option: buildEChartsOption({ chart, x, y, rows }) }`,
  after `validateChartSpec` and `verifyChartContract` pass. A spec that fails either is skipped
  silently rather than thrown, because a throw in an onFinish hook loses every part of the turn.
- `compileReport.js:1168-1183` — builds the option with `rows: []`, then
  `option.dataset.source = dataBinding(section, rows)` (`:1175`), then emits
  `{ type: "EChart", properties: { height: CHART_HEIGHT, option } }`.
- `compileReport.js:114-118` — `CHART_HEIGHT = 280`, cut from 400 because a handful of categories
  in a near-square canvas "became enormously wide bars floating in whitespace".
- `compileReport.js:283-289` — `dataBinding`: an unfiltered section inlines its resolve-time rows; a
  filtered one binds `{ __if_none: [{ __state: "sections.<id>.rows" }, rows] }`.
- `compileReport.js:256-279` — `requeryActions`: one `CallAPI` + `SetState` pair per bound section,
  writing `sections.<id>.rows`. The pairs run sequentially so each `SetState` reads its own
  response before the next call replaces it — `_api` is keyed by endpoint id.
- `compileReport.js:186-210` — `sectionDownload`: each section's CSV download re-queries
  `endpointId` with the section's own query and pipes the response — a bare row array — into
  `DownloadCsv`.
- `compileReport.js:824-825` and `resolve-report.yaml:164-165` — `endpointId` is required and is the
  module's scoped `query-data`.
- `modules/reporting/api/query-data.yaml` — the open query endpoint, two consumers since the agent's
  tool split off: report filter re-queries and panel/section downloads. Takes `{ query, filters? }`,
  returns a **bare row array** (its own header records that a display key on the response would
  break the `DownloadCsv` consumers). `AnalyticsPipeline` is the single security boundary.
- `modules/reporting/api/query-data-tool.yaml` — the agent's read path: same guard, same
  `AnalyticsPipeline`, tighter `maxResultBytes`, returns `{ display, rows }`. This is the endpoint
  whose `payloadSchema` is model-facing, not `query-data`.
- `constants.js:33` — `CHART_TYPES = ["bar", "line", "pie"]`; `:12` — `MAX_DATA_PARTS_SPECS = 8`.
- `validateChartSpec.js` — checks `chart` against `CHART_TYPES`, `title`/`x`/`y` as
  length-capped inert strings, and the query through `validateQuery`. The `x`/`y` contract cannot be
  checked against the pipeline statically, so it is verified against actual rows at render time.
- `modules/reporting/pages/chat/components/chat_workspace.yaml:355` (`onDataPart`), `:686-694` (the
  results-panel `EChart` at `height: 300`).
- `modules/reporting/pages/report.yaml:49` — the `Dynamic` block's `types.blocks` allowlist, which
  already includes `EChart` and needs no addition.
- `modules/reporting/api/get-conversation-results.yaml:7-9,100` — charts persisted on a conversation
  carry "a baked ECharts option (a snapshot of the data as of the turn)"; downloads re-run live.
- Existing tests: `buildDataParts.test.js`, `compileReport.test.js`,
  `compileReport.declared.test.js`, `verifyContract.test.js`.

## Key decisions and rationale

### One builder serves both surfaces, so the report page's data swap has to go

The tempting cheap version — Flint in the chat panel, the current builder for report sections — is
the one option to reject outright. It would make the same query look one way in chat and another way
in the report saved from it, and worse, a report with filters would mix both looks _within one
page_: unfiltered sections have their rows at compile time and could go through Flint, filtered ones
could not. Chart appearance is not a per-section concern, so the builder cannot be either.

That forces the real work. Flint's option is data-dependent in a way ours deliberately is not: rows
land in `xAxis.data` + numeric series, or as `[x, y]` pairs, or as `{name, value}` objects, chosen
by chart type and inferred semantics, and the grid padding is computed from the label extents of the
actual data. There is no `dataset.source` to reassign. So a filtered chart section must be
re-assembled wherever its new rows appear.

It appears on the server. `requeryActions` already round-trips every filter change through
`query-data` and writes the returned rows into state — so the rows a filtered chart needs are
already passing through a server endpoint that could assemble the option instead of returning rows.
The compiled section binds `option` and `height` wholesale, `__if_none` over a state key with the
resolve-time value as fallback — the same pattern `dataBinding` already uses, one level up, twice:

```
option: { __if_none: [{ __state: "sections.<id>.option" }, <resolve-time option>] }
height: { __if_none: [{ __state: "sections.<id>.height" }, <resolve-time height>] }
```

and the section's `SetState` writes both keys from the one `chart-data` response.

**Rejected: ship Flint to the browser.** A `FlintChart` block in our plugin package could assemble
client-side. It costs 520 KB of adapter JS plus `echarts` in a bundle we own, a new block to
document and maintain, and it duplicates a render path Lowdefy already gives us — to move work off a
server round-trip that happens anyway. It would not even buy resize-aware layout: there is no
"re-fit this option" API, re-layout is re-assembly from rows
([finding 8](findings.md#finding-8--ecapplylayouttospec-is-an-internal-assembly-step-not-a-resize-api)),
and width turns out not to affect layout anyway (finding 7).

### `chart-data`, not a widened `query-data`

An earlier draft of this design rested this decision on `query-data` being the agent's tool, whose
`payloadSchema` the model reads. That premise is gone — the agent's read path split off to
`query-data-tool.yaml`, precisely so the two consumers' needs could diverge. The surviving argument
is the return shape: `query-data` returns a bare row array, and its header records why — the CSV
download consumers (`sectionDownload`, the panel download) pipe the response straight into
`DownloadCsv`, so the response cannot grow a wrapper object. A chart re-query needs `{ option,
height }`, which is not a row array. Overloading one endpoint to return two shapes keyed off a
payload flag is strictly worse than two endpoints with one shape each.

So chart re-queries get their own endpoint. It duplicates the signed-in guard and the
`AnalyticsPipeline` step — the same duplication `query-data-tool` already made, with the same
mitigation: it is the _same_ step against the _same_ connection with the same role forwarding, and
the boundary stays exactly where it was. Table sections and downloads keep hitting `query-data`, so
the interleaved `CallAPI`/`SetState` pairs now span two endpoints — still correct, because each
`SetState` immediately follows its own `CallAPI` and `_api` is keyed per endpoint.

The payload carries the section's presentation spec — `{ chart, x, y }` alongside `query` and
`filters` — because assembly needs it and the compiled `CallAPI` is client-executed, making every
field of it client-tamperable input. That is the same status `query` already has, and it gets the
same treatment: revalidate server-side. `validateChartSpec` runs first (it gates `chart` to
`CHART_TYPES`, caps `x`/`y` as inert strings, and walks the query through `validateQuery`), so
tampering buys nothing the viewer's roles don't already allow — the data itself is still guarded by
`AnalyticsPipeline`. **Rejected:** passing `report_id` + section id and reading the spec from the
reports collection server-side. It removes the tamper surface entirely, but at the cost of a DB
read per filter change and coupling the endpoint to report storage, to defend inputs that are
inert once revalidated.

### The vocabulary stays at three kinds, and that is the point of doing this first

Flint offers 37 chart types. Taking them is a separate, larger design: it changes `render-chart.yaml`'s
enum, `validateChartSpec`, the agent instructions, the docs, and the report spec's stored shape, and
it has to gate encodings against `ecGetTemplateChannels` per type — because a channel the template
does not know is dropped **silently** and yields a plausible, wrong chart
([finding 4](findings.md#finding-4--a-wrong-encoding-channel-is-silently-wrong-not-an-error): pie
via a `theta` channel drew every slice equal). An unknown chart _type_ throws cleanly; a wrong
channel does not.

Keeping the vocabulary fixed means this change has no authoring surface at all. Every saved report
spec stays valid, the agent's instructions do not move, and the only observable difference is that
charts look better. It also makes the vocabulary expansion cheap afterwards, since the compiler will
already be in place. (`Grouped Bar Chart` in point 3 is an internal template choice for multi-`y`
`bar`, not a vocabulary change — the spec still says `bar`.)

### The plot is pinned and the canvas varies, because that is Flint's contract

Flint's layout inverts ours. Our blocks pin the canvas (`300` in the chat panel, `CHART_HEIGHT: 280`
in a report section) and the plot gets whatever is left; Flint pins the plot (`baseSize.height`) and
grows the canvas by exactly the furniture the labels need — `_height = plot + grid.top +
grid.bottom`, verified exactly across five heights (finding 6). The furniture is absolute pixels:
61px bottom for short labels, 151px for long rotated ones, identical at every canvas size. Forcing
Flint's output into a fixed 280px canvas leaves 93px of plot under long labels — a worse chart than
the current builder draws, which would make the whole change a regression exactly where it is
supposed to help.

So every surface adopts Flint's answer. The builder pins the plot at a constant
(`baseSize: { width: 1100, height: 180 }` — width is layout-inert so one constant serves both
surfaces) and returns `_height` as `height`; blocks bind it. The plot constant started at 220 to
keep a short-label chart's canvas near today's 280/300; the first visual check (a chat-panel bar
chart with rotated labels) read as too tall and it was cut to 180 — a short-label canvas of 277,
a rotated-label one of 421. One observed exception: the pie template ignores the pin below its own
floor — a 180 plot still yields the same 280 canvas a 220 plot did, so pies simply stay 280. Charts on one page get identical plot areas and differ only by the axis
furniture their own labels need — which is the visually consistent outcome, more so than equal
canvases hiding unequal plots.

The accepted cost is that the page moves: a filter change that lengthens labels re-assembles the
option, changes `height`, and shifts the blocks below the section. The rejected alternative — a
two-pass assemble that reads the furniture then re-assembles with `baseSize.height = 280 − top −
bottom` so the canvas never moves — keeps the page still but silently shrinks the plot toward 93px
as labels grow, which is the same defect this design exists to remove, minus only the overflow.
Between "the page reflows" and "the chart quietly degrades", the reflow is the honest defect.

Persisted chat charts predate the `height` field, so the panel binds
`{ _if_none: [{ _state: "charts.$.height" }, 300] }`.

### Multi-`y` is hand-folded; both of Flint's own routes are rejected

Two `y` columns passed to Flint's `y` encoding produce a stacked bar with `yAxis.name:
"__flint_series_value"` and a `graphic` text element rendering the literal string
`__flint_series_key` on the canvas. `normalizeStaticSeries` — which looked like the supported route
— turns out to be exactly that internal fold exposed: it rewrites the encodings onto the same
`__flint_*` column names, and assembling from its output reproduces the identical leak and the
identical silent stacking (finding 3).

The fix is to fold ourselves, three lines, with human column names (`Measure`, `Value`), and pick
the template that matches the current builder's semantics: `Grouped Bar Chart` with
`group: Measure` for bar — plain `Bar Chart` stacks folded series — and `Line Chart` with
`color: Measure` for line. Verified output: one named series per `y` column with the real column
names on the legend, `stack: none`, y-axis named `Value`, nothing `__flint_*` anywhere. The earlier
draft's "if this cannot be made to work, the change does not ship" clause is resolved: it works.

Column names are humanized before assembly — the rows are re-keyed and the encodings point at
Title Case display names (`contact_count` → `Contact Count`), because Flint puts the encoded
column names verbatim on axis titles, legends and tooltips, and pipeline columns are snake_case
or camelCase. Data values are never touched, and single-series rows are narrowed to the encoded
columns in the same pass (the fold already was). Added after the first visual check, where a
chart shipped with a `contact_count` y-axis.

One naming consequence: a multi-`y` chart's y-axis reads `Value` rather than a column name. The
single-`y` case keeps the real column name, and multi-series charts never had a single honest
y-axis name anyway — the legend carries the column names. The fold's other name leak — a `graphic`
corner annotation painting the fold key column's name (`Measure`) onto the canvas — is stripped;
see [the strip decision](#strip-what-must-not-ship-_-keys-functions-and-the-series-annotation).

### Flint's ordering wins by default

Flint re-sorts categorical bars by value descending, overriding the pipeline's own order
([finding 2](findings.md#finding-2--ordering-is-derived-not-taken-from-the-pipeline)). That is
usually the better chart, and it is the kind of judgement we are adopting Flint to get. The same
re-sort applies to the hand-folded multi-series route, so behaviour is consistent across single- and
multi-`y`.

The lever, if it ever needs pulling, is narrow and known: of the 44 semantic types, exactly three —
`Category`, `Direction`, `Unknown` — re-sort, and `Category` is what Flint infers for a plain string
column. Passing `semantic_types: { [x]: "Name" }` preserves pipeline order — verified on the folded
route too. (`encodings.x.sort` is not the lever: `null`, `false` and `"none"` are all accepted
silently and all still sort.)

No knob is added for it now. There is no concrete case of a deliberate non-measure `$sort` being
charted, and a `preserveOrder` flag on the spec would be authoring surface owed forever for a
speculative need.

### Strip what must not ship: `_`-keys, functions, and the series annotation

`buildFlintOption` ends with one walk over the assembled option that removes three things, each for
its own reason.

**The `_`-prefixed keys** (`_width`, `_height`, `_dataLength`, `_transform`, `_pivot`). These do
**not** break Lowdefy's operator parsing, and it is worth recording why, because the repo's "no
underscore-prefixed fields" rule makes the opposite assumption look obvious. Operator detection
fires only on an object whose single non-`~` key starts with the prefix (`@lowdefy/operators`,
`evaluateOperators.js:93-96`), and a walk of the bar, multi-series, line and pie outputs found no
single-key `_`-prefixed object anywhere
([finding 5](findings.md#finding-5--the-_-prefixed-keys-are-safe-to-pass-through-but-should-still-be-stripped)).
They are stripped anyway: they are private metadata that would otherwise be persisted forever into
conversation `data_parts` and into report specs, `_width`/`_height` compete with the block's own
`height` (which is why `_height` is returned beside the option rather than left inside it), and a
future Flint version could emit a shape where the single-key rule does bite. `_transform` and
`_pivot` are the interesting ones — they enumerate alternate views of the same chart (flip the
axes, switch bar to lollipop). Discarding them now costs nothing and they can be kept deliberately
if a view-switcher is ever designed.

**Function-valued keys.** Every assembled option — all four templates — carries a function at
`tooltip.formatter` ([finding 9](findings.md#finding-9--every-option-carries-a-tooltipformatter-function)).
Every path an option travels is JSON (persisted `data_parts`, the compiled report definition, the
`chart-data` response), and `JSON.stringify` drops function values silently — so Flint's tooltip
formatting can never reach a browser, whatever we do. Stripping functions explicitly makes that
fact visible in one place instead of implicit in serialization, keeps a future Flint version from
smuggling a function somewhere load-bearing (an `axisLabel.formatter` would otherwise vanish
between the snapshot and the screen), and makes the snapshot tests honest: they snapshot the
stripped option, which is byte-for-byte what ships. Tooltips degrade to the ECharts default —
recorded in the presentation-contract doc, and an acceptable loss since the default tooltip is
serviceable.

**The multi-series corner annotation.** The folded multi-series option carries a `graphic` text
element — bold, top-right — whose text is the fold key column's name, i.e. the literal word
`Measure` ([finding 9](findings.md#finding-9--every-option-carries-a-tooltipformatter-function)).
It is series-key labeling for the legend, the legend already carries the real column names, and
single-series charts have no such element — so keeping it would paint an arbitrary constant on
every multi-series chart and nothing on the rest. Stripped.

**Width-derived absolutes.** Finding 7's "width is layout-inert" held for grid and rotation but
not everywhere: the Grouped Bar Chart template emits an absolute `series[].barWidth` computed
from `baseSize.width`, and the folded Line Chart places its legend at an absolute `legend.left`
offset the same way. The block renders the canvas at the panel's real CSS width — far narrower
than the constant 1100 in the chat panel — so the fixed bars overflowed their category slots and
drew on top of each other, and the line legend sat off-canvas. Found in the first dev-test of a
grouped chart. The pass deletes every `series[].barWidth` (ECharts then sizes bars into the slots
it actually has; the percentage `barGap`/`barCategoryGap` that keep the grouping survive) and
replaces a numeric `legend.left` with the `right: 10` the bar templates already use. Pie is
unaffected (percentage `center`, small fixed `radius`).

### Pin exactly, and snapshot the output

`flint-chart` is at `0.5.0` — eleven releases, pre-1.0 and moving. Its whole value is that it makes
styling decisions for us, which is exactly the thing that changing under us would be hard to notice.
Zero runtime dependencies keeps the supply-chain surface small, but it says nothing about output
stability. (The one data point so far is reassuring: `0.4.1` → `0.5.0` produced byte-identical probe
output.)

So: an exact version pin at `0.5.0`, and snapshot tests over the assembled option for each chart
kind and for the folded multi-`y` cases. A Flint upgrade then shows up as a failing snapshot diff to
read, rather than as every chart in the product quietly changing.

## Architecture / data flow

```
render_chart (tool)         → validateChartSpec → ack with the spec (small; it is model context)
emit-data-parts (onFinish)  → AnalyticsPipeline per chart → buildDataParts
                                → buildFlintOption → { option, height }
                                → { type: "data-report-chart", data: { title, option, height } }
chat onDataPart             → _state.charts[] → results panel EChart
                                height: _if_none [charts.$.height, 300]

resolve-report              → AnalyticsPipeline per section → compileReport
  unfiltered chart section  → buildFlintOption(rows)         → EChart { height, option }
  filtered chart section    → buildFlintOption(resolve rows) → EChart {
                                option: __if_none [__state sections.<id>.option, option],
                                height: __if_none [__state sections.<id>.height, height] }
                            → onChange: CallAPI chart-data
                                → SetState sections.<id>.option + sections.<id>.height

chart-data (new)            → signed-in guard → validateChartSpec { chart, x, y, query }
                            → AnalyticsPipeline { query, filters, roles }
                            → buildFlintOption → { option, height }
                            (a throw rejects; the CallAPI errors, the section keeps its last render)
query-data (unchanged)      → bare row array, for tables, downloads and filter re-queries
query-data-tool (unchanged) → { display, rows }, for the agent
```

## Files changed (anticipated)

- `plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js` → rewritten as
  `buildFlintOption.js` (rename: the name should say where the option comes from), returning
  `{ option, height }`; owns the fold, the template mapping and the `baseSize` constant.
- `plugins/modules-mongodb-plugins/src/analytics/buildDataParts.js` — put `height` on the chart part.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — chart sections bind `option`
  and `height` rather than `dataset.source`, with the assembly wrapped in a try that renders
  `brokenSectionBlocks` on a Flint throw; `requeryActions` splits chart sections onto the chart
  endpoint; a second required `chartEndpointId` parameter beside `endpointId`; `CHART_HEIGHT`
  deleted.
- `plugins/modules-mongodb-plugins/package.json` — `flint-chart` at exactly `0.5.0`.
- `modules/reporting/api/chart-data.yaml` — new; payload `{ chart, x, y, query, filters }`,
  revalidated with `validateChartSpec` before the pipeline runs.
- `modules/reporting/api/resolve-report.yaml` — pass `chartEndpointId`.
- `modules/reporting/module.lowdefy.yaml` — export `chart-data`; bump `version`.
- `modules/reporting/pages/chat/components/chat_workspace.yaml` — bind the panel chart height with a
  `300` fallback.
- `docs/reporting/reference/presentation-contract.md` — note that chart appearance is compiled by
  Flint, that `chart`/`x`/`y` are unchanged, that ordering is derived rather than taken from the
  pipeline, that chart height follows content, and that tooltips are ECharts defaults.
- Tests: snapshots of the **stripped** option per chart kind and for folded multi-`y` (bar and
  line), plus an assertion that no function values or `_`-keys survive the strip; `compileReport`
  assertions for the two-key chart binding, the split endpoint, and a chart section rendering
  `brokenSectionBlocks` when assembly throws; a `buildDataParts` assertion for `height`.
- A changeset covering the plugin and module change.

## Demo consumer

`apps/demo/api/reporting-seed-example-report.yaml` already seeds a report carrying bar chart
sections with `filterBy`, alongside every filter control. That is the filtered-chart path in
production shape, so the new binding and the new endpoint are exercised by the demo as it stands —
no new seed data, no new page. Verification is `pnpm ldf:b` plus reading the generated
`.lowdefy/server/build/pages/**` artefact for the report page to confirm the chart section's
`option`/`height` bindings and its `CallAPI` target.

The chat path is exercised by asking the demo assistant for a chart, which needs a live server and
real secrets — a `/r:dev-test` step, not a build gate.

## Resolved questions

- **Does Flint need semantic types?** No. Omitting `semantic_types` produced byte-identical output
  to supplying it in the bar case; Flint profiles the data. The agent does not have to learn a
  semantic vocabulary.
- **Does the chat block or the EChart block need changing?** No — see
  [above](#neither-the-chat-block-nor-the-echart-block-changes). `EChart`'s height is a wrapper-div
  style watched by a size sensor, so a state-bound height re-fits the chart at runtime. Only
  inline-in-transcript rendering would need block work, and that is out of scope.
- **Does `EChart` need a plugin declaration?** No. `@lowdefy/blocks-echarts` is in the default block
  set, and `report.yaml`'s `Dynamic` allowlist already permits `EChart`.
- **Can the `dataset.source` swap survive?** No. Three different inline row shapes across three
  chart kinds, and layout derived from the data.
- **Can multi-`y` produce grouped bars with real labels?** Yes — by hand-folding to long format and
  using `Grouped Bar Chart`/`color`. Both of Flint's own multi-`y` routes leak `__flint_*` names and
  stack; the earlier "does not ship without this" risk is resolved.
- **Can a fixed-height block host Flint's output?** Not acceptably — the furniture is absolute px
  sized to labels (up to 187px of a 280px canvas), so the block height binds to Flint's `_height`
  instead. Verified against the block source that this works at runtime.
- **Do the `_`-prefixed keys break operator parsing?** No — single-key objects only, and there are
  none. Stripped for other reasons.
- **Can pipeline ordering be preserved?** Yes, via `semantic_types`, and only three of the 44 types
  re-sort — verified on the folded multi-series route too. Not wired up, because nothing concrete
  asks for it.
- **Did `0.5.0` change anything `findings.md` relies on?** No — byte-identical probe output against
  `0.4.1`.
- **How big is the dependency?** 520 KB of JS for `flint-chart/echarts`, server-side only. The
  33 MB unpacked figure is source maps, `test-data` and `gallery`.

## Non-goals

- **Expanding beyond `bar | line | pie`.** The prize, and a separate design — it needs per-template
  channel gating, agent instruction changes and a docs pass.
- **A view switcher over `_transform` / `_pivot`.** Flint hands us the alternate views; nothing has
  asked for the control.
- **Client-side assembly and resize-aware layout.** Needs Flint plus the rows in the browser —
  re-layout is re-assembly, there is no refit API (finding 8) — and width does not affect layout
  anyway; see the rejection above.
- **Charts inline in the chat transcript.** Needs `AgentChat` to render custom data parts.
- **Rewriting persisted chart snapshots.** A conversation's `data_parts` carry baked options and
  nothing rewrites them, so an old chat keeps its old-looking charts while the same query in a
  report re-compiles and looks new. That asymmetry is correct: a transcript is a record, a report is
  live.
- **Vega-Lite, Plotly, Chart.js or Excel output.** Flint compiles to all of them; we render ECharts.

## Risks

- **Flint is pre-1.0 and its output is the product.** Mitigated by an exact pin and snapshot tests,
  but an upgrade will always need a visual look. (`0.4.1` → `0.5.0` changed nothing probed.)
- **The report page reflows when a filter changes a chart's height.** Accepted deliberately over the
  alternative (a fixed canvas that silently crushes the plot); recorded so it is read as a decision,
  not a bug.
- **A second data-shaped endpoint against the same security boundary.** `chart-data` duplicates
  `query-data`'s guard and `AnalyticsPipeline` step, as `query-data-tool` already did. The
  duplication is mechanical and the boundary does not move, but the module now has three endpoints
  running the same guard — worth a shared `_ref` for the guard block if a fourth ever appears.
- **Every existing report's charts change appearance on next open.** Intended, and worth saying out
  loud before it surprises someone with a shared report.
- **Silent channel failures if the vocabulary is later expanded.** Recorded here so the expansion
  design starts from `ecGetTemplateChannels` rather than a hand-written map.

## Related

- [findings.md](findings.md) — what Flint 0.5.0 actually does, with [probe.mjs](probe.mjs).
- [`reporting/ux`](../ux/design.md) — the surfaces that display charts;
  [report-page](../ux/report-page/design.md) (landed) reshaped `compileReport`.
- [`reporting/report-filters`](../report-filters/design.md) — the filter re-query mechanism this
  reworks for chart sections.
- [`reporting/open-query-engine`](../open-query-engine/design.md) — the presentation contract
  (`x`, `y`) and why the agent never writes chart config.
- [flint-chart](https://github.com/microsoft/flint-chart) — MIT, Microsoft.
