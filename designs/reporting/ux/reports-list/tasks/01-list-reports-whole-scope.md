# Task 1: Trim `list-reports` to return the whole scope

## Context

`modules/reporting/api/list-reports.yaml` is an aggregation endpoint that scopes, searches, sorts
and **pages** saved reports server-side. The reports-list page is being rebuilt to load a whole
scope at once and let AgGrid search/sort/page it client-side (the same way every other module list
in this repo feeds its grid), so the server-side offset paging is now dead surface and must go.

The endpoint's pipeline today ends with a `$facet` whose `results` branch runs
`$addFields` (`is_favourite`, `is_owner`, a `sections` guard) → `$sort` (caller sort or the
`is_favourite: -1, updated.timestamp: -1, _id: 1` default) → `$project` → **`$skip`** → **`$limit`**,
and whose `count` branch is a `$count`. The `:return` maps `reports` from `list_reports.0.results`
and `total` from `list_reports.0.count.0.count`.

`list-reports` has exactly two callers: `modules/reporting/pages/reports-list.yaml` (rebuilt in
later tasks) and two e2e specs. `modules/reporting/api/get-conversation-results.yaml` does its own
find and does not touch this endpoint's paging.

## Task

1. **Remove only the `$skip` and `$limit` stages** from the `$facet.results` pipeline so the
   endpoint returns every row in the requested scope. Leave everything else exactly as-is — the
   scope `$match`, the `search` `$regexMatch` stage, the `$facet` split, the `$addFields`, the
   caller/default `$sort`, the `$project` (with its `owner.name` snapshot and `favourite_of`
   exclusion), and the `:return` mapping both `reports` and `total`. Do **not** trim the `sort` or
   `search` parameters — the design flagged that as optional, and e2e covers sort.
2. **Update the header comment.** The block that begins "Paging is by offset. A cursor has to
   encode…" now describes removed behaviour. Replace it with a short note that the endpoint returns
   the whole scope because the page loads it and the grid pages it client-side (low-hundreds volume
   assumption), and that `total` is therefore just the full match count.
3. **Delete the obsolete paging e2e test.** In `apps/demo/e2e/reporting/report-scopes.spec.js`,
   remove the test titled **"the total is the unpaged match count while the rows honour skip and
   page_size"** (it sends `skip` / `page_size` and asserts two pages with an `_id` tiebreaker — all
   behaviour this change removes) and any helper (`ids`, etc.) left unused by its removal. Keep every
   other test: the per-scope membership/`total` assertions and the sort-order assertions still hold
   (`total` stays the full count, sort still applies).
4. **Note it on ownership.** In `designs/reporting/ux/ownership/design.md`, find its
   "Deviations from the wireframes" deviation about `list-reports` paging by offset and add a
   one-line note that reports-list reversed it — the endpoint now returns the whole scope, paged
   client-side.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` is clean; the resolved
  `.lowdefy/server/build/api/reporting/reporting-list-reports.json` has no `$skip`/`$limit` and its
  projection still carries `owner.name`, `is_owner`, `is_favourite`, `section_counts`, `filter_count`.
- `pnpm e2e` (reporting specs) passes with the paging test removed — the scope-membership, `total`,
  and sort tests in `report-scopes.spec.js` still pass.
- Ownership design carries the one-line reversal note.

## Files

- `modules/reporting/api/list-reports.yaml` — modify — remove `$skip`/`$limit`; rewrite the paging header comment.
- `apps/demo/e2e/reporting/report-scopes.spec.js` — modify — delete the skip/page_size paging test and any now-unused helper.
- `designs/reporting/ux/ownership/design.md` — modify — one-line note that list-reports no longer pages.

## Notes

- Keep the `_id` tiebreaker in the `$sort` — it is harmless without paging and keeps a stable order
  under equal sort keys.
- Do not touch the projection's `favourite_of` exclusion; a caller must never learn who else
  favourited a report.
