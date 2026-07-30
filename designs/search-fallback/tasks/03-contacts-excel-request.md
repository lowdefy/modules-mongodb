# Task 3: Convert `contacts/get_contact_excel_data`

## Context

Task 2 created the shared builder under `modules/shared/search/` and converted `get_all_contacts`. This task applies the same pattern to the contacts Excel export, which searches the same collection (`user-contacts`) and the same paths (`profile.name`, `lowercase_email`) but has a different pipeline shape:

- `properties.pipeline` is already a `_build.array.concat` at the root, splicing `request_stages.get_all_contacts` between the query stages and `$skip`/`$limit`.
- There is **no `$facet`** — the `$sort` sits directly in the pipeline, and `$skip`/`$limit` come from `fetch_request_pagination` state (with `~ignoreBuildChecks: true` on the payload).
- Its `$addFields` combines the `score` projection with the `updated_at`/`created_at` derived fields in one stage.

The root `_build.array.concat` is the problem: the builder's `text_lead` and `score_addfields` return **runtime**-gated arrays, and a build-time concat cannot flatten an unresolved operator. The root must become a runtime `_array.concat`.

## Task

Rewrite `modules/contacts/requests/get_contact_excel_data.yaml`'s `properties.pipeline` as a runtime `_array.concat`, keeping `id`, `type`, `connectionId`, and `payload` (including the `~ignoreBuildChecks` marker) untouched. Target shape:

1. `_ref` `../shared/search/text_lead.yaml` with `atlas_search: { _module.var: atlas_search }`, `term: { _payload: filter.search }`, `paths: [profile.name, lowercase_email]`.
2. A literal group holding the `$match`:
   ```yaml
   - - $match:
         $and:
           _array.concat:
             - - hidden:
                   $ne: true
                 disabled:
                   $ne: true
             - _ref:
                 path: ../shared/search/regex_clause.yaml
                 vars:
                   atlas_search:
                     _module.var: atlas_search
                   term:
                     _payload: filter.search
                   or:
                     - profile.name:
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
   Use the exact same `or` fan-out and clause set as `get_all_contacts` — the two requests must agree on what "a visible contact matching the search" means.
3. `_ref` `../shared/search/score_addfields.yaml` (same vars) — the `score` projection moves **out** of the combined `$addFields` and into the shared gated stage.
4. A literal group with the remaining `$addFields` (`updated_at`, `created_at` only) followed by the `$sort`, whose `_if` test becomes the shared `use_score` ref:
   ```yaml
   - _if:
       test:
         _ref:
           path: ../shared/search/use_score.yaml
           vars:
             atlas_search:
               _module.var: atlas_search
             term:
               _payload: filter.search
       then:
         $sort:
           score: -1
           updated.timestamp: -1
       else:
         $sort:
           _object.assign:
             - _object.defineProperty:
                 on: {}
                 key:
                   _payload: sort.by
                 descriptor:
                   value:
                     _payload: sort.order
             - _id: 1
   ```
5. `- _module.var: request_stages.get_all_contacts` — the consumer splice point, in the same position it occupies today (after the query/sort stages, before pagination). A runtime `_array.concat` splices a build-resolved literal array without trouble.
6. A literal group with `$skip` and `$limit`, unchanged.

## Acceptance Criteria

- `properties.pipeline` is a runtime `_array.concat`; no `_build.array.concat` remains at the pipeline root.
- No `$search` block is authored in this file; the Atlas stage comes only from `text_lead.yaml`.
- The `$match` `$and` clause set is identical to `get_all_contacts`'s.
- `request_stages.get_all_contacts` still splices in its original position, and `$skip`/`$limit` remain last.
- `pnpm --filter @lowdefy/modules-mongodb-demo ldf:b` succeeds.
- Built artifact for the contacts list page's excel request shows the gated `$search` (flag default `true`) and, with the flag temporarily flipped to `false`, the `$or` regex clause with no `$search` and no `$meta: searchScore`.

## Files

- `modules/contacts/requests/get_contact_excel_data.yaml` — modify — runtime concat root, filters → `$match` `$and`, text + score + sort gate via the shared builder.

## Notes

- The export must return the same rows the list page shows, so any divergence between this file's `$match` and `get_all_contacts`'s is a bug, not a style choice.
- Excel exports run with a large page size; in fallback mode this is an unindexed scan over the matching set. That cost is documented in `docs/shared/search.md` (task 10), not mitigated here.
