# Report layout wireframes

Aspirational targets for report presentation — step 1 of the candidate approach
in [`../design.md`](../design.md): "what good looks like", independent of what
the renderer produces today. Published as an editable design canvas:

**https://claude.ai/code/artifact/7f337cc2-8e48-4460-8980-985af20e457a**

The `.dc.html` files here are the canvas source (one file per artboard,
`canvas.json` is the layout); each is plain HTML inside the `<x-dc>` wrapper,
so the markup is readable directly even though the files don't render
standalone. Sample data is fictional.

## The three archetypes

| Artboard              | Archetype                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Main.dc.html`        | **Dashboard** — filter row, KPI band, 7/5 chart-grid row, full-width trend line, table, download footer.                                          |
| `Narrative.dc.html`   | **Narrative report** — markdown-led single column on a centered paper surface: prose, hero KPI, numbered figures, compact table.                  |
| `Operations.dc.html`  | **Dense operational view** — compact header, divider-strip KPIs, small-multiples strip, dense urgency-sorted table.                               |
| `ChartTheme.dc.html`  | **Chart theme spec** — the same compiled chart on light and dark surfaces, plus the verified split of where each styling decision lives.          |

## Grounding

Every element maps to the existing section vocabulary (`kpi`, `chart`,
`table`, `filter`, `markdown`, `download`) and respects the presentation
contract (value-descending bars, humanized labels, legend on multi-series,
numeric right-alignment, max 3 filters per row) — **except** two flagged
proposals for the design pass:

- **Side-by-side section widths** (the dashboard's 7/5 chart row, paired
  KPIs in the narrative). Today's renderer stacks query sections vertically;
  only KPI tiles and filters share rows.
- **KPI delta captions and tile sparklines** (`+12% vs Q2`, the mini trend
  line). The KPI contract today is label + `valueKey` + `format`; each needs
  either a spec addition or a second query.
- **Status ink in table cells** (the operations board's amber overdue
  counts). Table columns render plain text today.

Series palettes pass the colorblind-separation / lightness / contrast
checks against their surfaces: light `#0b7a5c · #8c5bb0 · #b0722a · #3f6fae`
on `#fcfcfb`; dark `#22a57f · #a374cc · #bc8a34 · #5b95d6` on `#191f1d`.

## ECharts theming — verified split

Facts checked against real code (`@lowdefy/blocks-echarts` 5.5.1,
`flint-chart` 0.5.0 probed directly):

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
  theme object (e.g. `defaults/chart_theme.yaml`) carries typography, axis
  chrome, tooltip and legend text for every `EChart` the module renders
  (report sections, chat cards, the expand modal).
