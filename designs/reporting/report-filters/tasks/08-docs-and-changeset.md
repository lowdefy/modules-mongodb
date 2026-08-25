# Task 8: Rewrite the docs' filter-binding section, correct two verification claims, add a changeset

## Context

`docs/reporting/reference/presentation-contract.md` is the consumer-facing reference for what a report section declares and how it is verified. Two of its sections are now wrong or too narrow.

**Filter binding** (line 60-62) describes only the old world:

> A saved report can carry `filter` sections (`control: select | daterange`) that other sections subscribe to via `filterBy: [field, …]`. … A `select` filter needs an options source — either explicit `options` on the filter section, or enum `values` declared for the field in the catalog.

**Verification** (lines 48-51) carries two inaccuracies, one pre-existing and one created by this design:

- "**Declared columns must exist** in the result (checked against the first row — a pipeline emits a stable row shape)" — wrong today. `verifyContract.js`'s `requireKeys` requires the key in **at least one** row, deliberately: `$project` conditionals, `$unionWith` over differing shapes and a `$group` whose first bucket lacks an optional field all make row 0 an unreliable sample.
- "Zero rows … is never treated as an error" — stated absolutely, and this design draws the one boundary that rule never drew: an empty **options list** _is_ a failure, because an options list is not a result. The rule is about a section's result rows, where empty means "nothing matched" — information. A control with no options cannot be operated.

`docs/` is the source of truth for consumer-observable authoring behaviour, so both corrections belong here.

The repo also releases the plugin through changesets (`.changeset/*.md`, e.g. `reporting-open-query-engine.md`), and this change adds consumer-facing capability to `@lowdefy/modules-mongodb-plugins`.

## Task

### 1. Rewrite the filter-binding section

Cover, in the doc's existing register (dense prose plus a small table where it earns it):

- The three controls: `select` (single value), `multiselect` (an array of values), `daterange` (two bounds).
- `match: any | all` on a `multiselect`, default `any` — any-of vs all-of, and that `all` is meant for a field holding an array. Note that the engine does not enforce the field's type (catalog types are prompt material, never enforcement) and that `all` on a scalar field simply matches when one value is chosen.
- The three options sources and their precedence: declared `options` (agent-typed, capped at 50) → `optionsQuery` rows (capped at 500) → the field's catalog enum `values`. `options` and `optionsQuery` are mutually exclusive.
- `optionsQuery: { collection, pipeline, valueKey, labelKey }` — what it is for (a filter by foreign key that shows names rather than ids; a pre-filtered list; the distinct values of an array field), that it resolves **on every report open** through the same validation and per-viewer role gate as a section's query, and that `valueKey`/`labelKey` are a presentation contract verified against the returned rows.
- What a consumer sees when an options list can't be produced: an Alert in the filter row naming which of the three outcomes occurred (failed/denied, contract mismatch, no rows), with the bound sections still rendering their resolve-time rows and simply not re-querying.
- Truncation is stated: a query-sourced list over the cap is sliced and the control's title says `— first 500`.
- The clearing behaviour worth knowing: an empty multi-select means **no constraint** (the filter widens back to everything), not "match nothing".
- Keep and extend the existing limitation paragraph (a bound field must exist on the base-collection documents, not a post-`$group`/`$lookup` alias), and add the new one: **a bound filter matches documents, not array elements** — a section that `$unwind`s the filtered array will include the unselected elements of matching documents, so bind array-field filters on sections that count or aggregate documents, and prefer a catalogued view at the unwound grain when a section must group by the element itself (link `../how-to/complex-data.md`).

### 2. Correct the verification section

- "checked against the first row" → the declared column must be present in **at least one** row, with the reason in a clause (conditional `$project`, `$unionWith`, sparse `$group` buckets make row 0 an unreliable sample; a sparse column renders as blank cells).
- Scope the zero-rows rule to a section's **result** rows and name the one exception: a filter's options list, where empty is a failure because the list is the control the user operates, not an answer to a question.

### 3. Regenerate and check

`docs/llms.txt` is generated and committed. Run `pnpm docs:gen` from the repo root, then `pnpm docs:check` (CI runs the `--check` mode and fails on drift). Do not hand-edit `docs/llms.txt` or any `reference/vars.md`.

### 4. Changeset

Add `.changeset/reporting-report-filters.md` with a `minor` bump for `@lowdefy/modules-mongodb-plugins`, in the style of the existing `reporting-open-query-engine.md`: what the change gives a consumer (multi-select filters with any/all over scalar and array fields; filters whose options are looked up from another collection with readable labels), the one number that moves (`MAX_ARRAY_LITERAL_LENGTH` 100 → 500, and why it is a widening of pipeline _text_ with the byte and node budgets untouched), and the one behaviour a consumer must know (a bound filter matches documents, not array elements).

## Acceptance Criteria

- The filter-binding section documents all three controls, `match`, both caps, the options precedence, the degradation outcomes, the truncation note, the empty-selection meaning, and both limitations.
- Neither "checked against the first row" nor an unqualified "never treated as an error" remains in the file.
- Front-matter is unchanged and valid; `concepts` still lists `filter-binding`.
- `pnpm docs:check` passes from the repo root.
- `.changeset/reporting-report-filters.md` exists with a `minor` bump for `@lowdefy/modules-mongodb-plugins`.

## Files

- `docs/reporting/reference/presentation-contract.md` — modify — filter-binding rewrite plus the two verification corrections.
- `docs/llms.txt` — modify — regenerated by `pnpm docs:gen`, not by hand.
- `.changeset/reporting-report-filters.md` — create — `minor` bump plus the release note.

## Notes

Do not document anything this design leaves out — autocomplete / server-side option search, cross-filter dependency (a company list narrowed by the selected region), per-element filtering, and additional ops (`$nin`, `$regex`, numeric ranges) are all explicit non-goals. Mentioning them as "coming" makes them a promise.

If a `docs/reporting/how-to/` page or the module index also describes filters in a way this change makes stale, fix it in the same task — `docs/` is the source of truth for authoring behaviour and drift between two doc pages is worse than a longer diff.
