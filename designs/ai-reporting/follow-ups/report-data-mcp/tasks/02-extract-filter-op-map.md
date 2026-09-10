# Task 2: Extract the filter control→op mapping into one shared function

## Context

`boundFilters` in `plugins/modules-mongodb-plugins/src/analytics/compileReport.js:297-325`
turns a section's `filterBy` list into the filter triples `AnalyticsPipeline`
prepends as a `$match`. It holds the control→op rules:

- `daterange` → a pair, `{ field, op: "gte", … }` and `{ field, op: "lte", … }`
- `multiselect` → `{ field, op: filter.match === "all" ? "all" : "in", … }`
- `select` → `{ field, op: "eq", … }` (`FILTER_CONTROLS` is closed at three,
  `constants.js:34`)

Task 3 adds a **server-side** binder for the same rules: an MCP caller has no
page state, so it supplies filter values in the payload instead of the deferred
`{ __state: key }` placeholders the browser resolves at `onChange` time.

Two hand-kept copies of these rules will drift the first time a fourth control is
added, and the failure mode is silent — a filter that quietly does nothing, over
a surface whose entire risk is a confident wrong number. So the mapping is
extracted **before** the second consumer exists.

## Interfaces

- **Produces:** a named export from a new module
  `plugins/modules-mongodb-plugins/src/analytics/filterTriples.js`:

  ```js
  // filter: the spec's filter section ({ control, match?, … })
  // field:  the filtered field name
  // value:  what the triple carries — for daterange, a [lower, upper] pair of
  //         values; for select/multiselect, the single value
  // → array of { field, op, value } triples (two for daterange, one otherwise)
  export function filterTriples({ filter, field, value });
  ```

  Task 3 imports it with real values. `boundFilters` calls it with the deferred
  `{ __state: … }` placeholders.

## Task

1. Create `filterTriples.js` exporting `filterTriples({ filter, field, value })`,
   holding the control→op rules and nothing else. It is value-agnostic: it never
   inspects what `value` _is_, so the same function serves both the deferred
   placeholders and real payload values.

   For `daterange` it takes the pair and emits the `gte`/`lte` triples from its
   two elements. For `multiselect` it reads `filter.match` (defaulted to `"any"`
   by `validateReportSpec`, so the `!== "all"` fallback here only covers a
   section that never went through it). For anything else it emits `eq` —
   preserve the existing comment explaining that this is `select`, the remaining
   control of the closed three.

2. Rewrite `boundFilters` to call it, passing
   `{ __state: `${key}.0` }` / `{ __state: `${key}.1` }` as the daterange pair
   and `{ __state: key }` otherwise. `boundFilters` keeps ownership of
   `filterStateKey` and the `filterBy` iteration — only the op decision moves.

3. Move the comment explaining the `match`→`op` distinction ("the spec's `match`
   is the author's intent, the triple's `op` is the query it compiles to:
   `AnalyticsPipeline`'s `FILTER_OPS` maps `in` → `$in` and `all` → `$all`") to
   the new module, where the mapping now lives.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes with **no changes
  to existing test expectations** — this is a pure refactor and the compiled
  output must be byte-identical. `compileReport.test.js` and the
  `__snapshots__/` snapshots are the check; a snapshot diff means the refactor
  changed behaviour and is wrong.
- New unit tests in `filterTriples.test.js` cover all three controls plus
  `match: "all"` vs `"any"`, asserting the emitted `op` values.
- `grep -n "op: \"gte\"\|op: \"eq\"\|=== \"all\"" compileReport.js` finds nothing
  — no op decision remains in `compileReport.js`.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/filterTriples.js` — create — the
  shared control→op mapping
- `plugins/modules-mongodb-plugins/src/analytics/filterTriples.test.js` — create —
  unit tests per control
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify —
  `boundFilters` delegates the op decision

## Notes

- `filterTriples` is **not** registered as an `_analytics` operator. It is an
  internal module consumed by other analytics code; the operator surface stays as
  it is. Do not add it to the `functions` Map in `analyticsOperator.js`.
- Date **coercion** is deliberately not here — it belongs to the payload-facing
  binder in task 3, because `boundFilters`' values are placeholders that must not
  be touched. Keep this function free of any value inspection.
