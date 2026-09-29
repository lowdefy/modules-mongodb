# Task 3: Width threading — legend orientation and label-rotation override

## Context

`buildFlintOption.js` sizes every chart against a constant
`BASE_SIZE = { width: 1100, height: 180 }` — Flint never consults width for
layout, and neither does the post-pass. Two design rules need a real width:

- **Legend orientation follows available width**: narrow cards get a
  horizontal legend band above the plot (with its height added to the returned
  canvas, since Flint budgeted `_height` for a right-hand legend); wide cards
  keep Flint's vertical right legend, where `grid.right` (measured 79–163px)
  pays for something the reader gets.
- **Label rotation override**: Flint sets `rotate: 0` only when there are ≤ 4
  categories **and** the longest label is ≤ 8 characters, otherwise 90 — width
  is never consulted (`findings.md` §5, read off `flint-chart` source
  `dist/echarts/index.cjs:4774-4785`; boundary matrix re-runnable in
  `probe.mjs`). So three 10-character labels with ~340px each are set
  vertically, inflating `grid.bottom` (61 → 91) and total height, and colliding
  with the axis title at `nameGap: 25`.

Three callers, three widths (design "width threading"):
`compileReport.js:1443` (report charts — width from the derived span),
`modules/ai-reporting/api/chart-data.yaml:120` (filter re-queries — untrusted
client payload), `buildDataParts.js:106` (chat turn-end assembly — the panel's
~420px, which the expand modal inherits because it renders the persisted
option from state with no assembly call of its own).

## Interfaces

- **Consumes:** task 2's post-pass structure (this task extends the same file).
- **Produces:**
  - `buildFlintOption({ chart, x, y, rows, stacked, width = 1100 })` — new
    optional `width` (px the chart will actually get).
  - `compileReport.js`: exported helper
    `chartWidthForSpan(span)` → `Math.round((span / 24) * 1100)` (1100 matches
    `report.yaml`'s `content_width`; task 6 subtracts card padding when spans
    start varying).
  - `chart-data.yaml` `payloadSchema` gains
    `width: { type: number, minimum: 200, maximum: 4000 }`.
  - `buildDataParts.js`: `const CHAT_PANEL_WIDTH = 420`.
  - `requeryActions` (compileReport ~line 337): the CallAPI payload for a chart
    section carries `width` (task 4 adds `colors` beside it).

## Task

1. **`buildFlintOption.js`**: accept `width`; `BASE_SIZE.width` becomes the
   passed value.
2. **Legend orientation** (multi-series and pie charts — the ones with a
   legend): when `width < 700` (covers the 420px chat panel and the ~540px
   span-12 card; name the constant), move the legend to a horizontal band above
   the plot (`orient: horizontal`, top), reclaim `grid.right` to a small
   constant, and **add the band's estimated height to the returned `height`**
   (estimate wrap rows from total legend-text width at a conservative
   per-character width; each row ~24px). At `width >= 700`, keep Flint's
   vertical right legend untouched.
3. **Rotation override** (category axes only; quantitative stays 0): recompute
   from the actual plot width — `plotWidth = width − grid.left − grid.right`,
   `pxPerCategory = plotWidth / categoryCount`. Step **0 → 45 → 90**: flat when
   `maxLabelLen × CHAR_W + padding ≤ pxPerCategory`; else 45° when the
   projected width (`× cos 45°`) fits; else 90. `CHAR_W` is a **conservative**
   estimate (~7.5px at the theme's 12px font — there is no canvas to measure
   server-side; over-eager unrotation overlaps labels, which is worse than the
   tilt). **Only relax**: never rotate a label Flint left flat (Flint's 0 cases
   always fit). Leave `grid.bottom` alone — the surplus after unrotation is
   harmless padding, not clipping.
4. **Callers:**
   - `compileReport.js`: pass `width: chartWidthForSpan(24)` at the chart
     assembly call (spans are still all 24 until task 6); add `width` to the
     chart section's requery payload in `requeryActions`.
   - `chart-data.yaml`: add `width` to `payloadSchema` (bounded as above —
     the payload is untrusted client input; a lied-about width is only
     aesthetic, and the schema admits it deliberately) and pass
     `width: { _payload: width }` into `_analytics.buildFlintOption`.
   - `buildDataParts.js`: pass `width: CHAT_PANEL_WIDTH`, with a comment
     recording the accepted consequence — the expand modal inherits the
     panel's more aggressive rotation (conservative, never overlapping,
     strictly no worse than today); expand-time re-assembly is a named
     follow-up, not this change.

## Acceptance Criteria

- `buildFlintOption.test.js` (extend):
  - The `findings.md` §5 boundary matrix at default width (3 short → 0,
    4 short → 0, 5 short → 90-then-relaxed, 4 × 8-char → 0, 4 × 9-char →
    90-then-relaxed, …) — assert the **final** rotation after the override.
  - Width-relaxation cases: e.g. 5 × 10-char labels → 0 at 1100, 45 or 90 at
    420; labels that fit only at 45° land on 45.
  - Legend orientation: multi-series at 420 → horizontal top band and a taller
    returned height; the same chart at 1100 → vertical right legend unchanged.
  - Zero collisions claim stays visual: acceptance item 4 is judged at
    `/r:dev-test` (task 9).
- `compileReport.test.js`: chart requery payload carries the section's width.
- Plugin build, `pnpm ldf:b`, `pnpm e2e` green with `chart-data.spec.js`
  expectations (payload shape, option shape) updated in the same change.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.test.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/buildDataParts.js` — modify
- `modules/ai-reporting/api/chart-data.yaml` — modify
- `apps/demo/e2e/ai-reporting/chart-data.spec.js` — update expectations

## Notes

- `probe.mjs` in the design folder stays where it is — it documents the
  pre-override Flint rule; don't repurpose it as a test.
- The flint-charts design records legend-right as the fix for the absolute
  `legend.left` defect; the span-12 conditional supersession gets a note there
  **when this lands** — add that note in this task
  (`designs/ai-reporting/flint-charts/design.md`).
