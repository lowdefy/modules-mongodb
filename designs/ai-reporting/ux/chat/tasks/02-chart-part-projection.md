# Task 2: A chart part carries only the columns it draws

## Context

`plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js` builds an ECharts option
in the dataset + explicit-encode form:

```js
const source = rows ?? [];
// pie:      series[0].encode = { itemName: x, value: y[0] }
// bar/line: series[i].encode = { x, y: column }  per y column
// both:     dataset: { source }
```

So `dataset.source` is the query's **whole** row array — every field the pipeline emitted —
while the series `encode` only ever reads `x` and the `y` columns. That option is what
`buildDataParts` bakes into a `data-report-chart` part, and that part is `$push`ed onto the
conversation document by `emit-data-parts`, which fetches those rows at the connection's 8 MB
budget. A persisted chart part is therefore as wide as its query rather than as wide as its
presentation contract, and it is the second unbounded path into the 16 MB document ceiling.

The fix is to project the source to the declared columns. It is lossless: the chart draws
nothing else, and no consumer of the baked option reads a column outside `[x, …y]`.

**`compileReport` calls this same function** (`compileReport.js:518-524`) — and it is
unaffected, for a reason worth knowing before you touch it: it passes `rows: []` and then
assigns `option.dataset.source = dataBinding(section, rows)` **unconditionally**, replacing
whatever the function produced. `dataBinding` (`compileReport.js:140-145`) returns the raw
rows for an unfiltered section and a deferred `__state` read for a filtered one. So the
projection changes nothing on the report render path in either direction — it neither narrows
a report payload nor can it narrow a live report.

## Interfaces

- **Produces:** `buildEChartsOption({ chart, x, y, rows })` — unchanged signature, with
  `dataset.source` now an array of objects carrying only the `x` key and each `y` key.

## Task

**In `buildEChartsOption.js`**, project each row before it becomes the source:

```js
const columns = [x, ...y];
const source = (rows ?? []).map((row) =>
  Object.fromEntries(columns.map((column) => [column, row[column]])),
);
```

Use the object form, not tuples — `encode` addresses columns by name, and the dataset's
implicit dimension detection reads the keys of the first row.

Add a comment saying **why**: the option is persisted onto the conversation document as a
chart part, so an unprojected source makes the part as wide as its query instead of as wide
as its contract. Keep it to the constraint; do not narrate the `map`.

Extend the header comment's existing sentence about `compileReport` swapping the source, so it
records that the report path passes `rows: []` and overwrites `dataset.source` outright —
which is what makes projecting here safe.

**Update `buildDataParts.test.js`**, the only test file that exercises the option's source:

- `:38` — `expect(parts[0].data.option.dataset.source).toEqual(rows)` becomes the projected
  rows. Make the fixture's rows carry at least one field outside `[x, …y]` so the assertion
  proves the projection rather than restating the input.
- `:108` and `:135` — adjust to the projected shape (`:135`'s empty-rows case is unchanged,
  `[]` projects to `[]`).

Add one direct case: rows carrying a fat extra field (e.g. a nested object) produce a source
whose row keys are exactly `[x, …y]`.

## Acceptance Criteria

- `npx jest src/analytics` from `plugins/modules-mongodb-plugins` passes, including
  `compileReport.test.js` unchanged — in particular `compileReport.test.js:161`, which asserts
  `dataset.source` equals the section's rows, still passes because that assignment happens
  after the call.
- A chart part built from rows with fields outside the contract carries only the contract's
  columns in `dataset.source`.
- Multi-series (`y` with two columns) and `pie` (which reads `y[0]`) both keep every column
  they encode.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js` — modify — project the
  source to `[x, …y]`
- `plugins/modules-mongodb-plugins/src/analytics/buildDataParts.test.js` — modify — the source
  assertions, plus a direct projection case

## Notes

Do not reach for `$project` in the pipeline instead. The pipeline is AI-authored and its
output shape is what the contract is declared against; narrowing at the option is the one
place that is guaranteed to match what the chart actually encodes.
