# Task 3: Validate the new filter-section keys — allowed keys, `match`, `optionsQuery`

## Context

`plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.js` validates the persisted report spec and returns a **normalized** spec (sections carry positional ids `s0`, `s1`, …). `compileReport` and `querySections` both read the normalized output, never the raw spec — so anything the filter branch does not carry forward is silently lost.

Today's `filter` branch (lines 209-241) checks `control` against `FILTER_CONTROLS`, requires a non-`$`-prefixed `field`, optionally accepts an `options` array of at most `MAX_FILTER_OPTIONS` strings/numbers, and returns `{ id, type, control, field, label, options }`. It tolerates every other key silently. A second pass (lines 269-312) requires distinct filter fields, requires each filter to be bound by at least one section via `filterBy`, and — only when a `catalog` is passed (validate-before-persist) — requires a `select` filter to have an options source.

Task 1 added `multiselect` to `FILTER_CONTROLS`, `FILTER_MATCH_MODES = ["any", "all"]` and `MAX_QUERY_FILTER_OPTIONS = 500`. This task teaches the validator the rest of the new wire format:

| Key            | Type                                           | Meaning                                                                    |
| -------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `control`      | `select \| multiselect \| daterange`           | `multiselect` is new; its state value is an array.                         |
| `match`        | `any \| all` (default `any`)                   | `multiselect` only. Selects the `in`/`all` triple op. Rejected elsewhere.  |
| `optionsQuery` | `{ collection, pipeline, valueKey, labelKey }` | Rows become `{ label, value }` options. Mutually exclusive with `options`. |

The design's reasoning worth carrying into the code: `match` is deliberately **not** validated against the catalog's `type: array`. Catalog types are prompt material, never enforcement, so gating on them would let a missing or wrong `type` reject a legitimate report — and `$all` on a scalar field is harmless anyway (it matches when exactly one value is chosen). That rule lives in the agent instructions instead (task 7).

The key-shape rule is the treatment table columns already have. Rather than a one-off "reject `match` on a `select`" check, the filter branch gets an **allowed-key list**, which also catches what a one-off check cannot: `optionsquery`, `optionQuery` or `labelkey` are silently dropped today, and a dropped options source produces a filter with no options instead of an error.

## Task

Edit the `filter` branch of `validateReportSpec.js`:

1. **Allowed-key check**, before the per-key validation, mirroring the table-column pattern at lines 183-187:

   ```js
   for (const key of Object.keys(section)) {
     if (
       ![
         "type",
         "label",
         "control",
         "field",
         "options",
         "match",
         "optionsQuery",
       ].includes(key)
     ) {
       fail(
         `section ${index} (filter) has an unexpected key "${key}" (allowed: type, label, control, field, options, match, optionsQuery).`,
       );
     }
   }
   ```

   The list deliberately **excludes `id`** — the validator assigns `s${index}` itself — and matches the key set the agent instructions state for a filter section, so strictness enforces the documented contract rather than inventing one.

2. **`match`**: allowed only on `control: multiselect`, and only a value in `FILTER_MATCH_MODES`. Two distinct, actionable messages — one naming that `match` is a `multiselect`-only key (this is how the agent learns the vocabulary: it means the agent believed it had asked for something the control cannot express), one naming the allowed values. Default it to `"any"` in the normalized output for a `multiselect`; leave it absent for other controls.

3. **`options` / `optionsQuery` exclusivity**: declaring both fails with a message saying two sources for one list is a mistake, not a merge (options precedence is `options` → `optionsQuery` rows → catalog enum `values`).

4. **`optionsQuery`**: validate the query half with the existing `validateQuery` from `validateChartSpec.js` — the same helper the kpi/chart/table/download branches use, so the pipeline is walked against the catalog with the _saving_ user's roles when a catalog is present:

   ```js
   const query = validateQuery(section.optionsQuery, {
     catalog,
     roles,
     fail: (m) => fail(`section ${index} (filter) optionsQuery ${m}`),
   });
   ```

   Then validate `valueKey` and `labelKey` as ordinary contract strings: required, non-empty, at most `MAX_LABEL_LENGTH`. **Re-attach them** to the normalized value — `validateQuery` returns only `{ collection, pipeline }`, so the normalized section must carry `optionsQuery: { ...query, valueKey, labelKey }`. Dropping them yields a dropdown of blank options at compile time and nothing fails at validation time.

5. **Normalized return** must carry the new keys forward:

   ```js
   return {
     id,
     type: "filter",
     control,
     field,
     label,
     options,
     match,
     optionsQuery,
   };
   ```

   Omitting `match` silently downgrades every `all` filter to `any`; omitting `optionsQuery` loses the options source. Neither fails at validation time — this is the trap the design calls out explicitly.

6. **Second pass**: the options-source check (line ~303) extends to `multiselect` and accepts `optionsQuery` as a source:

   ```js
   if (catalog && ["select", "multiselect"].includes(filter.control) &&
       filter.options === undefined && filter.optionsQuery === undefined) { … }
   ```

   Keep the existing catalog-enum-`values` fallback and its message, extended to mention `optionsQuery` as a third source.

Update the file's doc comment (the section-shape list at lines 19-24) so the `filter` line reads `{ type: filter, control: select|multiselect|daterange, field, label, options?, match?, optionsQuery? }`.

Add tests to `validateReportSpec.test.js`:

- `control: multiselect` is accepted; an unknown control still fails naming all three.
- The allowed-key rejection, **including a misspelled `optionsquery`** — this is the case the design cites as today's silent failure.
- `match: all` on a `multiselect` is accepted and normalized; `match` on a `select` or `daterange` is rejected; `match: "either"` is rejected.
- A `multiselect` with no `match` normalizes to `match: "any"`.
- `optionsQuery` shape: a valid one normalizes with `collection`, `pipeline`, `valueKey`, `labelKey` **all present** (assert the re-attachment explicitly — this is the trap); a missing/empty `valueKey` or `labelKey` fails; a bad `collection`/`pipeline` fails through `validateQuery`.
- Declaring both `options` and `optionsQuery` fails.
- The options-source check: a `multiselect` with neither source and no catalog enum `values` fails when a catalog is passed; the same spec with an `optionsQuery` passes.

## Acceptance Criteria

- Every case above is covered and `CI=true pnpm test validateReportSpec` passes (repo root, sandbox off).
- The normalized filter section carries `match` and `optionsQuery` (with `valueKey`/`labelKey` intact) — asserted, not assumed.
- No catalog `type: array` check on `match` anywhere in the validator.
- `CI=true pnpm test` shows no regressions in `compileReport` / `querySections` suites (both call this validator).

## Files

- `plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.js` — modify — allowed-key list, `match`, `optionsQuery`, exclusivity, normalized carry-forward, extended options-source check, doc comment.
- `plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.test.js` — modify — the cases above.

## Notes

`compileReport` calls this validator **without** a catalog (inert re-validation — the per-section `AnalyticsPipeline` is the security gate), so the `optionsQuery` pipeline is _not_ re-walked at compile time and the options-source check does not fire there. Keep every new check catalog-independent except the options-source one, which already sits behind `if (catalog …)`.

`validateQuery` throws `Error("Invalid pipeline: …")` directly (already actionable) rather than routing through the `fail` callback for pipeline problems — that is existing behaviour, don't rewrap it.
