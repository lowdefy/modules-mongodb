# Task 2: Palette two-write override, mark styling, pie 6 + Other cap

## Context

`plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.js` hands rows
to `flint-chart@0.5.0` (pinned exactly) and already post-processes the returned
option — it strips private keys and functions (`strip()`), deletes
`series.barWidth`, moves a numeric `legend.left` to `right: 10`, and pins pie
radius to `["0%", "70%"]`. This task extends that established post-pass.

The stock ECharts palette fails four of five dataviz validator checks on the
real light surface — including a normal-vision ΔE of 13.9 between slots 2 and 3
(`findings.md` §4). Flint declares the palette **twice**: as `option.color` and
as a concrete hex on each `series[i].itemStyle.color`, and the per-series value
wins on bar and line — setting `option.color` alone is a silent no-op there
(`findings.md` §3, "two writes, not one").

Mark styling is verified JSON-safe (`findings.md` §3): gradient objects and
`borderRadius` survive `strip()` and the JSON round-trip every option travels.

## Interfaces

- **Produces** (exported from `buildFlintOption.js`, consumed by tasks 4 and 9's
  tests):
  - `export const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];`
  - `export const NEUTRAL = …;` — one reserved muted grey (pick ~`#8c8c8c`,
    must not sit in `PALETTE`) for the capped pie "Other" slice.
  - `export const CARD_SURFACE = "#ffffff";` — the surface pie borders and the
    validator run use.

## Task

All in `buildFlintOption.js`'s post-pass:

1. **Palette, two writes.** Set `option.color = PALETTE` **and** rewrite every
   `series[i].itemStyle.color` to `PALETTE[i % 8]` (bar/line; a pie series has
   no per-series colour — its slices read `option.color`). After the rewrite,
   **no stock ECharts hex may survive anywhere in the option tree** — the stock
   set is `#5470c6 #91cc75 #fac858 #ee6666 #73c0de #3ba272 #fc8452 #9a60b4
   #ea7ccc #d48265`.
2. **Mark styling:**
   - bar: `series[i].itemStyle.borderRadius = [4, 4, 0, 0]` (rounded caps,
     baseline square);
   - line: `lineStyle.width = 2` plus an end-point symbol, matching the deck
     (`wireframes.html`);
   - single-series line only: gradient `areaStyle` — a plain
     `{ type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [...] }` object
     fading the series hue to transparent (no functions — functions don't
     survive `strip()`/JSON);
   - pie: slice gaps via `itemStyle.borderWidth = 2`,
     `itemStyle.borderColor = CARD_SURFACE`.
3. **Pie cap 6 + Other.** Before assembly, when a pie has more than 7 slices:
   keep the top 6 by value, sum the remainder into a final slice named
   `Other`, and give that slice `NEUTRAL` via per-datum `itemStyle.color`
   (an "Other" wearing a vivid identity hue reads as an entity it isn't —
   design, colour-identity rule). Exactly 7 slices render as 7 (folding one
   slice into an "Other" of one is noise).
4. **Record the contrast-WARN discharge** as a comment where the palette is
   set: the light-mode contrast WARN obligates visible labels or a table view;
   a compiled report discharges it deliberately — every multi-series chart
   carries a legend and every chart section a `⤓` download.
5. **Re-run the validator** against the card surface and paste the output into
   the PR description: the dataviz skill's
   `scripts/validate_palette.js "<PALETTE joined>" --mode light --surface "#ffffff"`,
   and `--mode dark --surface "#141414"` with the dark set from `findings.md`
   §4 (dark stays validated-but-unshipped).

## Acceptance Criteria

- `buildFlintOption.test.js` (extend):
  - **Stock-hex sweep** on all three kinds — bar, line, pie: walk the assembled
    option tree and assert none of the 10 stock hexes appears (design
    acceptance item 2; the per-series override differs per kind, which is why
    all three are asserted).
  - **Pre-rewrite shape guards**: assert the Flint output the post-pass relies
    on (per-series `itemStyle.color` present on bar/line; pie slices coloured
    from `option.color`) so a `flint-chart` bump fails loudly.
  - Pie cap: 20 slices → 7 rendered (6 + `Other`), `Other` is `NEUTRAL`, its
    value is the tail sum; 7 slices → 7 unchanged.
  - Gradient `areaStyle` survives `JSON.parse(JSON.stringify(option))`.
- `pnpm --filter @lowdefy/modules-mongodb-plugins build`; `pnpm ldf:b` clean;
  `pnpm e2e` green with `chart-data.spec.js` / `formatted-report.spec.js`
  expectations updated in the same change.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.test.js` — modify
- `apps/demo/e2e/ai-reporting/chart-data.spec.js`, `formatted-report.spec.js` — update expectations

## Notes

- Per-slot assignment here is chart-scoped (`i % 8`); report-scoped identity
  replaces it in task 4 — keep the palette application in one function so task
  4 swaps the *assignment*, not the mechanism.
- Chat chart parts persist their compiled option, so old chat snapshots keep
  the palette of their day — accepted by design; do not migrate persisted
  parts.
