# Task 5: Convert the companies list and Excel requests

## Context

`modules/companies/requests/get_all_companies.yaml` and `modules/companies/requests/get_company_excel_data.yaml` are the companies equivalents of the two contacts requests converted in tasks 2 and 3, and share their shapes exactly:

- `get_all_companies` — `$search` first, `$addFields` (`score` + `display_name`), `$facet` with a term-dependent `$sort`, `$skip`/`$limit`, derived date fields, and `request_stages.get_all_companies` spliced via `_build.array.concat`.
- `get_company_excel_data` — root `_build.array.concat`, no `$facet`, `$sort` directly in the pipeline, `$skip`/`$limit` last.

Both carry the same structural filter — `mustNot: [ exists: { path: deleted.timestamp } ]` — and the consumer `request_stages.filter_match` array.

The wrinkle specific to this module: one searched path is **`{ _module.var: name_field }`**, not a literal string. `name_field` (default `name`) lets a consumer store the company display name under another field. The path is an operator in an operator position, which the Atlas `path` array and the regex fan-out both accept — but it is the reason the shared builder's regex fan-out is authored per request rather than generated from a `paths` list by a template. Both requests also project `display_name` with `$getField` off the same var.

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
                or:
                  - _object.defineProperty:
                      on: {}
                      key:
                        _module.var: name_field
                      descriptor:
                        value:
                          _ref:
                            path: ../shared/search/regex_value.yaml
                            vars:
                              term:
                                _payload: filter.search
                  - lowercase_email:
                      _ref:
                        path: ../shared/search/regex_value.yaml
                        vars:
                          term:
                            _payload: filter.search
          - _array.filter:
              - _module.var: request_stages.filter_match
              - _function:
                  __ne:
                    - __args: 0
                    - null
```

The first `or` entry needs a **dynamic key**, since `name_field` is a var, not a literal. `_object.defineProperty` is the idiom this repo already uses for exactly that (see the `$sort` construction in these same files), and it is the _only_ option here: Lowdefy resolves operators in value positions, and a YAML mapping key is a scalar string, so `{ _module.var: name_field }` cannot stand as a key. (Nunjucks interpolation is the one way to build a key from a var, and the design rules it out for this module for the same reason — the path is an operator, not a literal string. See the shared-builder section's "Why the regex fan-out is split across two files.") Do not look for a plainer form.

**Score projection** — remove `score: { $meta: searchScore }` from the `$addFields` stage and splice `_ref` `../shared/search/score_addfields.yaml` before it. Keep `display_name` (and, in the Excel request, `updated_at`/`created_at`) in the remaining `$addFields`.

**`$sort` gate** — replace the `_if` test with `_ref` `../shared/search/use_score.yaml` (same vars), `then` the score sort, `else` the existing field sort. Same inversion as task 2.

**Pipeline root** — runtime `_array.concat` in both files. `get_company_excel_data`'s root `_build.array.concat` must go; the `$facet` inside `get_all_companies` keeps its `_build.array.concat` for the `request_stages.get_all_companies` splice.

## Acceptance Criteria

- Neither file authors a `$search` block; both get their Atlas stage from `text_lead.yaml`.
- `mustNot: exists deleted.timestamp` is now `deleted.timestamp: { $exists: false }` inside the `$match` `$and` in both files.
- Both files search `{ _module.var: name_field }` + `lowercase_email` in Atlas mode **and** in fallback mode — the two modes must not disagree about which field is the company name.
- `display_name` still projects via `$getField` off `name_field`, and the list page's sort/columns are unaffected.
- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.
- Built artifacts for the companies list page confirm: gated `$search` under the default flag; `$or` with the `name` key resolved from the var (the demo leaves `name_field` at its default) and no `$search`/`$meta` when the flag is temporarily flipped to `false`.

## Files

- `modules/companies/requests/get_all_companies.yaml` — modify — filters → `$match` `$and`, text/score/sort via the shared builder.
- `modules/companies/requests/get_company_excel_data.yaml` — modify — same, plus runtime concat at the pipeline root.

## Notes

- The two requests must keep an identical `$match` clause set — the export is meant to return exactly the rows the list shows.
- A consumer who overrides `name_field` must also map that field in their `default` search index, or Atlas `$search` silently returns no text matches on it while the regex fallback (which reads the var at query time) still works. Task 8 documents the index requirement and this coupling; task 10 repeats it in the shared concept page.
