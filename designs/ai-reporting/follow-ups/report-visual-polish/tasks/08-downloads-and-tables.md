# Task 8: Downloads card + table column flex

## Context

A run of `download` sections currently compiles to `span 6` Buttons at the page
bottom, wrapping ragged, under no heading — the report carries two unrelated
download idioms, since chart/table sections already put a `⤓` in their head row
(design "Downloads"). The `⤓` idiom stays and becomes the only per-section
export affordance a reader learns.

Tables: `defaultColDef` is `{ sortable: true, resizable: true }`
(`compileReport.js` ~line 1497). Adding `flex: 1` fixes both current failures
at once — the 2-column table with 600px of blank white, and the 6-column table
clipped mid-header (design "Tables"; measured in `findings.md` §2). Tables are
already always span 24 (task 6).

## Interfaces

- **Consumes:** `groupRuns` and the parameterised `filterSpans(n, perRow)`
  from task 6; `Card` in the allowlist from task 5.
- **Produces:** downloads wrapper id **`${firstSection.id}_downloads`** (type
  `Card`, span 24).

## Task

All in `compileReport.js` (+ tests):

1. **Downloads card.** Compile each `download` run into one `Card` (span 24)
   titled "Downloads" — the card's own title property; this is the one card
   with a title, per the design's derivation table — containing the run's
   Buttons laid out at `filterSpans(n)` spans (default cap 3). Each Button
   keeps its existing behaviour exactly: `CallAPI` with the section's query,
   then `DownloadCsv` with `safeFilename(label)`.
2. **Table flex.** `defaultColDef` gains `flex: 1` →
   `{ sortable: true, resizable: true, flex: 1 }`.

## Acceptance Criteria

- `compileReport.test.js`:
  - A run of 5 download sections → one `Card`, five Buttons at spans
    `[8,8,8,12,12]`, events unchanged.
  - A single download section → still one titled card (one idiom, no special
    case).
  - Table `defaultColDef` includes `flex: 1`.
- `compileReport.declared.test.js` still passes (extend its spec with a download
  run if task 5's doesn't already exercise one).
- Plugin build; `pnpm ldf:b`; `pnpm e2e` green — `formatted-report.spec.js` /
  `report-render.spec.js` expectations updated in the same change.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify
- `apps/demo/e2e/ai-reporting/formatted-report.spec.js`, `report-render.spec.js` — update expectations

## Notes

- `flex: 1` with `resizable: true` is standard AgGrid behaviour (flex yields
  once a user resizes) — no extra config; the acceptance check "zero clipped
  or under-filled columns" (design item 4) is judged on screen in task 9.
