# Task 1: `buildFlintOption` — the Flint-backed builder, as a new file

## Context

Every chart in the reporting module is shaped server-side by
`plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js` — a pure mapping from
`{ chart, x, y, rows }` to a minimal ECharts option. This task introduces its replacement,
`buildFlintOption.js`, which delegates the derivation to the `flint-chart` compiler
(`assembleECharts` from `flint-chart/echarts`). **Do not modify or delete `buildEChartsOption.js`
in this task** — its two call sites (`buildDataParts.js`, `compileReport.js`) migrate in tasks 2
and 4; both builders coexist until then.

Facts about Flint (all verified against `0.5.0`; see `designs/reporting/flint-charts/findings.md`):

- `assembleECharts({ data: { values }, chart_spec: { chartType, encodings, baseSize } })` returns a
  native ECharts option with rows **inlined** (no `dataset`), plus private metadata: top-level
  `_width`, `_height`, `_dataLength`, `_transform`, `_pivot`.
- `baseSize.height` pins the **plot**; `_height = baseSize.height + grid.top + grid.bottom`
  exactly. `baseSize.width` affects no layout decision. Pass both fields or neither — a partial
  `baseSize` yields `_width: NaN`.
- Every assembled option carries a **function** at `tooltip.formatter`. JSON drops functions
  silently, and every path an option travels here is JSON.
- Passing an array `y` encoding (or using `normalizeStaticSeries`) leaks the literal strings
  `__flint_series_key` / `__flint_series_value` into user-visible places and silently stacks the
  bars. The working multi-series route is hand-folding (below).
- The folded multi-series option carries a `graphic` text element painting the fold key column's
  name (`Measure`) top-right on the canvas. Single-series options have no `graphic`.
- An unknown `chartType` throws. Empty `rows`, null values and Date values do not.
- Flint re-sorts categorical bars by value descending. This is adopted deliberately — do not
  counteract it (no `semantic_types` are passed).

## Interfaces

- **Produces:** `buildFlintOption({ chart, x, y, rows })` → `{ option, height }` where `option` is
  a JSON-safe ECharts option (no `_`-keys, no functions, no `graphic`) and `height` is Flint's
  `_height` (a number — the canvas height the chart wants). Default export of
  `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.js`, and registered on the
  `_analytics` server operator as `_analytics.buildFlintOption`. `chart` is one of
  `"bar" | "line" | "pie"`; `y` is a non-empty array of column names; `rows` may be nullish
  (treated as `[]`). It can **throw** (Flint validates) — callers own containment.

## Task

1. **Pin the dependency.** In `plugins/modules-mongodb-plugins/package.json` add
   `"flint-chart": "0.5.0"` (exact — no range prefix) to `dependencies`, then run `pnpm install`
   from the repo root to update `pnpm-lock.yaml`.

2. **Create `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.js`.** Shape:

   ```js
   import { assembleECharts } from "flint-chart/echarts";

   // Plot height is pinned; the canvas varies (design: "The plot is pinned and
   // the canvas varies"). Width is layout-inert but must be present.
   const BASE_SIZE = { width: 1100, height: 220 };

   function buildFlintOption({ chart, x, y, rows }) {
     const values = rows ?? [];
     // ...select template + encodings (table below), folding multi-y first...
     const option = assembleECharts({
       data: { values: /* rows or folded rows */ },
       chart_spec: { chartType, encodings, baseSize: BASE_SIZE },
     });
     const height = option._height;
     // ...strip walk (below), then:
     return { option, height };
   }

   export default buildFlintOption;
   ```

   Template and encoding selection:

   | Spec                  | `chartType`         | `encodings`                                                          | Data        |
   | --------------------- | ------------------- | -------------------------------------------------------------------- | ----------- |
   | `pie`                 | `"Pie Chart"`       | `{ color: { field: x }, size: { field: y[0] } }`                     | rows as-is  |
   | `bar`, `y.length===1` | `"Bar Chart"`       | `{ x: { field: x }, y: { field: y[0] } }`                            | rows as-is  |
   | `bar`, `y.length>1`   | `"Grouped Bar Chart"` | `{ x: { field: x }, y: { field: "Value" }, group: { field: "Measure" } }` | folded |
   | `line`, `y.length===1`| `"Line Chart"`      | `{ x: { field: x }, y: { field: y[0] } }`                            | rows as-is  |
   | `line`, `y.length>1`  | `"Line Chart"`      | `{ x: { field: x }, y: { field: "Value" }, color: { field: "Measure" } }` | folded |

   The fold (wide → long, with human column names — never Flint's `__flint_*` route):

   ```js
   const folded = values.flatMap((row) =>
     y.map((column) => ({ [x]: row[x], Measure: column, Value: row[column] })),
   );
   ```

   The strip walk — one recursive pass over the assembled option that deletes, at any depth,
   (a) keys starting with `_` and (b) keys whose value is a function; then `delete option.graphic`
   at the top level. Rationale lives in the design's "Strip what must not ship" section: `_`-keys
   are private metadata that would persist forever, functions cannot survive JSON so stripping
   makes the loss explicit and the snapshots honest, and `graphic` paints the literal word
   `Measure` on multi-series canvases. Capture `height` from `_height` **before** stripping.

   Write a header comment in the same register as `buildEChartsOption.js`'s current one: the AI
   never contributes chart config — it names a chart kind, a query and the x/y columns; Flint
   derives everything else server-side.

3. **Register on the `_analytics` operator.** In
   `plugins/modules-mongodb-plugins/src/analytics/analyticsOperator.js`: import it, add
   `["buildFlintOption", buildFlintOption]` to the `functions` Map (alphabetical position), and add
   a line to the doc comment's method list:
   `_analytics.buildFlintOption { chart, x, y, rows } → { option, height }`.

4. **Write `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.test.js`** (jest, same
   conventions as the sibling `*.test.js` files). Cover:

   - **Snapshots of the returned `{ option, height }`** for: single-`y` bar (categorical x),
     multi-`y` bar (grouped), single-`y` line (temporal x, e.g. `"2026-01"` strings), multi-`y`
     line, and pie. Use small fixed row fixtures (e.g. the region/revenue/cost rows from
     `probe.mjs`). These snapshots are the Flint-upgrade tripwire the design requires.
   - **Strip assertions:** a deep walk over each snapshot's `option` finds no key starting with
     `_`, no function values, and no `graphic` key. Multi-series options contain the substring
     `__flint` nowhere (JSON.stringify and check).
   - **Grouped, not stacked:** the multi-`y` bar option's series all have no `stack` (or
     `stack: undefined`), one series per `y` column, named by the real column names.
   - **`height` is a number** and equals what `_height` was (assert e.g. `height > 220`).
   - **Empty rows:** `buildFlintOption({ chart: "bar", x, y, rows: [] })` and `rows: undefined`
     return without throwing.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-mongodb-plugins test -- buildFlintOption` (or the repo's
  equivalent single-suite invocation, sandbox off) passes with the snapshots written.
- `pnpm-lock.yaml` records `flint-chart` at exactly `0.5.0`.
- `buildEChartsOption.js` is byte-identical to before this task.
- `_analytics.buildFlintOption` dispatches (the operator test can be a one-line addition to the
  existing operator coverage if any exists; otherwise the Map registration is verified by task 3's
  endpoint).

## Files

- `plugins/modules-mongodb-plugins/package.json` — modify — add `flint-chart: 0.5.0`.
- `pnpm-lock.yaml` — modify — via `pnpm install`.
- `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.js` — create.
- `plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.test.js` — create.
- `plugins/modules-mongodb-plugins/src/analytics/analyticsOperator.js` — modify — register the
  method and document it.

## Notes

- `pnpm-lock.yaml` already carries an unrelated uncommitted change in the working tree — leave it;
  `pnpm install` layers on top.
- Do **not** pass `semantic_types` — omitting it is verified byte-identical for the default case,
  and Flint's value-descending re-sort of categorical bars is an accepted design decision.
- `y` reaching this function is already validated non-empty by `validateChartSpec` at every caller,
  so no defensive guard — a throw on garbage input is acceptable and contained by callers.
