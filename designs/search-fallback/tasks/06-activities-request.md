# Task 6: Convert `activities/get_activities`

## Context

`modules/activities/requests/get_activities.yaml` is the heaviest filters-in-`$search` request. Its single `$search.compound.filter.compound` block carries `mustNot: exists deleted.timestamp` plus **seven** conditional structural clauses, each gated on a filter payload:

| Filter payload      | Current Atlas clause                         | Plain `$match` equivalent             |
| ------------------- | -------------------------------------------- | ------------------------------------- |
| `filter.type`       | `equals: { path: type }`                     | `type: <value>`                       |
| `filter.stage`      | `equals: { path: status.stage }`             | `status.stage: <value>`               |
| `filter.contact_id` | `equals: { path: contacts.contact_id }`      | `contacts.contact_id: <value>`        |
| `filter.company_id` | `equals: { path: company_ids }`              | `company_ids: <value>`                |
| `filter.date_from`  | `range: { path: updated.timestamp, gte: … }` | `updated.timestamp: { $gte: <date> }` |
| `filter.date_to`    | `range: { path: updated.timestamp, lte: … }` | `updated.timestamp: { $lte: <date> }` |
| `filter_match`      | consumer compound clauses                    | consumer `$match` clauses             |

Two details matter:

- **This is the request that motivated `$and` over shallow merge.** `date_from` and `date_to` both filter `updated.timestamp`. Merged with `_object.assign` the second entry would clobber the first and one bound would silently vanish. Wrapping the clause list in `$and` makes the collision structurally impossible — each bound is its own clause. (They may also be authored as one nested object, but `$and` is what removes the requirement.)
- **This is the only request missing `returnStoredSource: true`.** The shared `text_lead.yaml` always emits it, so this conversion fixes the inconsistency — which also makes the committed `storedSource: true` search index (task 8) load-bearing for this collection.

The existing comment on the `status.stage` clause ("Atlas Search can't address array elements by position, so filter on `status.stage`…") documents an Atlas constraint that **no longer applies** once the clause is a plain `$match`: MongoDB could address `status.0.stage`. Do not change the queried path — matching any history entry is the current behaviour and changing it is out of scope — but the comment's stated reason is now wrong, so rewrite it to state the actual intent (match any status-history entry, not just the current one).

The tail is a `$facet` with the usual term-dependent `$sort`, `$skip`/`$limit`, three `_ref`'d derived-field stages (`add_derived_fields`, `lookup_contacts`, `lookup_companies`), and `request_stages.get_all_activities` spliced via `_build.array.concat`.

## Task

Rewrite `properties.pipeline` in `modules/activities/requests/get_activities.yaml` as a runtime `_array.concat`:

1. `_ref` `../shared/search/text_lead.yaml` with `term: { _payload: filter.search }` and:
   ```yaml
   paths:
     - title
     # `description` is Tiptap rich text stored as { html, text }; search the
     # plain-text subpath, not the html markup.
     - description.text
   ```
2. The `$match`, whose `$and` is a runtime `_array.concat` of: the unconditional `deleted.timestamp: { $exists: false }`; each of the six conditional clauses, keeping its existing `_if` test verbatim and returning `[clause]` / `[]`; the shared `regex_clause` ref (fan-out over `title` and `description.text`); and the `filter_match` `_array.filter` null-drop. For example:
   ```yaml
   - _if:
       test:
         _ne:
           - _payload: filter.type
           - null
       then:
         - type:
             _payload: filter.type
       else: []
   ```
   and for the date bounds:
   ```yaml
   - _if:
       test:
         _ne:
           - _payload: filter.date_from
           - null
       then:
         - updated.timestamp:
             $gte:
               _date:
                 _if_none:
                   - _payload: filter.date_from
                   - 0
       else: []
   ```
3. `_ref` `../shared/search/score_addfields.yaml` — replacing the standalone `$addFields: { score: { $meta: searchScore } }` stage.
4. The literal group holding the unchanged `$facet` (with its `_build.array.concat`, the three `_ref`'d stages, `$skip`/`$limit`, and the `request_stages.get_all_activities` splice) and the `$unwind`/`$addFields`/`$replaceRoot` tail — with the `$sort` `_if` test replaced by `_ref` `../shared/search/use_score.yaml`, `then` the score sort, `else` the existing field sort.

## Acceptance Criteria

- No `$search` block is authored in this file; the Atlas stage comes from `text_lead.yaml` and therefore now carries `returnStoredSource: true`.
- All seven structural clauses (six filters + `filter_match`) are plain `$match` clauses inside a `$and`, each still gated on its original `_if` test.
- Setting both `date_from` and `date_to` produces two separate `updated.timestamp` clauses in the `$and` — neither bound is lost. Verify on the built artifact or with a `lowdefy_run_request` read against a dev database.
- The `status.stage` comment states the intent (any history entry), not the withdrawn Atlas constraint.
- `pnpm --filter @lowdefy/modules-mongodb-demo ldf:b` succeeds.
- Built artifact for the activities list page shows the gated `$search` with `returnStoredSource: true` under the default flag, and the `$or` regex clause with no `$search`/`$meta` when the flag is temporarily flipped to `false`.
- The activities list page's type/stage/contact/company/date filters still narrow results as before on an Atlas deployment (or, if only local MongoDB is available, in fallback mode — the filter path is mode-independent by design).

## Files

- `modules/activities/requests/get_activities.yaml` — modify — filters → `$match` `$and`, text/score/sort via the shared builder, `returnStoredSource` gained.

## Notes

- `modules/activities/requests/get_activities_excel_data.yaml` uses `_build.array.concat` at its pipeline root but has no `$search` — it is not part of this design. Leave it alone.
- The `$facet` keeps `_build.array.concat`: `request_stages.get_all_activities` and the three `_ref`'d stages are build-time literals. Only the outer pipeline assembly must be the runtime concat.
- `_date` wrappers on the range bounds stay exactly as authored — the `$gte`/`$lte` values must remain real dates, not strings.
