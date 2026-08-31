# What actually controls report appearance

Evidence for [the report visual polish design](design.md). Everything below was
either **measured by running the code** (Flint probes, palette validator) or read
off a **rendered report** — nothing here is inferred from documentation.

Probed against `flint-chart@0.5.0` (the pinned version),
`@lowdefy/blocks-echarts` 5.5.1, `compileReport.js` at
`plugins/modules-mongodb-plugins/src/analytics/`, and a rendered report from the
demo app (`/ai-reporting/report?report_id=…`, 2660 × 7810 px screenshot,
9 sections). Findings marked A–D come from a second, independent probe pass —
[`probe.mjs`](probe.mjs) records those runs and stays checked in so they can be
re-run against a version bump.

---

## 1. The layer map — who owns which pixel

This was the design's first open question ("Where does styling live?"). Answer:
**the module owns nearly all of it.** Flint owns only the inside of a chart
canvas, and even that is a plain JSON object we already post-process.

| Surface                                                      | Owner                              | Reachable?                                                            |
| ------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------- |
| Section container (card / no card), borders, padding         | `compileReport.js`                 | **Yes** — it emits the block tree; today it emits no container at all |
| Grid spans (`layout.span` on 24 columns), section order      | `compileReport.js`                 | **Yes** — `span: 6` for KPI, `span: 24` for every chart and table     |
| Inter-section spacing (`SECTION_TOP_GAP = 16`)               | `compileReport.js`                 | **Yes**                                                               |
| Block choice (`Statistic`, `EChart`, `AgGridBalham`, `Card`) | `compileReport.js`                 | **Yes**                                                               |
| Table height (`tableHeight(rows)`), column defs              | `compileReport.js`                 | **Yes**                                                               |
| Chart palette, legend position, grid gutters, label rotation | `buildFlintOption.js` post-process | **Yes** — assembled option is a mutable plain object (findings 3–5)   |
| Chart data→geometry mapping, template choice                 | `flint-chart` (upstream)           | No — but every output of it is rewritable before it ships             |
| Page column width (1100px), page chrome, breadcrumb          | `modules/layout` + `report.yaml`   | **Yes** — `content_width: 1100` is set in `pages/report.yaml`         |
| Ant token (`colorPrimary: #7c3aed`), compact algorithm       | consuming app's `lowdefy.yaml`     | No — and must not be assumed; a consumer may set any primary          |

**Consequence for the design:** a polish pass is _not_ blocked on upstream, and
it does not need app-theme cooperation. Two files carry it —
`compileReport.js` for structure and `buildFlintOption.js` for chart internals.

The one genuine constraint: **`colorPrimary` belongs to the consuming app**, so
nothing in the report may be styled _from_ it or assume it. The demo's `#7c3aed`
violet is why the download buttons render purple; that is correct and must stay
incidental.

---

## 2. The rendered report's defects, itemised

Read off the 7810px screenshot. Grouped by owner so each has an address.

### `compileReport.js` — structure

1. **No section containers.** Every section is a bare block on the page plane.
   There is no card, border, or elevation, so no boundary separates a heading
   from the chart it names, or one section from the next. This is the single
   largest difference from every client report in the corpus.
2. **KPI row is not a row.** Four `Statistic` blocks at `span: 6` do sit on one
   line, but with no container they have no equal height, no shared baseline, and
   no rule between them. In the render, `Total Revenue`'s label sits ~16px higher
   than `Total Orders`' — the blocks self-size, so the tallest value pushes its
   own label up and the row reads as four unrelated fragments.
3. **No comparison anywhere.** Not one number carries a delta, a previous-period
   value, or a target. `Workflow Completion Rate 25.0` has no `%`.
4. **Charts and tables are always `span: 24`.** Nine sections × full width =
   7810px of scroll for a report whose data would fit in ~2600px. A 4-slice pie
   and a 3-category bar each own 1100 × ~400px.
5. **Tables don't fit their content in either direction.** `Top Assignees by
Workload` is 2 columns in an 1100px table — ~600px of blank white. `Channel
Performance Analysis` is _clipped_: a 6th column is cut off mid-header at the
   right edge. Same `span: 24` for both; neither width is derived from the
   columns.
6. **Filter scope notes dominate the fold.** `filterControlBlock` puts
   `Also filters: <every other bound section>` in the label's `extra`. The
   reasoning in the code comment is sound for one filter; it does not survive the
   common case. With 4 filters each driving 6 sections, the render carries **4
   near-identical 3-line grey paragraphs** — ~250px, more than any chart, and the
   4 blocks say almost the same thing.
7. **Downloads are orphaned.** Five `download` sections compile to `span: 6`
   Buttons at the very bottom, wrapping 4 + 1 ragged, under no heading. Every
   client report in the corpus puts the download **in the header of the table it
   belongs to** — which the module already does for chart/table sections
   (`sectionDownload`), so the report contains two unrelated download idioms.

### `buildFlintOption.js` — chart internals

8. **The palette fails four of five accessibility checks** (finding 4).
9. **Legend parked in a right-hand gutter.** Flint emits
   `legend: {orient: "vertical", right: 10, top: 20}` and reserves
   `grid.right` for it — measured at **79–163px** depending on the longest series
   name. That gutter is dead plot width on every multi-series chart.
10. **`grid.left: 86` on every axis chart**, regardless of how short the y-tick
    labels are.
11. **Axis labels rotate 90° when they don't need to** (finding 5) — visible on
    `Workflow Actions by Type & Stage`, where `onboarding` / `renewal` /
    `support` are set vertically and collide with the `Workflow Type` axis title
    beneath them.
12. **`axisLabel.fontSize: 10`** — below the app's smallest text size.
13. **`textStyle: undefined`** — charts inherit the ECharts default font stack,
    not the app's, so every chart's type is visibly different from the text
    around it.
14. **Semantic colours are inconsistent across sections.** Because hues are
    assigned by series _index_, `Done` is red in `Workflow Actions by Type &
Stage` while `Cancelled` is yellow; in `Customer Activities by Type & Status`
    `Cancelled` is yellow and `Done` green. The same word gets a different colour
    in two adjacent sections of one report.

---

## 3. The assembled option is fully rewritable

`buildFlintOption` already post-processes Flint's output — it strips `_`-prefixed
keys and function values, overrides `series.barWidth`, replaces `legend.left`
with `legend.right`, and pins pie height and radius. So a rewrite point exists
and is established practice in this file; nothing new has to be invented.

Measured top-level keys on the assembled option:

| Chart                | Keys                                                                           |
| -------------------- | ------------------------------------------------------------------------------ |
| Bar, single `y`      | `tooltip, xAxis, yAxis, series, grid, color` (+ `_`-private)                   |
| Stacked bar (folded) | `tooltip, xAxis, yAxis, series, legend, graphic, grid, color` (+ `_`-private)  |
| Pie                  | `tooltip, series, color` (+ `_`-private) — **no `legend`, no `grid`, no axes** |

### The block layer adds a theme channel — which merges _under_ the option

Verified against `@lowdefy/blocks-echarts` 5.5.1 source and re-run in
[`probe.mjs`](probe.mjs) (findings A/B/B2):

- **The `EChart` block accepts a full ECharts theme object** via
  `properties.theme` — its constructor calls
  `registerTheme("custom_theme_" + blockId, properties.theme)` and hands the
  name to `echarts-for-react`. No fork or new block needed. The module has
  three render sites that can share one theme: the compiled report chart
  blocks, the chat result card (`chat_workspace.yaml`), and the expand modal
  (`expand_chart_modal.yaml`) — the latter two never pass through
  `compileReport`, so the theme is the only vehicle that reaches them.
- **ECharts applies a theme _under_ the option**: a top-level `option.color`
  beats the theme palette (probe B), and a per-series `itemStyle.color` beats
  both (probe B2). Since Flint pins both (finding 4), **a theme alone cannot
  recolor a compiled chart** — the palette swap must happen server-side. The
  theme is the right home for exactly what Flint leaves unset: `textStyle`,
  axis/split-line colors, legend and tooltip text styling,
  `backgroundColor: transparent`.
- **Mark styling is JSON-safe** (probe C/C2): a linear-gradient **object**
  (`{ type: "linear", colorStops: [...] }`) and a bar
  `itemStyle.borderRadius: [4, 4, 0, 0]` both survive the option's JSON
  round-trip and `strip()`'s function removal, and render. Gradient fills and
  rounded bar caps need no function values.

One consequence: chat chart **parts persist the compiled option** (a reopened
conversation shows the option snapshotted at the turn that produced it), so a
palette change reaches old chat cards only via the theme — which the palette
deliberately does not ride. Accepted: old chat snapshots keep the palette of
their day, exactly as they keep their numbers; saved reports re-compile per
open and always get the current look.

---

## 4. The palette Flint ships fails; the reference palette passes

`option.color` is Flint's only palette declaration and it is **the stock ECharts
default**, identical on all three chart kinds:

```
["#5470c6","#91cc75","#fac858","#ee6666","#73c0de","#3ba272","#fc8452","#9a60b4","#ea7ccc","#d48265"]
```

Run through the data-viz validator against the real light card surface
(`#ffffff`):

```
$ validate_palette.js "#5470c6,#91cc75,#fac858,#ee6666,#73c0de,#3ba272,#fc8452,#9a60b4" \
    --mode light --surface "#ffffff"

[FAIL] Lightness band      outside band: #91cc75 (0.784), #fac858 (0.857)
[FAIL] Chroma floor        below floor (reads gray): #73c0de (0.087)
[FAIL] CVD separation      worst adjacent #fc8452↔#3ba272 ΔE 4.0 (protan)
[FAIL] Normal-vision floor worst adjacent #fac858↔#91cc75 ΔE 13.9 — below 15
[WARN] Contrast vs surface below 3:1: #91cc75, #fac858, #73c0de, #fc8452
→ FAILED
```

`ΔE 13.9` on the normal-vision floor is the damning one: **slots 2 and 3 are hard
to tell apart with full colour vision**, before CVD is considered. Under
`--pairs all` it degrades further (`#9a60b4↔#5470c6` protan ΔE 3.0).

The data-viz reference categorical palette, validated against this repo's actual
surfaces — `#ffffff` (Ant light card) and `#141414` (Ant dark card) rather than
the skill's own defaults:

```
light: #2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948
  [PASS] lightness · [PASS] chroma · [PASS] CVD (worst adjacent ΔE 9.1)
  [PASS] normal-vision (worst adjacent ΔE 19.6)
  [WARN] contrast: #1baf7a (2.82), #eda100 (2.17), #e87ba4 (2.69) — relief required
  → ALL CHECKS PASS

dark:  #3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767
  [PASS] all five, including contrast ≥ 3:1
  → ALL CHECKS PASS
```

The light-mode contrast WARN is **not dismissable** — it obligates visible labels
or a table view. Both are already true of a compiled report: every multi-series
chart carries a legend, and every chart section carries a `⤓` CSV export. Stated
so the obligation is discharged deliberately rather than by luck.

### Overriding it takes two writes, not one

Flint declares the palette **twice** — once as `option.color`, and again as a
concrete hex on each series:

```js
// stacked bar, measured
series: [
  { name: "online", itemStyle: { color: "#5470c6" } },
  { name: "retail", itemStyle: { color: "#91cc75" } },
  { name: "partner", itemStyle: { color: "#fac858" } },
];
// bar, single y
series: [{ itemStyle: { borderRadius: 0, color: "#5470c6" } }];
// pie — no per-slice color; itemStyle carries only borderRadius
series: [{ itemStyle: { borderRadius: 0 } }];
```

**Setting `option.color` alone silently does nothing on bar and line**, because
the per-series `itemStyle.color` wins. Both must be rewritten, index-wise and in
the same order. Pie is the exception: it has no per-slice colour, so `option.color`
alone drives it.

This is the kind of half-fix that looks correct in a diff and is wrong on screen —
worth a test that asserts no stock hex survives anywhere in the option tree.

---

## 5. Flint's label rotation ignores available width

The vertical axis labels in the render are not a data problem, and the rule is
readable straight off Flint's source
(`flint-chart/dist/echarts/index.cjs:4774-4785`):

```js
var EC_BAR_SHORT_CATEGORY_COUNT = 4;
var EC_BAR_SHORT_CATEGORY_LABEL_LEN = 8;
function categoryAxisLabelRotateDeg(categories, channelType) {
  if (channelType === "quantitative") return 0;
  const labels = categories.map((c) => String(c));
  if (labels.length === 0) return 0;
  const maxLen = Math.max(...labels.map((s) => s.length));
  if (labels.length <= EC_BAR_SHORT_CATEGORY_COUNT && maxLen <= EC_BAR_SHORT_CATEGORY_LABEL_LEN) {
    return 0;
  }
  return 90;
}
```

**`rotate` is 0 iff there are ≤ 4 categories AND the longest label is ≤ 8
characters; otherwise 90.** Width is never consulted, and 0/90 are the only
outputs. The measurements agree (`Stacked Bar Chart`, `baseSize.height: 180`):

| Categories                               | Canvas width | `axisLabel.rotate` | Why                              | `_height` | `grid.bottom` | `grid.right` |
| ---------------------------------------- | ------------ | ------------------ | -------------------------------- | --------- | ------------- | ------------ |
| 3 × `onboarding` / `renewal` / `support` | **1100**     | **90**             | maxLen 10 > 8                    | 307       | 91            | 163          |
| 3 × `onboarding` / `renewal` / `support` | **520**      | **90**             | width inert — byte-identical     | 307       | 91            | 163          |
| 3 × `a` / `b` / `c`                      | 1100         | 0                  | 3 ≤ 4 and 1 ≤ 8                  | 277       | 61            | 79           |
| 4 × `North` / `East` / `South` / `West`  | 1100         | 0                  | 4 ≤ 4 and 5 ≤ 8                  | 277       | 61            | 107          |
| 6 × `Apr` … `Sep`                        | 1100         | 90                 | **count 6 > 4, despite 3-char labels** | —   | —             | —            |
| 12 × `Category Name Number N`            | 1100         | 90                 | both over                        | 367       | 151           | 79           |
| 26 × person names                        | 1100         | 90                 | both over                        | 355       | 139           | 100          |

Two independent probe passes each mis-read their own rows — one as "label
length alone decides", the other as "rotates from 6 categories up" — because
neither matrix crossed the count boundary with short labels. The source settles
it: **both count and length gate, at ≤ 4 and ≤ 8**. Kept here as a reminder that
a threshold measured from one side is not a rule.

Two things fall out:

- **Width is inert.** The 1100px and 520px rows are byte-identical. Flint never
  divides width by category count, so three 10-character labels with ~340px of
  room each are set vertically exactly as 26 labels with 40px each are. This
  matches finding 7 of the [Flint findings](../../flint-charts/findings.md)
  ("width is layout-inert") and extends it: width is inert for _rotation_ too,
  not just sizing.
- **The cost is compounding.** A needless `rotate: 90` also inflates
  `grid.bottom` (61 → 91) and `_height` (277 → 307), so the chart is 30px taller
  and 30px shorter in the plot than it needs to be, and the rotated labels then
  collide with the axis title that `nameGap: 25` places beneath them.

Corollary: `grid.right` tracks the longest **series** name (79 for `x`/`y`,
163 for `Action Required`) because it is reserving room for the vertical legend.
Moving the legend to a horizontal band above the plot reclaims all of it.

## 6. What the client corpus actually does

Seven manually-built client reports (support/CX dashboards, 1840–2660px wide,
3598–16384px tall) were read for pattern, not aesthetics. What recurs — and
therefore what a generated report should reproduce:

| Pattern                                                                                           | Seen in | Reachable by the compiler                                     |
| ------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------- |
| Every chart and table in a white card on a grey page plane                                        | 7 / 7   | Yes                                                           |
| Section heading **outside and above** its card, with an optional control on the right of that row | 6 / 7   | Yes — `sectionHeading` + `sectionDownload` already form a row |
| KPI tiles as bordered equal-height cards: label → value → delta                                   | 5 / 7   | Yes                                                           |
| Delta vs. previous period on the tile (`▼ 45% vs Jul`)                                            | 3 / 7   | **No** — needs a second query the spec cannot express         |
| Filters as one compact row of selects + a reset                                                   | 4 / 7   | Yes                                                           |
| A run-of-filters summary card ("Report from 1 Jul to 28 Aug · Projects: All …")                   | 2 / 7   | Yes                                                           |
| Two small charts side by side; wide/time-series charts full width                                 | 5 / 7   | Yes                                                           |
| A footer stat strip **inside** a chart card (`Backlog today 77 · Peak 496 · Oldest open 205 d`)   | 2 / 7   | Partly — needs KPIs to associate with a chart                 |
| Download control in the **table's own header**, not at page bottom                                | 5 / 7   | Yes — already the idiom for chart/table sections              |
| A labelled divider breaking the report into chapters ("Feedback and satisfaction")                | 1 / 7   | Yes — `markdown` sections already exist                       |
| App footer line under the report                                                                  | 4 / 7   | Already present                                               |

The corpus also shows the failure modes to avoid, and the worst of them is the
report the module most resembles today: one client's `Ticket Status Report` is a
bare vertical stack of `heading + one giant chart card`, with overlapping axis
labels (`Await ClieAwait ResolutioAwait Team`), legends colliding with axis
titles, a filter panel floating out of alignment, and unlabelled stray numbers.
It is the same shape as the generated report and it reads as unfinished for the
same reasons — which is the useful part: **the gap is layout and chrome, not
chart cleverness.**

Two more corpus patterns are worth naming as _rejected_:

- **Pie charts with >6 slices.** One client report has two pies with ~20 slices
  each; the leader labels overlap into an unreadable mat and the legends run six
  rows deep. Matches the data-viz anti-pattern ("part-to-whole at a glance only,
  ≤ 6 segments"). A cap belongs in the compiler, not in guidance.
- **Dual y-axes.** Three corpus charts use them (`CSI` left / `Sample` right).
  This is the data-viz skill's #1 named chart mistake, `CHART_TYPES` cannot
  express it today, and it must stay that way.

---

## 7. What remains genuinely unreachable

Stated so the design does not promise it:

- **Period-over-period deltas** on KPI tiles. The `kpi` section is
  `{ label, query, valueKey, format?, filterBy? }` — one query, one scalar. A
  delta needs a second resolved value for a shifted window, which no part of the
  spec, `querySections`, or the resolve path can currently express. Out of scope
  here; it is a spec change, not a polish change. An **inert** caption — an
  agent-written display string (`110% of target · 128 deals`) with no query
  behind it — was proposed as the cheap 80% of this and rejected: it freezes at
  save time while the tile's number re-resolves per open and moves with filters,
  so the caption drifts from the value it annotates. The bar set for any future
  design: a KPI caption is acceptable **only tied to data, refreshing when the
  data changes** — i.e. the computed form, which is its own spec design.
- **Sparklines** on KPI tiles, for the same reason — a tile has a scalar, not a
  series.
- **A footer stat strip inside a chart card**, in its strong form: it requires
  KPIs to declare association with a chart section. The weak form (a run of KPIs
  immediately after a chart section renders as a strip under it) is reachable
  from section adjacency alone, and is what the design adopts.
