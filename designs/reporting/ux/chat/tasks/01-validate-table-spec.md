# Task 1: `validateTableSpec` — the table contract as a standalone validator

## Context

The analytics plugin validates one spec shape per renderer, each in its own file, each
registered on the `_analytics` server operator:

- `validateChartSpec.js` — `{ chart, title, query, x, y }`, and it **exports `validateQuery`**,
  the shared `{ collection, pipeline }` check that `validateExportSpec.js` and
  `validateReportSpec.js` both import.
- `validateExportSpec.js` — `{ label?, description?, query }`.
- `validateReportSpec.js` — the whole report spec, whose per-section branches delegate:
  its `chart` branch calls `validateChartSpec` with `title: label` and takes back
  `{ chart, query, x, y }`, discarding the title (`validateReportSpec.js:236-258`).

There is no table equivalent. The table column contract —
`columns: [{ key, label?, format? }]` — exists today **only** inline inside
`validateReportSpec.js`'s `table` branch (`:261-318`). A new `render_table` agent tool needs
that same contract validated outside a report spec, so it gets lifted into its own file on
the pattern above.

Two helpers the table branch depends on are module-private in `validateReportSpec.js`:
`absent` (`:63`, `(value) => value === undefined || value === null`) and
`validateFormat(format, where)` (`:102-130`), which closes over that file's module-level
`fail`. `validateFormat` is also used by the `kpi` branch (`:231`), so it must stay shared
rather than be copied.

## Interfaces

- **Produces:**
  - `validateTableSpec({ spec, catalog, roles }) → { title, query, columns }` — default export
    of `plugins/modules-mongodb-plugins/src/analytics/validateTableSpec.js`. Throws
    `Error("Invalid table spec: …")`.
  - `validateFormat(format, where, fail) → { style, currency?, locale?, decimals? }` — named
    export of the same file. `fail` is the caller's throwing function; `where` is the message
    prefix.
  - `_analytics.validateTableSpec` — the operator method, callable from endpoint routines.

## Task

**Create `plugins/modules-mongodb-plugins/src/analytics/validateTableSpec.js`.**

Model it on `validateChartSpec.js`, including the header comment explaining what `catalog`
controls (present → run `validatePipeline` now, the validate-before-ack posture; absent →
shape checks only, because `AnalyticsPipeline` revalidates at execution regardless).

```js
function validateTableSpec({ spec, catalog, roles }) { … }
```

Checks, in this order:

1. `spec` must be a non-array object.
2. `title` is required, a non-empty string, at most `MAX_LABEL_LENGTH` (200) characters.
   Same wording as `validateChartSpec`'s title checks.
3. `query` through the imported `validateQuery(spec.query, { catalog, roles, fail })`.
4. `columns` must be a non-empty array. Each entry, by index `ci`:
   - a non-array object;
   - strict keys — only `key`, `label`, `format`; anything else fails naming the offending
     key and the allowed set. **There is deliberately no `tag` flag** (the derived enum-tag
     styling was dropped); carry that note across in a comment as `validateReportSpec` has it;
   - `key` is a required non-empty string, at most `MAX_LABEL_LENGTH`;
   - `label`, when present, a string at most `MAX_LABEL_LENGTH`;
   - `format`, when present, through `validateFormat(col.format, …, fail)`.

   Emit only the keys that were supplied — an absent optional stays absent in the output, and
   a `null` reads as absent (`absent()`), matching `validateReportSpec`'s normalisation.

Return `{ title, query, columns }`.

**Move `validateFormat` into this file and export it**, changing its signature to
`validateFormat(format, where, fail)` so it no longer closes over a caller's module scope.
Keep its body and every message string byte-identical. Add a local `absent` one-liner.

**Update `validateReportSpec.js`:**

- delete its local `validateFormat`, import the named export instead, and pass its own `fail`
  at both call sites (`:231` kpi, `:304` table column) — the `where` strings do not change, so
  every error message stays identical;
- replace the inline column validation in the `table` branch with a call to
  `validateTableSpec`, exactly as the `chart` branch calls `validateChartSpec`:

  ```js
  const { query, columns } = validateTableSpec({
    spec: { title: label, query: section.query, columns: section.columns },
    catalog,
    roles,
  });
  ```

  The returned `title` is discarded — a report section's user-facing string is `label`, and
  the tool's is `title`, the same asymmetry the chart branch already carries. The branch's
  own thrown messages change prefix from `Invalid report spec: section N (table) …` to
  `Invalid table spec: …`; update `validateReportSpec.test.js` where it asserts on those
  strings, and leave every other message alone.

- drop `FORMAT_STYLES` from its `constants.js` import if nothing else in the file uses it.

**Register the operator** in `analytics/analyticsOperator.js`: add
`["validateTableSpec", validateTableSpec]` to the `functions` Map (it is a `Map`, not an
object, deliberately — see the comment above it) and add the method to the docblock's list.

**Write `validateTableSpec.test.js`** beside it, on the shape of
`validateReportSpec.test.js`: a valid spec returns the normalised shape; a missing/blank
title, an empty `columns`, a column with no `key`, a column with an unexpected key, an
over-length key, and a bad `format.style` each throw with the expected message; an absent
optional is absent in the output and a `null` `label` reads as absent; a spec with a
`catalog` runs the pipeline gate and one without does not.

## Acceptance Criteria

- `npx jest src/analytics` from `plugins/modules-mongodb-plugins` passes, including
  `validateReportSpec.test.js` with only the table-branch prefix assertions changed.
- `_analytics.validateTableSpec` appears in the operator's unsupported-method error message
  (`Supported methods: …`), which the operator builds from the Map's keys.
- No column-contract logic remains in `validateReportSpec.js`.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/validateTableSpec.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/validateTableSpec.test.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.js` — modify — delegate
  the table branch, import the shared `validateFormat`
- `plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.test.js` — modify — the
  table-branch message prefixes
- `plugins/modules-mongodb-plugins/src/analytics/analyticsOperator.js` — modify — register the
  method

## Notes

`verifyTableContract({ columns, rows })` already exists in `verifyContract.js` — the runtime
check that every declared column key is present in the rows. Do not duplicate it here;
`validateTableSpec` is inert-shape validation only, and a contract cannot be checked against
a pipeline statically. Task 3 is what calls the verifier.
