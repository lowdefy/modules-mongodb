# Task 5: One shared ordered query list for the resolver and the compiler

## Context

Two files independently compute the same list, and their agreement is what keeps the resolver's results aligned with the report's sections:

- `querySections.js` returns `sections.filter(s => ["kpi","chart","table"].includes(s.type)).map(s => ({ id, type, query }))`. `resolve-report` iterates it with `:for`, running one `AnalyticsPipeline` per entry inside `:try`, so the (possibly sparse) step array lines up index-for-index with this list.
- `compileReport.js` recomputes `sections.filter(s => ["kpi","chart","table"].includes(s.type)).map(s => s.id)` (lines 346-352) and zips it against `results` to build `rowsBySectionId`.

Two expressions that must stay identical, in two files, related only by convention. The design makes that alignment load-bearing in a **second** place: an options query is a catalog-validated pipeline that must be role-checked for the _viewing_ user, which is exactly what the `resolve-report` loop already provides — so filter sections carrying an `optionsQuery` join the same ordered list and **the routine does not change at all**. With two entry kinds, duplicated filter expressions become a latent bug, so the list moves into one exported helper both files import.

Task 3 made the normalized filter section carry `optionsQuery` forward, which is what makes it visible here.

## Task

In `plugins/modules-mongodb-plugins/src/analytics/querySections.js`:

1. Export a helper — `export function orderedQueries(sections)` — that takes the **normalized** sections array and returns, **in spec order**, one entry per query the resolver must run:
   - each `kpi` / `chart` / `table` section → `{ id: section.id, type: section.type, query: section.query }` (unchanged shape);
   - each `filter` section that carries an `optionsQuery` → `{ id: section.id, type: "filter", query: { collection, pipeline } }`, the query half of its `optionsQuery`.

   Entries are interleaved at their section's position, not grouped — a filter declared between two data sections sits between them in the list. A filter with no `optionsQuery` (declared `options`, or catalog enum `values`) contributes no entry.

   The `query` value must be the plain `{ collection, pipeline }` the `AnalyticsPipeline` request expects — strip `valueKey`/`labelKey` here rather than passing them through. `compileReport` reads the contract keys off the spec section, not off this list.

2. `querySections({ spec, catalog, roles })` becomes `orderedQueries(validateReportSpec({ spec, catalog, roles }).sections)`. Its doc comment gains the second entry kind and the reason it is here rather than behind a new endpoint: catalog validation plus per-viewer role enforcement come for free from the one gate every query already passes.

In `plugins/modules-mongodb-plugins/src/analytics/compileReport.js`:

3. Import `orderedQueries` from `./querySections.js` and replace the recomputed `querySectionIds` block with it, keying `rowsBySectionId` off the helper's entries:

   ```js
   orderedQueries(sections).forEach((entry, index) => {
     rowsBySectionId.set(entry.id, resultsArray[index] ?? null);
   });
   ```

   Behaviour for data sections is unchanged. Filter entries land in the map unused until task 6 reads them — the point of doing this first is that the _alignment_ is correct before anything consumes it.

There is no import cycle: `querySections.js` imports only `validateReportSpec.js`, and `compileReport.js` already imports that too.

Add tests:

- `querySections.test.js` (or the existing coverage in `compileReport.test.js`, which already imports `querySections`) — a spec with a filter carrying an `optionsQuery` declared **between** two data sections returns three entries in spec order, the filter's entry carrying `type: "filter"` and only `{ collection, pipeline }`; a filter with declared `options` and a `daterange` filter contribute nothing.
- `compileReport.test.js` — with a filter-options entry interleaved between data sections, each data section still renders the rows the resolver returned for **it** (the regression this refactor exists to prevent: pass distinguishable row sets and assert per-section, not just that nothing threw).

## Acceptance Criteria

- One exported helper computes the list; neither file contains a second `["kpi","chart","table"]` filter expression.
- Entries are in spec order with filter-options entries interleaved at their section's position.
- A filter without an `optionsQuery` produces no entry.
- Data-section results stay aligned with a filter entry interleaved — asserted per section with distinguishable rows.
- `CI=true pnpm test querySections compileReport` passes (repo root, sandbox off).
- `modules/ai-reporting/api/resolve-report.yaml` is **not** modified.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/querySections.js` — modify — export `orderedQueries`; include filter sections with an `optionsQuery`.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify — import the helper instead of recomputing the list.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify — interleaved-alignment case.
- `plugins/modules-mongodb-plugins/src/analytics/querySections.test.js` — create or modify — entry-kind and ordering cases.

## Notes

`querySections` is called from YAML via the `_analytics` operator roster (`analyticsOperator.js`) — keep the default export and its `{ spec, catalog, roles }` signature exactly as they are, since `resolve-report.yaml` calls it. Only the _contents_ of the returned list change.

`resolve-report` passes **no catalog** at resolve time deliberately (the per-entry `AnalyticsPipeline` is the security gate, so an inaccessible section becomes one Alert card instead of a whole-report throw). That applies to options queries too: a denied options pipeline fails inside `:try` and reaches `compileReport` as a null entry, which task 6 turns into the filter's Alert.
