# Report layout wireframes (exploratory)

> **Non-normative.** These boards are an exploratory pass at "what good looks
> like", kept as context. The design's **acceptance target is the deck** —
> [`../wireframes.html`](../wireframes.html) — and the settled decisions live in
> [`../design.md`](../design.md). Where a board and the design disagree, the
> design wins; the disagreements are annotated below.

Published as an editable design canvas:

**https://claude.ai/code/artifact/7f337cc2-8e48-4460-8980-985af20e457a**

The `.dc.html` files here are the canvas source (one file per artboard,
`canvas.json` is the layout); each is plain HTML inside the `<x-dc>` wrapper,
so the markup is readable directly even though the files don't render
standalone. Sample data is fictional.

## The four boards

| Artboard             | What it explored                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Main.dc.html`       | **Dashboard** — filter row, KPI band, 7/5 chart-grid row, full-width trend line, table, download footer.                                    |
| `Narrative.dc.html`  | **Narrative report** — markdown-led single column on a centered paper surface: prose, hero KPI, numbered figures, compact table.            |
| `Operations.dc.html` | **Dense operational view** — compact header, divider-strip KPIs, small-multiples strip, dense urgency-sorted table.                         |
| `ChartTheme.dc.html` | **Chart theme spec** — the same compiled chart on light and dark surfaces, plus the verified split of where each styling decision lives.    |

The three layout boards were drawn as *archetypes*; the settled design rejects
archetypes (and any agent layout input) in favour of **one universal layout
derived from the section list** — their compositions remain reachable through
section ordering, except the elements flagged below.

## Flagged proposals — outcomes

The boards surfaced elements nothing existing could express. Each was resolved
in [`../design.md`](../design.md):

- **Side-by-side section widths** (the dashboard's 7/5 chart row) — the need is
  real (5 of 7 client reports pair small charts) and is met **derived, not
  authored**: narrow charts pair 2-up mechanically. The proposed
  `width: full | half` spec key was **rejected** — it freezes layout at save
  time while derived layout re-computes per open; see the design's Rejected
  section. The narrative board's *hero KPI* falls with it (no corpus or
  production instance; `width` is the named escape hatch if one appears).
- **KPI delta captions and tile sparklines** (`+12% vs Q2`, the mini trend
  line) — **rejected in inert form**: an agent-written caption drifts from the
  value it annotates as data and filters move. The bar for any future caption:
  tied to data and refreshing with it, i.e. the computed form — a spec design
  of its own.
- **Status ink in table cells** (the operations board's amber overdue counts) —
  **stays out**: "no enum-tag styling" is a standing presentation-contract
  decision; a cell-styling key deserves its own design.

The boards' series palette (light `#0b7a5c · #8c5bb0 · #b0722a · #3f6fae` on
`#fcfcfb`, dark `#22a57f · #a374cc · #bc8a34 · #5b95d6` on `#191f1d`) passed the
validator on its own surfaces but is **superseded** by the 8-slot data-viz
reference palette the design adopts — validated on the repo's actual card
surfaces and wide enough for the > 4-series charts stacked status data produces.

## ECharts theming — verified split (adopted)

This board's finding carried into the design unchanged (now recorded with the
probe evidence in [`../findings.md` §3](../findings.md)):

- **The `EChart` block accepts a full theme object** via `properties.theme`
  — its constructor calls `registerTheme('custom_theme_<blockId>', theme)`
  and hands the name to `echarts-for-react`. No fork or new block needed.
- **A theme merges _under_ the option** — anything the compiled option pins
  wins. Flint pins the stock ECharts palette (a top-level
  `color: ["#5470c6", …]`) **and** a per-series `itemStyle.color`, so a
  theme alone cannot recolor series.
- **Therefore the split** (drawn on `ChartTheme.dc.html`): palette and mark
  styling (bar `borderRadius`, line width/symbols, area gradient, pie slice
  gaps) belong in `buildFlintOption`'s existing post-pass — it already
  rewrites `barWidth`, pie radius and legend position — while one shared
  theme object (`defaults/chart_theme.yaml`) carries typography, axis
  chrome, tooltip and legend text for every `EChart` the module renders
  (report sections, chat cards, the expand modal).
