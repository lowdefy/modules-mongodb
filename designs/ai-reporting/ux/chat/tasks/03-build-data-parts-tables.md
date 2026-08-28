# Task 3: `buildDataParts` — the spec on every part, a tables branch, and a row cap

## Context

`plugins/modules-mongodb-plugins/src/analytics/buildDataParts.js` is the pure function the
`emit-data-parts` onFinish hook calls to turn a turn's validated specs plus fetched rows into
the `dataParts` the chat page's panel accumulates and the conversation document stores. Today:

```js
function buildDataParts({ charts = [], results = [], downloads = [], roles }) { … }
// { type: "data-report-chart",    data: { title, option } }
// { type: "data-report-download", data: { label, description, query } }
```

Two budgets of `MAX_DATA_PARTS_SPECS` (8), one per kind — deliberately separate, so a
chart-heavy turn cannot starve its downloads. Each spec is isolated in a `try`: a spec that
fails its checks is skipped and the rest of the turn's parts still return, because this runs in
a hook whose errors `handleAgentChat` only `console.warn`s.

Three things are wrong or missing for the panel to work as an artefact store:

1. **A chart part discards the spec that produced it.** It keeps the baked `option` and
   nothing else, so a ticked chart cannot become a report section — a section needs
   `{ chart, query, x, y }`, and a rendered option cannot be reversed into a pipeline. A
   download part already keeps its `query`, which is why exports work.
2. **There is no table part.** A tabular answer is the most common useful result and it is
   stranded in the transcript as text.
3. **A table part would freeze its rows** the way a chart part freezes its option, so it needs
   a row cap — a panel card is not where anyone reads the thousandth row.

Task 1 added `validateTableSpec({ spec, catalog, roles }) → { title, query, columns }`. Task 2
made `buildEChartsOption` project its source to `[x, …y]`. `verifyContract.js` already exports
`verifyTableContract({ columns, rows })` beside `verifyChartContract`.

## Interfaces

- **Consumes:** `validateTableSpec` (task 1), `verifyTableContract` from `verifyContract.js`,
  `buildEChartsOption` (task 2).
- **Produces:**
  - `buildDataParts({ charts, results, tables, tableResults, downloads, roles }) → parts[]`
  - part shapes, with `id` and `created` added later by the routine (task 6):

    ```
    { type: "data-report-chart",    data: { title, option, spec: { chart, query, x, y } } }
    { type: "data-report-table",    data: { title, rows, row_count, spec: { query, columns } } }
    { type: "data-report-download", data: { label, description, query } }
    ```

  - `MAX_DATA_PART_ROWS` — new export from `constants.js`, value `200`.

## Task

**In `constants.js`**, add beside `MAX_DATA_PARTS_SPECS`:

```js
export const MAX_DATA_PART_ROWS = 200;
```

Comment it with the constraint: a table part freezes its rows onto the conversation document,
which is rewritten every turn and capped at 16 MB, so the rows a card can show are bounded
independently of `PIPELINE_RESULT_CAP`; `row_count` carries the true total and `export_data` is
the affordance for the whole result.

**In `buildDataParts.js`:**

- Widen the signature to
  `{ charts = [], results = [], tables = [], tableResults = [], downloads = [], roles }`.
  `tableResults` is aligned with `tables` exactly as `results` is aligned with `charts` — the
  hook's `:for` step results, where a sparse entry skips its table. Reuse the existing
  array-coercion block (`if (!Array.isArray(resultsArray) && typeof resultsArray === "object")`)
  for `tableResults` too; extract it to a small local helper rather than copying it.
- **Chart branch:** carry the spec through. `validateChartSpec` already returns
  `{ chart, title, x, y }` and the validated `query` — destructure `query` as well and emit
  `data: { title, option, spec: { chart, query, x, y } }`.
- **New table branch**, between charts and downloads, with its own
  `tableBudget = MAX_DATA_PARTS_SPECS` — a third independent budget, on the same reasoning the
  existing two are separate:

  ```js
  const { title, query, columns } = validateTableSpec({ spec, roles });
  verifyTableContract({ columns, rows });
  parts.push({
    type: "data-report-table",
    data: {
      title,
      rows: projected.slice(0, MAX_DATA_PART_ROWS),
      row_count: rows.length,
      spec: { query, columns },
    },
  });
  ```

  where `projected` narrows each row to the declared column keys — the same rule task 2 applied
  to a chart's `dataset.source`, here against `columns.map((c) => c.key)`. The panel reads its
  column definitions from `spec.columns`, so do **not** emit a second copy of them outside
  `spec`.

  `row_count` is the total the query returned, before the cap — it is what lets a card say
  _first 200 of 964 rows_. No `catalog` is passed, matching the chart branch: the pipelines have
  already run through `AnalyticsPipeline`, so this re-runs the inert checks only.

  Skip on failure inside the same `try`, and do not spend budget on a skipped spec.

- **Download branch: unchanged.** `data: { label, description, query }` stays as it is — the
  chat page reads `downloads.$.query` and `get-conversation-results` projects that shape
  through. Do not reshape it into a `spec` for symmetry.
- Update the header docblock: the new `tables` / `tableResults` params on the pattern of the
  existing `charts` / `results` entries, the third per-kind budget, and one line on why a table
  part carries its rows capped while a chart part carries a baked option.
- **Do not mint `id` or `created` here.** This function is pure over its arguments with a unit
  test file beside it; a uuid or a clock read would make it non-deterministic and its tests
  unpinnable. Task 6 adds both in the routine.

**In `buildDataParts.test.js`**, add coverage: a valid table spec produces the part shape above;
a result of more than 200 rows is sliced to 200 with `row_count` holding the true total; rows
carrying fields outside the declared columns are projected away; a table whose declared column
key is absent from the rows is skipped (via `verifyTableContract`) without dropping the turn's
other parts; a ninth table spec in one turn is dropped while the turn's charts and downloads
still emit; a chart part carries `spec: { chart, query, x, y }`.

## Acceptance Criteria

- `npx jest src/analytics` from `plugins/modules-mongodb-plugins` passes.
- A turn with 8 charts, 8 tables and 8 downloads emits 24 parts — the budgets are independent.
- A table result of 964 rows yields `rows.length === 200` and `row_count === 964`.
- `buildDataParts` still returns identical output for identical arguments — no clock, no uuid.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/constants.js` — modify — `MAX_DATA_PART_ROWS`
- `plugins/modules-mongodb-plugins/src/analytics/buildDataParts.js` — modify — spec on chart
  parts, the table branch and its budget, the row cap
- `plugins/modules-mongodb-plugins/src/analytics/buildDataParts.test.js` — modify — table
  coverage, the cap, the spec passthrough

## Notes

A skipped spec is silent to the user today, and stays silent — surfacing it needs an error
dataPart type the chat page handles, which is out of scope here. Keep the existing comment
saying so.

`row_count` landing exactly on `PIPELINE_RESULT_CAP` (1000) means the query itself was probably
truncated by the engine's trailing `$limit`. The card's copy handles that (task 14); this
function only records the number.
