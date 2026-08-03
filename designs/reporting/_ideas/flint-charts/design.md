# Flint charts: hand the ECharts option to a chart compiler

**Standing: an idea.** Nothing here is scheduled, and it is not a prerequisite for any active
reporting design. It touches `compileReport`, which the [report page](../../ux/report-page/design.md)
work also touches, so it should follow that rather than race it.

Every chart this module draws is shaped by one 43-line function,
[`buildEChartsOption.js`](../../../../plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js).
It takes a chart kind, the agent's declared `x`/`y` columns and the query's rows, and emits an
ECharts option with a `dataset`, an axis pair and one series per `y` column. It sets no label
rotation, no grid padding, no number formatting, no colour scheme, and no pie label layout — a bar
chart of eight long category names renders with its labels overlapping into illegibility. That is a
deliberate floor, not an oversight: the function's own comment says "The AI never contributes chart
config: it names a chart kind, a query and the x/y columns; this function shapes everything else
server-side."

[`flint-chart`](https://github.com/microsoft/flint-chart) is a chart compiler for exactly that
seam. It takes rows, optional semantic types, and a chart type plus field encodings, and derives the
rest — axis names, label rotation, grid padding computed from label extents, colour scheme, pie
label formatters with overlap avoidance — then emits a native **ECharts option**. MIT, zero runtime
dependencies, `echarts` an optional peer, pure Node. It is the same contract our function already
has, implemented by people who have thought about it much harder.

This design swaps the implementation. The chat block, the `EChart` block, the `data-report-chart`
part type and the agent's tool schema all stay as they are — [what the chat block does and does not
need to change](#the-chat-block-needs-no-change) is answered below, because it is the first thing
anyone asks.

Everything asserted about Flint's behaviour here was verified by running it. See
[findings.md](findings.md), reproducible with [probe.mjs](probe.mjs).

## Proposed change

1. **`buildEChartsOption` becomes a call to `assembleECharts`** from `flint-chart/echarts`, keeping
   its `({ chart, x, y, rows })` signature so both call sites — `buildDataParts.js:65` and
   `compileReport.js:520` — keep their shape. It returns `{ option, height }`: the option with
   Flint's private `_`-prefixed keys stripped, and Flint's own `_height` handed back separately.
2. **`bar | line | pie` stays the whole vocabulary.** They map to Flint's `Bar Chart`, `Line Chart`
   and `Pie Chart`, with encodings taken from each template's channel list — `{x, y}` for bar and
   line, `{color, size}` for pie. `CHART_TYPES`, `validateChartSpec`, `render-chart.yaml`'s
   `payloadSchema` and the agent's instructions are all untouched.
3. **Multiple `y` columns go through `normalizeStaticSeries`** from `flint-chart/core` with explicit
   series labels, keeping grouped bars and keeping the column names on the legend. Passing several
   `y` fields directly is not an option — it leaks `__flint_series_key` onto the canvas
   ([finding 3](findings.md#finding-3--multiple-y-columns-leak-internal-names-into-the-rendered-chart)).
4. **Filtered chart sections stop binding `dataset.source` and bind the whole `option` instead.**
   Flint inlines rows into three different shapes depending on chart type and inferred semantics
   ([finding 1](findings.md#finding-1--it-inlines-the-data-and-the-shape-varies)), so there is no
   longer one key to swap. `compileReport`'s `dataBinding` keeps working unchanged for tables and
   KPIs; chart sections get a new binding.
5. **A new `chart-data` endpoint** returns an assembled option for one chart section under one set
   of filter values: same guard, same `AnalyticsPipeline` call and same filter triples as
   `query-data`, then `buildFlintOption` over the rows. `requeryActions` targets it for chart
   sections and leaves table sections on `query-data`.
6. **The chat panel honours Flint's height; a report section does not.** `buildDataParts` puts
   `height` on the `data-report-chart` part and the chat panel binds it with a fallback to today's
   `300`; a report section stays pinned at `400`, because a chart that changes height when you move
   a filter is worse than a slightly cramped one.
7. **Pin `flint-chart` to an exact version** in the plugin package, and add snapshot tests over the
   assembled option for each chart kind so a Flint upgrade that changes output fails loudly rather
   than silently redecorating every chart in the product.
8. **Document the appearance change** in `docs/reporting/reference/presentation-contract.md`. The
   authoring contract does not move — `chart`, `x`, `y` mean exactly what they meant — but what a
   reader gets on screen does.

## The chat block needs no change

`AgentChat` never sees a chart. The path, end to end:

1. The agent calls `render_chart`; `render-chart.yaml` validates the spec and acks with it. Nothing
   is drawn yet — a tool result is model context, re-sent every later step, so it stays small.
2. At turn end the `emit-data-parts` onFinish hook runs each chart's pipeline once and calls
   `buildDataParts`, which calls `buildEChartsOption` and returns
   `{ type: "data-report-chart", data: { title, option } }`.
3. `AgentChat.onDataPart` (`chat.yaml:155`) appends that `data` — an opaque blob to the block — to
   `_state: charts`.
4. The **sibling** results panel renders `type: EChart` with `option: _state: charts.$.option`
   (`chat.yaml:314-319`). `EChart` is a core Lowdefy block from `@lowdefy/blocks-echarts`, in the
   default block set; reporting's manifest declares no plugin for it.

So the chart is assembled in a plugin function on the server and rendered by a stock block in a
panel beside the transcript. Flint compiles _to_ ECharts, which is the format both of those already
speak. No block changes, no framework changes, no data-part contract change beyond the additive
`height` in point 6.

The one thing that _would_ need Lowdefy work is rendering charts **inline in the message stream**
instead of the side panel — that needs `AgentChat` to render custom data parts among the messages.
The side panel is this module's choice, not a framework limit, and it is out of scope here.

## Why this, and why now

The reason to consider it now is that the [reporting UX designs](../../ux/design.md) are about to
put charts in front of people on two surfaces at once — a chat results panel and a saved,
shareable, filterable report page. A shared report is the first artefact in this module that someone
sends to someone else, and "the bar labels overlap" is a much more expensive complaint about a
shared report than about a chat panel.

The reason it is cheap is that the seam was designed correctly from the start. The agent contributes
a chart kind, a query, and two column names; everything else is derived server-side by one function
with one signature and two call sites. Replacing the derivation is a contained change precisely
because the AI was never allowed to touch chart config.

## Current state

- `plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js` — the whole current builder,
  43 lines. Uses the ECharts `dataset` + `encode` form specifically so the data source can be
  swapped later; pie gets `encode: { itemName: x, value: y[0] }`, bar/line one series per `y`.
- `buildDataParts.js:65` — `data: { title, option: buildEChartsOption({ chart, x, y, rows }) }`,
  after `validateChartSpec` and `verifyChartContract` pass. A spec that fails either is skipped
  silently rather than thrown, because a throw in an onFinish hook loses every part of the turn.
- `compileReport.js:520-533` — builds the option with `rows: []`, then
  `option.dataset.source = dataBinding(section, rows)` (`:526`), then emits
  `{ type: "EChart", properties: { height: 400, option } }`.
- `compileReport.js:140-145` — `dataBinding`: an unfiltered section inlines its resolve-time rows; a
  filtered one binds `{ __if_none: [{ __state: "sections.<id>.rows" }, rows] }`.
- `compileReport.js:113-136` — `requeryActions`: one `CallAPI` + `SetState` pair per bound section,
  writing `sections.<id>.rows`. The pairs run sequentially so each `SetState` reads its own
  response before the next call replaces it — `_api` is keyed by endpoint id.
- `compileReport.js:418-420` and `resolve-report.yaml:86-87` — `endpointId` is required and is the
  module's scoped `query-data`.
- `modules/reporting/api/query-data.yaml` — one endpoint, three consumers: the agent's `query_data`
  tool, filter re-queries, and panel downloads. Takes `{ query, filters? }`, returns rows.
  `AnalyticsPipeline` is the single security boundary.
- `constants.js:26` — `CHART_TYPES = ["bar", "line", "pie"]`; `:12` —
  `MAX_DATA_PARTS_SPECS = 8`.
- `validateChartSpec.js` — checks `chart` against `CHART_TYPES`, `title`/`x`/`y` as
  length-capped inert strings, and the query through `validateQuery`. The `x`/`y` contract cannot be
  checked against the pipeline statically, so it is verified against actual rows at render time.
- `modules/reporting/pages/chat.yaml:155` (`onDataPart`), `:303-319` (the results-panel `List` of
  `EChart` blocks at `height: 300`).
- `modules/reporting/pages/report.yaml:24` — the `Dynamic` block's `types.blocks` allowlist, which
  already includes `EChart` and needs no addition.
- `modules/reporting/api/get-conversation-results.yaml:7-9` — charts persisted on a conversation
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
Binding `option` wholesale to `{ __if_none: [{ __state: "sections.<id>.option" }, <resolve-time
option> ] }` is the same pattern `dataBinding` already uses, one level up.

**Rejected: ship Flint to the browser.** A `FlintChart` block in our plugin package could assemble
client-side, which would also unlock `ecApplyLayoutToSpec` on resize. It costs 520 KB of adapter JS
plus `echarts` in a bundle we own, a new block to document and maintain, and it duplicates a render
path Lowdefy already gives us — to move work off a server round-trip that happens anyway.

### `chart-data`, not a widened `query-data`

`query-data`'s `payloadSchema` and `description` are **model-facing**: it is the agent's `query_data`
tool, and the schema is context the model reads on every turn. Adding a chart-assembly parameter
there would advertise a capability the agent must not use — charts go through `render_chart`, which
exists so the spec is validated and the pipeline runs once at turn end.

So chart re-queries get their own endpoint. It duplicates the signed-in guard and the
`AnalyticsPipeline` step, which is a real cost in a module that has kept one security boundary; the
mitigation is that it is the _same_ step against the _same_ connection with the same role
forwarding, and the boundary stays exactly where it was. Table sections and downloads keep hitting
`query-data`, so the interleaved `CallAPI`/`SetState` pairs now span two endpoints — still correct,
because each `SetState` immediately follows its own `CallAPI` and `_api` is keyed per endpoint.

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
already be in place.

### Flint's ordering wins by default

Flint re-sorts categorical bars by value descending, overriding the pipeline's own order
([finding 2](findings.md#finding-2--ordering-is-derived-not-taken-from-the-pipeline)). That is
usually the better chart, and it is the kind of judgement we are adopting Flint to get.

The lever, if it ever needs pulling, is narrow and known: of the 44 semantic types, exactly three —
`Category`, `Direction`, `Unknown` — re-sort, and `Category` is what Flint infers for a plain string
column. Passing `semantic_types: { [x]: "Name" }` preserves pipeline order. (`encodings.x.sort` is
not the lever: `null`, `false` and `"none"` are all accepted silently and all still sort.)

No knob is added for it now. There is no concrete case of a deliberate non-measure `$sort` being
charted, and a `preserveOrder` flag on the spec would be authoring surface owed forever for a
speculative need.

### `_height` is honoured in chat and ignored in a report

Flint treats `baseSize` as a floor and grows the canvas to fit the furniture it chose — base
800 × 400 came back 922 × 587 — and its `grid` is absolute pixels, up to 151 of them at the bottom
for a rotated long label ([finding 6](findings.md#finding-6--basesize-is-a-floor-flint-grows-from-and-_height-is-its-answer)).
Our blocks have fixed heights: 300 in the chat panel, 400 in a report section. A label-heavy chart in
a 400px block spends nearly half of it on axis furniture.

`_height` is Flint's own answer to how tall the chart wants to be, so the chat panel uses it — that
panel is a scrolling list where a taller chart is fine, and `300` there was arbitrary. A report
section keeps `400`, because a section that resizes every time a filter moves is a worse defect than
a cramped axis. This also keeps the filtered-chart binding to a single state key.

Persisted chat charts predate the field, so the panel binds
`{ _if_none: [{ _state: "charts.$.height" }, 300] }`.

### Multi-`y` goes through `normalizeStaticSeries`, or it does not ship

Two `y` columns passed to Flint's `y` encoding produce a stacked bar with `yAxis.name:
"__flint_series_value"` and a `graphic` text element rendering the literal string
`__flint_series_key` on the canvas. Both of those are user-visible. `flint-chart/core` exports
`normalizeStaticSeries` with `STATIC_SERIES_KEY_COLUMN` / `STATIC_SERIES_VALUE_COLUMN`, which is
evidently the supported route, and it needs label overrides so the legend reads the column names.

`y` is an array in the current contract and the demo exercises multi-series charts, so this is not
an edge case to defer — a multi-`y` chart that renders a placeholder string is a worse product than
the plain builder. If the `normalizeStaticSeries` path cannot be made to produce grouped bars with
real labels, the change does not ship.

### Strip the `_`-keys, though they parse cleanly today

The assembled option carries `_width`, `_height`, `_dataLength`, `_transform` and `_pivot`.

These do **not** break Lowdefy's operator parsing, and it is worth recording why, because the
repo's "no underscore-prefixed fields" rule makes the opposite assumption look obvious. Operator
detection fires only on an object whose single non-`~` key starts with the prefix
(`@lowdefy/operators`, `evaluateOperators.js:93-96`), and a walk of the bar, multi-series, line and
pie outputs found no single-key `_`-prefixed object anywhere
([finding 5](findings.md#finding-5--the-_-prefixed-keys-are-safe-to-pass-through-but-should-still-be-stripped)).

They are stripped anyway: they are private metadata that would otherwise be persisted forever into
conversation `data_parts` and into report specs, `_width`/`_height` compete with the block's own
`height`, and a future Flint version could emit a shape where the single-key rule does bite.

`_transform` and `_pivot` are the interesting ones — they enumerate alternate views of the same
chart (flip the axes, switch bar to lollipop). Discarding them now costs nothing and they can be
kept deliberately if a view-switcher is ever designed.

### Pin exactly, and snapshot the output

`flint-chart` is at `0.4.1` — ten releases, the latest a few days old. It is pre-1.0 and moving, and
its whole value is that it makes styling decisions for us, which is exactly the thing that changing
under us would be hard to notice. Zero runtime dependencies keeps the supply-chain surface small,
but it says nothing about output stability.

So: an exact version pin, and snapshot tests over the assembled option for each chart kind and for
the multi-`y` case. A Flint upgrade then shows up as a failing snapshot diff to read, rather than as
every chart in the product quietly changing.

## Architecture / data flow

```
render_chart (tool)         → validateChartSpec → ack with the spec (small; it is model context)
emit-data-parts (onFinish)  → AnalyticsPipeline per chart → buildDataParts
                                → buildFlintOption → { option, height }
                                → { type: "data-report-chart", data: { title, option, height } }
chat.yaml onDataPart        → _state.charts[] → results panel EChart

resolve-report              → AnalyticsPipeline per section → compileReport
  unfiltered chart section  → buildFlintOption(rows)            → EChart { height: 400, option }
  filtered chart section    → buildFlintOption(resolve rows)    → EChart { height: 400, option:
                                                                   __if_none[__state, option] }
                            → onChange: CallAPI chart-data → SetState sections.<id>.option

chart-data (new)            → signed-in guard → AnalyticsPipeline { query, filters, roles }
                            → buildFlintOption → { option }
query-data (unchanged)      → rows, for tables, downloads, and the agent's tool
```

## Files changed (anticipated)

- `plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js` → rewritten as
  `buildFlintOption.js` (rename: the name should say where the option comes from), returning
  `{ option, height }`.
- `plugins/modules-mongodb-plugins/src/analytics/buildDataParts.js` — put `height` on the chart part.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — chart sections bind `option`
  rather than `dataset.source`; `requeryActions` splits chart sections onto the chart endpoint; a
  second required `chartEndpointId` parameter beside `endpointId`.
- `plugins/modules-mongodb-plugins/package.json` — `flint-chart` at an exact version.
- `modules/reporting/api/chart-data.yaml` — new.
- `modules/reporting/api/resolve-report.yaml` — pass `chartEndpointId`.
- `modules/reporting/module.lowdefy.yaml` — export `chart-data`; bump `version`.
- `modules/reporting/pages/chat.yaml` — bind the panel chart height with a `300` fallback.
- `docs/reporting/reference/presentation-contract.md` — note that chart appearance is compiled by
  Flint, that `chart`/`x`/`y` are unchanged, and that ordering is derived rather than taken from the
  pipeline.
- Tests: option snapshots per chart kind and for multi-`y`; `compileReport` assertions for the new
  chart binding and the split endpoint; a `buildDataParts` assertion for `height`.
- A changeset covering the plugin and module change.

## Demo consumer

`apps/demo/api/reporting-seed-example-report.yaml` already seeds a report carrying bar chart
sections with `filterBy`, alongside every filter control. That is the filtered-chart path in
production shape, so the new binding and the new endpoint are exercised by the demo as it stands —
no new seed data, no new page. Verification is `pnpm ldf:b` plus reading the generated
`.lowdefy/server/build/pages/**` artefact for the report page to confirm the chart section's
`option` binding and its `CallAPI` target.

The chat path is exercised by asking the demo assistant for a chart, which needs a live server and
real secrets — a `/r:dev-test` step, not a build gate.

## Resolved questions

- **Does Flint need semantic types?** No. Omitting `semantic_types` produced byte-identical output
  to supplying it in the bar case; Flint profiles the data. The agent does not have to learn a
  semantic vocabulary.
- **Does the chat block need changing?** No — see [above](#the-chat-block-needs-no-change). Only
  inline-in-transcript rendering would, and that is out of scope.
- **Does `EChart` need a plugin declaration?** No. `@lowdefy/blocks-echarts` is in the default block
  set, and `report.yaml`'s `Dynamic` allowlist already permits `EChart`.
- **Can the `dataset.source` swap survive?** No. Three different inline row shapes across three
  chart kinds, and layout derived from the data.
- **Do the `_`-prefixed keys break operator parsing?** No — single-key objects only, and there are
  none. Stripped for other reasons.
- **Can pipeline ordering be preserved?** Yes, via `semantic_types`, and only three of the 44 types
  re-sort. Not wired up, because nothing concrete asks for it.
- **How big is the dependency?** 520 KB of JS for `flint-chart/echarts`, server-side only. The
  33 MB unpacked figure is source maps, `test-data` and `gallery`.

## Non-goals

- **Expanding beyond `bar | line | pie`.** The prize, and a separate design — it needs per-template
  channel gating, agent instruction changes and a docs pass.
- **A view switcher over `_transform` / `_pivot`.** Flint hands us the alternate views; nothing has
  asked for the control.
- **Client-side assembly and resize-aware layout.** Needs Flint in the browser bundle; see the
  rejection above.
- **Charts inline in the chat transcript.** Needs `AgentChat` to render custom data parts.
- **Rewriting persisted chart snapshots.** A conversation's `data_parts` carry baked options and
  nothing rewrites them, so an old chat keeps its old-looking charts while the same query in a
  report re-compiles and looks new. That asymmetry is correct: a transcript is a record, a report is
  live.
- **Vega-Lite, Plotly, Chart.js or Excel output.** Flint compiles to all of them; we render ECharts.

## Risks

- **Flint is pre-1.0 and its output is the product.** Mitigated by an exact pin and snapshot tests,
  but an upgrade will always need a visual look.
- **Multi-`y` is the one part that is not a drop-in.** If `normalizeStaticSeries` cannot produce
  grouped bars with real labels, the change is blocked — a placeholder string on the canvas is worse
  than a plain chart. This is the first thing to prototype.
- **A second endpoint against the same security boundary.** `chart-data` duplicates `query-data`'s
  guard and `AnalyticsPipeline` step. The duplication is mechanical and the boundary does not move,
  but a module that has kept exactly one data endpoint now has two.
- **Every existing report's charts change appearance on next open.** Intended, and worth saying out
  loud before it surprises someone with a shared report.
- **Silent channel failures if the vocabulary is later expanded.** Recorded here so the expansion
  design starts from `ecGetTemplateChannels` rather than a hand-written map.

## Related

- [findings.md](findings.md) — what Flint 0.4.1 actually does, with [probe.mjs](probe.mjs).
- [`reporting/ux`](../../ux/design.md) — the surfaces that display charts;
  [report-page](../../ux/report-page/design.md) also touches `compileReport`.
- [`reporting/report-filters`](../../report-filters/design.md) — the filter re-query mechanism this
  reworks for chart sections.
- [`reporting/open-query-engine`](../../open-query-engine/design.md) — the presentation contract
  (`x`, `y`) and why the agent never writes chart config.
- [flint-chart](https://github.com/microsoft/flint-chart) — MIT, Microsoft.
