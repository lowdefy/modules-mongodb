# Task 6: Layout derivation — runs, pairing, KPI tile rows, span-driven widths

## Context

The design's core call: **layout is a pure function of section type, run
position, and data shape** — derived by the compiler, re-computed per open, no
agent surface. A *run* is a maximal sequence of adjacent same-type sections in
spec order; `compileReport` already walks sections in order, runs are the only
new concept. Section order is the agent's intent channel: two narrow charts
placed adjacent pair up; separated by a markdown section, they don't.

The snapshot boundary, stated precisely (design "One universal layout"): **per
open, not per interaction.** Derivation runs on the first, unfiltered resolve —
whose rows are a superset of anything a filter later shows — and filter
re-queries swap only option/height/rows through state bindings under a block
tree fixed until the next open. Spans never move mid-session.

The derivation table (design "Derivation rules"):

| Section run                 | Compiles to                                                                 |
| --------------------------- | ---------------------------------------------------------------------------- |
| `kpi` × n                   | One tile row: n cards, balanced spans (`filterSpans`, per-row cap 4)         |
| `filter` × n                | Unchanged grouping (cap 3) — task 7 handles its text                        |
| `chart`, needs width        | `span 24`, card                                                              |
| `chart`, doesn't need width | `span 12`, card — paired 2-up with the next consecutive narrow chart         |
| unpaired narrow chart       | promoted to `span 24` (a half-width card beside a 12-column hole reads as a rendering fault) |
| `table`                     | always `span 24`, card — a half-width AgGrid is a horizontal-scroll trap     |
| `download` × n              | task 8                                                                       |
| `markdown`                  | `span 24`, no card                                                           |

**"Needs width"** (from data the compiler already holds): a temporal x-axis,
OR more than 8 distinct categories, OR more than 4 series. A `pie` never needs
width (it pairs).

**Paired sections**: a head row is a full 24-column wrap line, so two paired
cards with flat head rows would each sit beside a twelve-column hole. A paired
section compiles as a **span-12 `Box` containing its own head row and card** —
child spans re-base inside the wrapper (verified: `--lf-span` is
`inherits: false` in `@lowdefy/layout` grid.css), so the 20/4 heading/download
split survives inside it and the heading still sits above the card.

## Interfaces

- **Consumes:** `chartWidthForSpan(span)` (task 3), the `${section.id}_card`
  wrapper convention (task 5), `filterSpans` (~line 201) and
  `FILTERS_PER_ROW = 3` (~line 187) in `compileReport.js`.
- **Produces:**
  - `filterSpans(groupSize, perRow = FILTERS_PER_ROW)` — cap parameterised.
    KPI rows use `perRow = 4`: 4 → `[6,6,6,6]`, 5 → `[8,8,8,12,12]` (3 + 2),
    6 → `[8,8,8,8,8,8]` (3 + 3). Filters keep 3. Task 8 reuses it for the
    downloads card.
  - Paired wrapper convention: **`${section.id}_box`**, type `Box`,
    `layout.span: 12`, containing the head row (spans 20/4, re-based) and the
    `${section.id}_card` at span 24 (re-based).
  - `needsWidth(section, rows)` — exported for tests.

## Task

All in `compileReport.js` (+ tests):

1. **Group sections into runs** before emitting (helper `groupRuns(sections)`;
   filters already group via `filtersByFirstSubscriber` — leave that path
   alone).
2. **`needsWidth(section, rows)`**: temporal x (a `Date` instance or a value
   Flint would type temporal — mirror its detection conservatively), distinct
   `x` count > 8, or series count > 4 (`y.length`). Pie → `false`.
3. **Chart runs**: walk the run pairing consecutive narrow charts (both become
   span-12 `Box`es on one wrap line); a narrow chart that fails to pair —
   trailing, or its neighbour needs width — promotes to span 24 with the flat
   head row from task 5.
4. **Width follows span**: assembly and the requery payload use
   `chartWidthForSpan(span)`; subtract the card's horizontal padding and the
   inter-card gap from the returned width so the estimate stays conservative
   (calibrate the constant once against a rendered card at `/r:dev-test`).
5. **KPI runs**: one tile row via `filterSpans(n, 4)`; each tile keeps its
   task-5 card.
6. **Record the snapshot boundary** as a comment at the derivation entry
   point: derivation reads the unfiltered first resolve; if a filter ever
   gains a default applied at first resolve, the superset assumption breaks
   and the derivation input must be revisited (design's stated caveat).
7. **`withTopGap`** must treat a pair as one wrap line (two span-12 blocks) —
   the gap stamps both boxes of the pair's line, and nothing inside them.

## Acceptance Criteria

- `compileReport.test.js`:
  - Two adjacent narrow charts → two `${id}_box` span-12 wrappers, each
    containing a 20/4 head row and a span-24 card; assembly width ≈ half.
  - Narrow + wide adjacent → narrow promotes to span 24, no `Box`.
  - Narrow, markdown, narrow → no pairing across the markdown.
  - Each `needsWidth` trigger alone forces span 24: temporal x; 9 categories;
    5 series. A 20-slice pie stays narrow (and still caps at 6 + Other).
  - KPI runs of 4 / 5 / 6 → spans `[6,6,6,6]` / `[8,8,8,12,12]` /
    `[8,8,8,8,8,8]`; filters unchanged at cap 3.
  - Tables span 24 regardless of column count.
  - Paired sections' requery payloads carry the span-12 width.
- `compileReport.declared.test.js` still passes (a spec in it must now exercise the
  paired branch — extend it).
- Plugin build; `pnpm ldf:b`; `pnpm e2e` green — `report-render.spec.js` /
  `formatted-report.spec.js` layout expectations updated in the same change.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.declared.test.js` — modify
- `apps/demo/e2e/ai-reporting/report-render.spec.js`, `formatted-report.spec.js` — update expectations

## Notes

- Ragged paired bottoms are **accepted** (design "Risks"): chart height
  follows content; the wrap line top-aligns the pair. Don't pin paired plot
  heights — that's a named possible follow-up, not this change.
- Broken/withheld chart sections have no rows: treat them as needing width
  (span 24, never paired) so an `Alert` never sits in a half-column hole.
