# Report visual polish

The open engine and `flint-chart` rendering make reports _correct_ and
_consistent_, but "consistent" is not the same as "good-looking". A saved
report today is a vertical stack of bare `Statistic` tiles, stock-ECharts
charts, and full-width tables with the module's default spacing. This design
raises the visual quality of what the module renders — chart styling, section
chrome, layout — to something that reads as a designed dashboard rather than a
dump of sections, **without changing what the agent authors**: the section
vocabulary and presentation contract stay as they are, except for two small,
argued additions (`width`, `caption`) in the last phase.

The target is the [wireframe deck](wireframes/README.md) (published as an
editable canvas — link in that README): a KPI-band + chart-grid dashboard, a
markdown-led narrative report, a dense operational view, and a chart-theme
spec board. Relates to the [`ux/`](../../ux/design.md) wireframes (chat +
save-report flow) and the [`flint-charts`](../../flint-charts/design.md)
design (which made chart appearance compiled, not authored) — this is the
visual-quality follow-up to both.

## Proposed change

Three phases, ordered by value over risk. Each lands independently and is
useful alone; later phases assume earlier ones only for visual coherence.

**Phase 1 — the chart pass.** No spec change, no agent change.

1. Extend `buildFlintOption`'s existing post-pass (it already rewrites
   `barWidth`, pie radius, and legend position) to own chart appearance:
   replace the pinned stock palette with the module palette, delete per-series
   `itemStyle.color` so the palette assigns by series order, rounded bar caps
   (`itemStyle.borderRadius: [4, 4, 0, 0]`), 2px lines with an end-point
   symbol, a gradient `areaStyle` under single-series lines, pie slice gaps
   (`borderWidth: 2, borderColor: <surface>`), and label unrotation where
   horizontal labels fit (see decisions).
2. Add one shared ECharts **theme object** — `defaults/chart_theme.yaml` —
   set as `properties.theme` on every `EChart` the module renders: compiled
   report chart blocks, the chat result card, and the expand modal. The theme
   carries what flint leaves unset: `textStyle.fontFamily`, axis line /
   split-line / label colors, legend and tooltip text styling,
   `backgroundColor: transparent`.

**Phase 2 — report chrome.** No spec change. `compileReport` styling only,
via the block-level `style:` key the compiled blocks already support:

3. KPI tiles: card treatment (surface, hairline border, radius), mono
   uppercase label, larger numeral.
4. Section head rows: heading scale and weight, the ⤓ kept quiet; section
   rhythm via the existing `SECTION_TOP_GAP` and the `Dynamic` gap.
5. Table and download row polish within `AgGridBalham` / `Button` properties.

**Phase 3 — two spec additions.** The only contract changes, each driven by a
wireframe element nothing existing can express:

6. **`width: full | half`** on `chart` and `kpi` sections. `chart` defaults
   `full` (today's behaviour), `half` compiles to span 12 so two half charts
   share a row. `kpi` defaults `half` — misnamed for a tile but consistent;
   see decisions — keeping today's span-6 tile, while `full` compiles the
   narrative board's hero treatment (span 24, centered, larger numeral).
7. **`caption`** on `kpi` sections: an inert, length-capped display string
   rendered under the value (`128 of 376 closed`). No computation — the agent
   writes it from the rows it already saw.
8. Teach the agent both keys in `reporting-assistant.yaml`, regenerate docs,
   extend the demo seeded report and e2e.

## Why this, and why now

The wireframes forced the gap list into the open. Sorted by what fixes the
most for the least surface: almost everything ugly about today's output is
chart styling and tile chrome — both fixable behind the existing contract, in
code paths that already post-process (`buildFlintOption`) or already emit
styled blocks (`compileReport`). Only two wireframe elements are genuinely
inexpressible (side-by-side charts, a KPI hero/caption), so only those touch
the spec, the validator, and the agent's vocabulary. Doing the phases in this
order means the risky part (new authoring surface) comes last and smallest,
and the module looks substantially better after a change that cannot break a
single saved report spec.

## Current state

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — KPI →
  `Statistic` at `layout: { span: 6 }` (:1431); chart, table, markdown, Alert
  → span 24; download → `Button` span 6 (:1519); section head = `Title` span
  20 + CSV button span 4; `GRID_COLUMNS = 24` (:132); `SECTION_TOP_GAP`
  stamped on each group's first wrap line (:134-149); `tableHeight()` sizes
  the AgGrid wrapper to its rows (:170).
- `buildFlintOption.js` — hands rows to `assembleECharts`, then a post-pass
  strips private keys and functions, deletes `series[].barWidth`, converts pie
  radius to a percentage, and pins the legend right (:80-200). The assembled
  option **pins the stock ECharts palette** (top-level
  `color: ["#5470c6", …]`) and a per-series `itemStyle.color`.
- `@lowdefy/blocks-echarts` 5.5.1, `EChart.js` — the block accepts a full
  theme **object**: its constructor calls
  `registerTheme("custom_theme_" + blockId, properties.theme)` and passes that
  name to `echarts-for-react`. Three render sites: the compiled report chart
  block, `pages/chat/components/chat_workspace.yaml` (:842), and
  `expand_chart_modal.yaml` (:25).
- `modules/ai-reporting/pages/report.yaml` — the report renders through a
  `Dynamic` block with a types allowlist (`Title`, `Paragraph`, `Statistic`,
  `EChart`, `AgGridBalham`, selectors, `Button`, `Alert`, `Markdown`,
  `DropdownMenu`); one missed type blanks the whole report. Content column is
  1100px; the `Dynamic` layout gap is `[12, 8]`.
- Blocks in this codebase carry block-level `style:` (used throughout
  `chat_workspace.yaml`), so compiled blocks can be styled without app-theme
  changes.
- `docs/ai-reporting/reference/presentation-contract.md` — chart appearance is
  compiled, not authored; height follows content; tables have no enum-tag
  styling (deliberate).

## Verified findings

Run against real packages (`echarts` 6.1.0 SSR — the workspace ships 6.0.0,
same major — `flint-chart` 0.5.0,
`@lowdefy/blocks-echarts` 5.5.1 source) — see [`probe.mjs`](probe.mjs):

| # | Claim | Result |
| - | ----- | ------ |
| A | A registered theme's palette applies when the option pins nothing | ✅ |
| B | A top-level `option.color` overrides the theme palette | ✅ |
| B2 | Per-series `itemStyle.color` overrides both | ✅ |
| C | A linear-gradient **object** (`{ type: "linear", colorStops }`) survives the option's JSON round-trip and renders | ✅ |
| C2 | Bar `itemStyle.borderRadius` renders from plain JSON | ✅ |
| D | flint sets `xAxis.axisLabel.rotate: 90` from **6 categories up**, even for 3-character labels (`Apr`–`Sep`); 3 categories stay at 0. `grid.bottom` and `_height` grow with rotated label length | ✅ |

A, B and B2 together are the merge rule that shapes phase 1: ECharts applies a
theme _under_ the option, so the palette swap **must** happen server-side in
the compile pass — a theme alone cannot recolor flint's output. C and C2 mean
the gradient and rounded-cap styling need no functions and survive
`strip()`'s function removal and persistence as JSON. D is the concrete
ugliness the unrotation rule targets.

## Key decisions and rationale

### Restyle in the compiler's post-pass, not a new authoring surface

The presentation contract's promise is "the AI never contributes chart
config" — a chart names a kind, a query, and x/y columns, and everything
visual is derived. Polish must keep that promise: every phase-1 change lands
in `buildFlintOption` after assembly, exactly where `barWidth`, pie radius and
legend position are already corrected, so the authoring contract, the
validator, and every persisted spec are untouched. The alternative — chart
styling keys in the spec — would hand the agent a vocabulary it will misuse
and the module a compatibility surface it owes forever, to express decisions
the module can make once, correctly, for every chart.

### The merge rule decides the palette/theme split

Verified above: a theme merges under the option, and flint pins both the
palette and per-series colors. So the split is forced, not stylistic —
**palette and mark styling are compiled** (post-pass: replace `option.color`,
delete `series[].itemStyle.color`, add mark styling), and **typography and
axis chrome ride the theme object**, which is the right home for them anyway:
they are per-surface concerns shared by all three render sites, including
chat charts that never pass through `compileReport`. One theme file, three
`properties.theme` references; compiled options stay free of font names and
axis colors, so a future theme change re-skins persisted reports without
touching their stored parts.

One consequence worth stating: chat chart **parts persist the compiled
option** (a reopened conversation shows the option snapshotted at the turn
that produced it). Palette changes therefore reach old chat cards only via
the theme… which the palette deliberately does not ride. Accepted: old chat
snapshots keep the palette of their day, exactly as they keep their numbers;
saved reports re-compile per open and always get the current look.

### The palette is validated and fixed-order

Light surface: `#0b7a5c · #8c5bb0 · #b0722a · #3f6fae` — passes
colorblind-separation (worst adjacent pair ΔE 12.2 deutan), lightness-band,
chroma and contrast checks against the `#fcfcfb` surface (validator output in
the wireframes README; a dark-surface variant is validated there too but dark
mode is a non-goal). Colors assign to series in fixed order — flint already
orders folded series by the declared `y` columns, so series color follows the
declared column, not its rank in the data.

### Unrotate labels only when they fit

Rotated-90° month names are the stock output's worst tell (finding D). The
post-pass unrotates (`rotate: 0`) only when every category label fits its
slot — estimated as `maxLabelChars × ~7px ≤ plotWidth / categoryCount` at the
compiled font size — and otherwise steps to 30°, keeping 90° as the fallback
for genuinely long labels. Conservative on purpose: an over-eager unrotation
overlaps labels, which is worse than the tilt. flint sized `grid.bottom` and
the canvas for rotated labels; horizontal labels need less, so the surplus is
harmless padding rather than clipping. The one uncertainty — the pixel-width
estimate has no canvas to measure against server-side — is why the rule keys
on character count with a generous per-char width, and why the e2e chart
assertions gate the change.

### `width` is the smallest layout vocabulary that draws the wireframes

The dashboard needs two charts on one row; the narrative needs one hero KPI.
Both are one enum on two section types:

- `chart`: `width: full` (default — today's behaviour) `| half` → span 12.
  Two consecutive `half` charts share a wrap line; an odd `half` chart simply
  takes half the row and the next section wraps — no pairing logic, no
  validation that halves come in twos. The layout engine's wrap lines already
  handle every arrangement, and forbidding an odd half would be a restriction
  guarding against something harmless.
- `kpi`: `width: half` (default — today's span-6 tile) `| full` → span 24,
  centered, hero-scale numeral. The names stay `full`/`half` across both
  types — one enum to learn — even though a "half" KPI is actually a quarter
  row; the enum names the *intent* (share a row / own the row), not the span
  arithmetic.

The known caveat, stated rather than solved: **chart height follows content**
(the contract is explicit), so two paired charts will usually have ragged
bottoms. Accepted for this design — the wrap line top-aligns them, and the
wireframes' 7/5 split is approximated by 12/12 rather than adding a span
free-for-all. If ragged rows read badly in practice, a follow-up can pin
paired plot heights; designing that now would be speculation.

Not taken: arbitrary spans (`width: 7`), section grouping/rows in the spec,
and `width` on `table`/`markdown`/`download` (no wireframe element needs
them; a half-width AgGrid is a horizontal-scroll trap).

### `caption` is an inert string, not a computed delta

The wireframes' `+34% vs Q2` caption is genuinely useful and genuinely cheap
**as display data**: the agent has just run the queries, knows the comparison,
and can write the sentence. A `caption` is therefore the same kind of thing as
`label` — length-capped, no query grammar, zero security surface, rendered in
the tile's muted line. What it is _not_ is computed: a `compareQuery` per KPI
would add a pipeline per tile per report open and a second contract to verify,
for a number the agent can already state. If live-updating deltas become a
concrete need (a filtered KPI's caption goes stale when the filter moves —
today's captions describe the unfiltered resolve, and the tile re-queries but
the caption doesn't), that is its own design; the caption key doesn't foreclose
it.

### What deliberately stays plain

- **Tables keep text-only cells.** The ops wireframe's amber overdue ink
  reads well, but "no enum-tag styling" is a standing contract decision; a
  `severity` hint would be the first cell-styling key and deserves its own
  argument with its own design, not a rider here.
- **No KPI sparklines.** Each needs a trend query per tile per open —
  resolve-time cost for decoration. The wireframes flag them as aspirational.
- **No dark mode.** The theme object makes it _possible_ later (swap the
  file), but the app has no dark theme to match; building one for charts
  alone is speculative surface.
- **No markdown typography overhaul.** Phase 2 may set measure and size on
  the `Markdown` block's `style:`; the narrative board's drop cap needs
  stylesheet-level CSS (`::first-letter`) and is a nice-to-have, not
  load-bearing — the narrative layout works without it.

### Where styling lives — the resolved map

The draft's central open question, now answered layer by layer:

| Layer | Owner | Vehicle |
| ----- | ----- | ------- |
| Series palette, mark styling (bar caps, line width, gradients, pie gaps), label rotation | module, server | `buildFlintOption` post-pass — compiled into the persisted/shipped option |
| Chart typography, axis/split lines, legend & tooltip chrome | module, client | one theme object, `properties.theme` on all three `EChart` sites |
| KPI tile, section head, table, download chrome | module, server | block `style:` + properties in `compileReport` |
| Page column, breadcrumb, gaps between wrap lines | module, static | `pages/report.yaml` (`content_width: 1100`, `Dynamic` gap) |
| Base fonts, antd tokens | host app | app theme — the module styles on top, never against |

### Acceptance bar

Per phase, side-by-side against the named wireframe board — dashboard for
phases 1/3, narrative for the hero/caption, ops for density — judged at PR
review with screenshots from a real dev run (`/r:dev-test`), not by the
sandbox. Mechanical gates: `ldf:b`, `pnpm e2e` (the chart-data and
report-render specs already assert compiled-option shape and section
rendering; phase 1 updates their expectations deliberately, in the same
change). "Looks good" stays a human call, but it is a call against a specific
board, not taste.

## Wire format

Phase 3 additions, both optional, both inert display data:

```yaml
sections:
  - type: chart
    chart: bar
    width: half            # full (default) | half
    query: { ... }
    x: stage
    y: [amount]

  - type: kpi
    label: Won this quarter
    width: full            # half (default) | full — full is the hero tile
    caption: 110% of target · 128 deals   # length-capped inert string
    valueKey: total
    format: { style: currency }
    query: { ... }
```

Validation: `width` rejected outside `chart`/`kpi` and outside the enum;
`caption` rejected outside `kpi`, capped at the same length as `label`. Both
join the section allowed-key lists so misspellings reject with the key list
named, per the report-filters precedent.

## Files changed (anticipated)

- `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.js` — the
  phase-1 post-pass (+ tests).
- `plugins/modules-mongodb-plugins/src/analytics/constants.js` — palette,
  caps for `caption`.
- `modules/ai-reporting/defaults/chart_theme.yaml` — new; referenced from
  `compileReport`'s chart block, `chat_workspace.yaml`, `expand_chart_modal.yaml`.
- `compileReport.js` — phase-2 block styles; phase-3 `width`/`caption`/hero
  compilation (+ tests).
- `validateReportSpec.js` — phase-3 keys (+ tests).
- `modules/ai-reporting/agents/reporting-assistant.yaml` and
  `api/generate-report.yaml` — phase-3 vocabulary.
- `docs/ai-reporting/reference/presentation-contract.md` + `pnpm docs:gen`.
- `apps/demo` seeded example report + `apps/demo/e2e/ai-reporting/*` —
  expectations per phase.

## Resolved questions

All four of the draft's open questions:

- **Where does styling live?** Resolved — see the map above and the verified
  findings that force the palette/theme split.
- **Layout responsiveness.** Spans are fixed fractions of the 1100px column;
  wrap lines do not collapse on narrow viewports. Accepted: the report page is
  a desktop document (the column cap exists for measure, not adaptivity), and
  no concrete mobile need exists. Revisit only when one does.
- **Scope of autonomy.** Phases land as ordinary reviewed PRs with the
  mechanical gates above; visual acceptance is the human side-by-side at
  review. No live-dev-server agent loop — the e2e suite plus screenshots
  cover what the sandbox can and cannot do respectively.
- **One design or two?** One. The wireframes showed chart styling and layout
  are separable in *implementation* (the phases) but one target in
  *acceptance* — splitting the design would duplicate the current-state map
  and the merge-rule findings both halves need.

## Non-goals

Computed KPI deltas / `compareQuery`, KPI sparklines, table cell styling
(severity ink), dark mode, arbitrary section spans or row grouping, drop-cap
markdown typography, restyling AgGrid beyond its properties, and any change to
what the agent may query.

## Risks

- **flint version drift.** The post-pass rewrites an option shape flint 0.5.0
  produces; the dependency is pinned exactly, and the post-pass tests assert
  the pre-rewrite shape so a bump fails loudly, not silently.
- **Unrotation overlap.** A too-generous fit estimate overlaps labels.
  Mitigated by the conservative char-width rule, the 30° intermediate step,
  and e2e updates in the same change.
- **Theme/option interplay per chart type.** The merge rule is verified for
  the general case; a per-type surprise (e.g. pie label colors) shows up in
  the side-by-side and is contained to the theme file.
- **Agent misuse of `width`.** An odd `half` or a hero mid-list renders
  harmlessly (wrap lines), so the failure mode is aesthetic, not broken —
  and the prompt shows the intended patterns.
- **Ragged paired charts.** Accepted above; the follow-up (pinned paired
  heights) is named but not built.

## Related

- [Wireframe deck](wireframes/README.md) — the acceptance target; the
  chart-theme board draws the palette/theme split.
- [`probe.mjs`](probe.mjs) — the verification probe behind the findings table.
- [`flint-charts`](../../flint-charts/design.md) — established compiled-not-
  authored chart appearance and the post-pass precedent.
- [`report-filters`](../../report-filters/design.md) — the allowed-key-list
  validation precedent phase 3 follows.
- [`ux/`](../../ux/design.md) — the original chat + save-report wireframes.
