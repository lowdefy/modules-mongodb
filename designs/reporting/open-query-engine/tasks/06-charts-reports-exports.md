# Task 6: Charts, Reports, and Exports on the Open Engine (Presentation Contract)

## Context

Every renderer today derives its contract from the structured spec's shape: `buildEChartsOption.js` encodes axes as `select[0]` / `measures[].key`; KPI sections read `measures[0].key` from row 0 with currency/locale from the measure's dictionary entry; table columns come from `select` + `measures`; report filter controls append `{ field, op, value }` entries to the section query's `filters` array at compile time (`compileReport.js`). A raw pipeline has no derivable structure, so queries and presentation separate: sections carry `{ collection, pipeline }` plus an **AI-declared presentation contract**, verified against actual rows at render points.

The `_analytics` server operator (`src/analytics/analyticsOperator.js`) is the YAML-facing surface for all of this — its method roster (`validateReportSpec`, `validateChartSpec`, `validateExportSpec`, `querySections`, `compileReport`, `buildDataParts`) is what the API routines call.

Prerequisites in place: `AnalyticsPipeline` with filter-triple prepend (task 3), the catalog (task 4).

## Task

**Rewrite in `plugins/modules-mongodb-plugins/src/analytics/` (and their tests):**

- `validateChartSpec.js` — chart spec becomes `{ chart: bar|line|pie, title, query: { collection, pipeline }, x, y: [column] }`. Contract checks are inert-data checks only: `x` a non-empty string, `y` a non-empty array of strings, length caps (`MAX_LABEL_LENGTH`); no query grammar. Pipeline validation happens in `AnalyticsPipeline` at execution — but DO run `validatePipeline` here too if the catalog is passed, matching today's validate-before-persist posture for reports (`generate_report` validates before saving).
- `validateReportSpec.js` — sections carry pipeline queries + contracts: kpi `{ label, query, valueKey, format? }`; chart `{ chart, label, query, x, y }`; table `{ label, query, columns: [{ key, label?, format? }] }` — **no `tag` flag: enum tag styling is deliberately dropped** (design decision 2026-07-22; cells render plain text); filter `{ control: select|daterange, field, label, options? }` unchanged shape; markdown/download unchanged. `filterBy` validation: bound fields must be plausible base-collection fields (string, non-`$`-prefixed — the deep check happens at re-query validation); select-control options come from declared `options` or the catalog field's enum `values` (`MAX_FILTER_OPTIONS` cap as today). Positional section ids `s0, s1…` stay.
- `validateExportSpec.js` — `{ label?, description?, query: { collection, pipeline } }`. **No contract** — CSV headers come from row keys.
- `compileReport.js` — consume declared contracts instead of derived select/measures: KPI reads `rows[0][valueKey]` with the declared `format` (keep the `?? 0` empty fallback and `__if_none` dataBinding); table columns from the declared `columns` (label + format; right-align numeric formats); number formatting from contract `format` descriptors (`{ style: decimal|currency, currency?, locale?, decimals? }`) with the `REPORT_*` defaults; filter re-query CallAPIs send `{ query: { collection, pipeline }, filters: [{ field, op, value: { __state: … } }] }` to the query endpoint (deferred `__state` values as today).
- `buildEChartsOption.js` — explicit encode from the declared `x`/`y` instead of `select`/`measures` (pie: `itemName: x`, `value: y[0]`).
- `buildDataParts.js` — run each chart/download query via `AnalyticsPipeline`; verify the contract **against the actual rows**: declared `x`/`y`/`valueKey`/column keys must exist, `y`/KPI values numeric. **Verification applies only to non-empty results** — zero rows render an empty chart / zero KPI / empty table; `null` cells in `y`/value columns are tolerated (null group keys are normal). Mismatch → actionable error (chat: tool error the agent self-corrects on; report view: existing Alert-card fallback).
- `querySections.js` — unchanged logic, new shapes (kpi/chart/table sections with `query: { collection, pipeline }`).
- `analyticsOperator.js` — same method roster, updated signatures (`datasets` param → `catalog` where validators still take the dictionary for validate-before-persist).
- `testDatasets.js` — becomes a catalog fixture (rename export if it improves clarity; update all test imports).
- `constants.js` — delete now-orphaned spec-grammar constants (`AGGREGATIONS`, `OPS_BY_TYPE`, `DATE_BUCKETS`, `MAX_SELECT`, `MAX_MEASURES`, `MAX_FILTERS`, `MAX_SORT`, `ID_REGEX`, `PATH_REGEX`, `MEASURE_FORMATS`, `DEFAULT_LIMIT`/`MAX_LIMIT` if unused) — verify with grep before each removal.

**Update `modules/reporting/api/`:**

- `render-chart.yaml`, `generate-report.yaml` — payload schemas accept `{ collection, pipeline }` + contract; validate via `_analytics.*` before persisting (reports persist raw with userId scope, as today).
- `export-data.yaml` — pipeline-only payload, no contract.
- `resolve-report.yaml`, `emit-data-parts.yaml` — `:for` loops target `AnalyticsPipeline` with `roles: { _user: roles }` (per-section `:try` and index-aligned sparse results stay as today; a section whose pipeline fails validation for the viewing user renders the Alert card).

## Acceptance Criteria

- All rewritten unit tests pass; no source file imports `validateQuerySpec` or `compileMongo` (they're gone).
- `grep -rn "select\[0\]\|measures\[0\]" plugins/` returns nothing in analytics source.
- Contract-vs-rows verification: unit tests for missing key (fails with actionable message), non-numeric `y` (fails), zero rows (passes, renders empty), null cells in `y` (passes).
- Table validator rejects a `tag` key in columns (unknown-key strictness optional — at minimum it is not honored) and export validator rejects a contract payload.
- Persisted-report shape: `generate-report.yaml` validates before persist; `resolve-report.yaml` revalidates per viewer at resolve — both via the same `AnalyticsPipeline`/`_analytics` gates.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/` — `validateChartSpec.js`, `validateReportSpec.js` (+test), `validateExportSpec.js`, `compileReport.js` (+test), `buildEChartsOption.js`, `buildDataParts.js` (+test), `querySections.js`, `analyticsOperator.js`, `testDatasets.js`, `constants.js` — modify
- `modules/reporting/api/render-chart.yaml`, `generate-report.yaml`, `export-data.yaml`, `resolve-report.yaml`, `emit-data-parts.yaml` — modify

## Notes

Persisting raw pipelines stores nested `$`-prefixed field names inside report documents — requires MongoDB ≥ 5.0 on the app database (documented in task 9; nothing to code here, but don't "sanitize" the persisted pipeline — the resolve-time revalidation is the guarantee). Old persisted reports and saved-conversation download parts become invalid by design (compat waiver) — no migration code.
