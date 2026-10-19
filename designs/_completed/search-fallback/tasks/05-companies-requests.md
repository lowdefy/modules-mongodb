# Task 5: Convert the companies list and Excel requests

## Context

`modules/companies/requests/get_all_companies.yaml` and `modules/companies/requests/get_company_excel_data.yaml` are the companies equivalents of the two contacts requests converted in tasks 2 and 3, and share their shapes exactly:

- `get_all_companies` — `$search` first, `$addFields` (`score` + `display_name`), `$facet` with a term-dependent `$sort`, `$skip`/`$limit`, derived date fields, and `request_stages.get_all_companies` spliced via `_build.array.concat`.
- `get_company_excel_data` — root `_build.array.concat`, no `$facet`, `$sort` directly in the pipeline, `$skip`/`$limit` last.

Both carry the same structural filter — `mustNot: [ exists: { path: deleted.timestamp } ]` — and the consumer `request_stages.filter_match` array.

The wrinkle specific to this module: one searched path is **`{ _module.var: name_field }`**, not a literal string. `name_field` (default `name`) lets a consumer store the company display name under another field. This is harmless for the builder — `_module.var` resolves at build time, so by the time `regex_clause`'s runtime `_array.map` iterates, `paths` is a list of plain strings. It is, however, why a `.yaml.njk` loop could not have built the fan-out: Nunjucks would have to interpolate an operator as text. Both requests also project `display_name` with `$getField` off the same var.

## Task

Apply the task 2 pattern to `modules/companies/requests/get_all_companies.yaml` and the task 3 pattern to `modules/companies/requests/get_company_excel_data.yaml`. For both:

**Text stage** — `_ref` `../shared/search/text_lead.yaml` with:

```yaml
vars:
  atlas_search:
    _module.var: atlas_search
  term:
    _payload: filter.search
  paths:
    - _module.var: name_field
    - lowercase_email
```

**`$match`** — a `$and` whose first group is the unconditional structural clause, then the regex clause, then the consumer hook:

```yaml
- - $match:
      $and:
        _array.concat:
          - - deleted.timestamp:
                $exists: false
          - _ref:
              path: ../shared/search/regex_clause.yaml
              vars:
                atlas_search:
                  _module.var: atlas_search
                term:
                  _payload: filter.search
                paths:
                  - _module.var: name_field
                  - lowercase_email
          - _array.filter:
              - _module.var: request_stages.filter_match
              - _function:
                  __ne:
                    - __args: 0
                    - null
```

`paths` is the **same list** passed to `text_lead`, which is what guarantees the two modes cannot disagree about which field is the company name. The dynamic key the `$or` needs is built inside `regex_clause.yaml` with `_object.defineProperty` — do not build it at the call site, and do not hand-author the `$or` here.

**Score projection** — remove `score: { $meta: searchScore }` from the `$addFields` stage and splice `_ref` `../shared/search/score_stage.yaml` before it. Keep `display_name` (and, in the Excel request, `updated_at`/`created_at`) in the remaining `$addFields`.

**`$sort` gate** — replace the `_if` test with `_ref` `../shared/search/use_score.yaml` (same vars), `then` the score sort, `else` the existing field sort. Same inversion as task 2.

**Pipeline root** — `_build.array.concat` in both files. `get_company_excel_data` already has one and keeps it; `get_all_companies` gains one in place of its literal list. The `$facet` inside `get_all_companies` also keeps its own `_build.array.concat` for the `request_stages.get_all_companies` splice. The only runtime `_array.concat` either file gains is the one inside the `$match`'s `$and`.

## Acceptance Criteria

- Neither file authors a `$search` block; both get their Atlas stage from `text_lead.yaml`.
- `mustNot: exists deleted.timestamp` is now `deleted.timestamp: { $exists: false }` inside the `$match` `$and` in both files.
- Both files search `{ _module.var: name_field }` + `lowercase_email` in Atlas mode **and** in fallback mode — the two modes must not disagree about which field is the company name.
- `display_name` still projects via `$getField` off `name_field`, and the list page's sort/columns are unaffected.
- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.
- Built artifacts for the companies list page confirm: gated `$search` under the default flag; `$or` with the `name` key resolved from the var (the demo leaves `name_field` at its default) and no `$search`/`$meta` when the flag is temporarily flipped to `false`. The resolved key is the check that `regex_clause`'s `_array.map` handled the build-resolved operator path correctly.

## Files

- `modules/companies/requests/get_all_companies.yaml` — modify — filters → `$match` `$and`, text/score/sort via the shared builder.
- `modules/companies/requests/get_company_excel_data.yaml` — modify — same; its existing root `_build.array.concat` is kept.

## Notes

- The two requests must keep an identical `$match` clause set — the export is meant to return exactly the rows the list shows.
- A consumer who overrides `name_field` must also map that field in their `default` search index, or Atlas `$search` silently returns no text matches on it while the regex fallback (which reads the var at query time) still works. Task 8 documents the index requirement and this coupling; task 10 repeats it in the shared concept page.
