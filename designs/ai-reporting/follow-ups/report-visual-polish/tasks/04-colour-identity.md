# Task 4: Report-scoped colour identity

## Context

Today hues are assigned by series index within one chart, so `Done` is red in
one section and green two sections later. The design's rule ("Chart internals"
→ colour identity), with its edges decided:

- **The union covers multi-series names and pie slice names.** Series names
  are humanized `y` column names; pie slice names are the `x` values — both
  entity names (a `Done / Cancelled` pie beside a stacked bar keyed on the
  same statuses is the cross-section identity case).
- **Single-series axis charts stay out of the union** and always take slot 1
  (`PALETTE[0]`) — their name is a measure ("Total Revenue"), an identity
  shared with nothing; putting them in would paint each a different hue for no
  reason and burn slots real identities need. **Pies are exempt from that
  single-series rule**: a pie colours per *slice* in slice order, so each slice
  takes its union slot.
- **First-appearance order**, capped at 8. Past 8, overflow names are assigned
  **per chart** from the slots unused in that chart — they lose cross-chart
  stability (with 8 hues there is no alternative), but within any one chart
  slots stay unique. Never fold overflow into "Other" — the tail names live in
  different charts with nothing to fold together.
- The capped pie **"Other" slice always takes `NEUTRAL`** (already so from
  task 2), never a categorical slot.

Stability across filter re-queries matters ("colour follows the entity, never
its rank" — a filter that changes the slice count must not repaint survivors):
the first resolve runs unfiltered, so its names are a superset of anything a
filter later shows; the compiled assignment therefore rides the requery payload
the same way `width` does (task 3).

## Interfaces

- **Consumes:** `PALETTE`, `NEUTRAL`, `humanize` (exports of
  `buildFlintOption.js`); the task-3 payload-threading pattern
  (`requeryActions` → `chart-data.yaml` `payloadSchema`).
- **Produces:**
  - `buildFlintOption({ …, colors })` — optional map
    `{ [name: string]: hex }`; names found in the map take their hex, names
    not in it take unused-in-this-chart slots in first-appearance order;
    single-series bar/line ignore the map (slot 1); pie `Other` stays
    `NEUTRAL`.
  - `compileReport.js`: `assignReportColors({ sections, results })` →
    `{ [name]: hex }` (module-level, exported for tests).
  - `chart-data.yaml` `payloadSchema` gains
    `colors: { type: object, additionalProperties: { type: string, pattern: "^#[0-9a-fA-F]{6}$" } }`.

## Task

1. **`assignReportColors` pre-pass** in `compileReport.js`, run once before the
   section emit loop: walk chart sections in spec order; for each **multi-
   series** chart (`y.length > 1`) add `y.map(humanize)`; for each **pie** add
   its slice names — the ordered distinct `x` values of its rows *after* the
   6 + Other cap, excluding `Other`. Assign `PALETTE` slots by first
   appearance; stop at 8 names (the 9th and later stay out of the map).
2. **`buildFlintOption`** applies the map per the Produces contract above. Keep
   the assignment logic in the single palette-application function task 2
   established.
3. **Thread it**: `compileReport` passes `colors` to every `buildFlintOption`
   call and adds it to each chart section's requery payload in
   `requeryActions`; `chart-data.yaml` admits it in `payloadSchema` (untrusted,
   aesthetic-only — same rationale the schema records for `width`) and passes
   `colors: { _payload: colors }` through.
4. **Chat path unchanged**: `buildDataParts` passes no `colors` — a chat turn
   is single-chart scope, and the per-chart default (palette order) is
   correct there.

## Acceptance Criteria

- `compileReport.test.js`:
  - A series name appearing in two chart sections gets the same hex in both
    assembled options (design acceptance item 5).
  - A pie slice name matching a bar-chart series name shares its hue.
  - A single-series bar between two multi-series charts takes `PALETTE[0]` and
    consumes no union slot.
  - With 10 union names, names 9–10 get per-chart unused slots; within one
    chart all series hexes are unique.
  - The chart requery payload carries the `colors` map.
- `buildFlintOption.test.js`: `colors` map honoured on bar, line, and pie;
  capped pie `Other` remains `NEUTRAL` even when the map is present.
- Plugin build, `pnpm ldf:b`, `pnpm e2e` green — `chart-data.spec.js`
  expectations updated in the same change.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.test.js` — modify
- `modules/ai-reporting/api/chart-data.yaml` — modify
- `apps/demo/e2e/ai-reporting/chart-data.spec.js` — update expectations

## Notes

- Broken/withheld chart sections have no rows at compile time — skip them in
  the union pass (their names can't be known) rather than throwing.
- The on-screen half of acceptance item 5 (same hue visibly, `Other` neutral)
  is judged at `/r:dev-test` in task 9.
