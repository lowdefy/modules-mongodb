# Task 7: Add the fallback toggle to `deals/get_deals_list`

## Context

`deals` was added to this design's scope at task time: the module landed after the design was written, and `modules/deals/requests/get_deals_list.yaml` leads with `$search`, so the demo's deal list hard-fails on local MongoDB — the design's stated goal (a demo that works end-to-end on community MongoDB) is unmet without it.

Like `search_contacts`, this request is **already split**: its filters live in a separate `$match` whose body is already a `$and` built with `_array.concat`, followed by a company `$lookup` and a `$facet`. Three things still need doing:

1. **Stage 1 toggles.** Today it is a runtime `_if` that swaps in `$match: {}` when there is no term and a hand-authored `$search` otherwise. Both branches must go through the shared builder: no `$search` under `atlas_search: false`, and no no-op `$match` stage either (the builder returns `[]`).
2. **The regex clause** joins the existing `$and`.
3. **The score sort.** The `$facet.results` `$sort` reads `score: -1, updated.timestamp: -1` unconditionally, relying on the missing `score` field sorting as null when there is no term. That accident does not survive the fallback (there is no `score` at all), so it must be gated properly.

**The Atlas-specific wrinkle.** This request's `should` clauses are not the generic text+wildcard pair. It searches:

- `wildcard` on `_id` with `path: { value: _id, multi: keywordAnalyzer }`, `score: { boost: { value: 3 } }`, `allowAnalyzedField: true` — the deal code, boosted so an exact-code match wins, and deliberately **not** lowercased.
- `text` on `name`.
- `wildcard *term*` on `name` with `allowAnalyzedField: true`.

The `name` pair is exactly what `text_lead.yaml` generates from `paths: [name]`. The `_id` clause is caller-specific, so it is passed verbatim through the builder's `should_extra` var — the gating stays shared, the quirk stays with its caller. In fallback mode both `_id` and `name` are searched by regex, so searching by deal code keeps working (`$options: i` handles case).

## Task

In `modules/deals/requests/get_deals_list.yaml`:

**1. Replace stage 1.** Make `properties.pipeline` a runtime `_array.concat` whose first element is:

```yaml
- _ref:
    path: ../shared/search/text_lead.yaml
    vars:
      atlas_search:
        _module.var: atlas_search
      term:
        _payload: filter.search
      paths:
        - name
      should_extra:
        # Deal code — keyword-analyzed and boosted so an exact code match
        # outranks a name match. Not lowercased: codes are stored uppercase.
        - wildcard:
            query:
              _string.concat:
                - "*"
                - _payload: filter.search
                - "*"
            path:
              value: _id
              multi: keywordAnalyzer
            score:
              boost:
                value: 3
            allowAnalyzedField: true
```

The `index: default` option on the current `$search` is dropped — `default` is what Atlas uses when no `index` is given, and the shared builder specifies none. Note the builder also adds `returnStoredSource: true`, which this request does not set today; that makes `storedSource: true` on the deals search index (task 8) load-bearing.

**2. Add the regex clause to the existing `$match` `$and`.** Append one more entry to its `_array.concat`, leaving the `removed: null` clause and the six existing filter `_if`s untouched:

```yaml
- _ref:
    path: ../shared/search/regex_clause.yaml
    vars:
      atlas_search:
        _module.var: atlas_search
      term:
        _payload: filter.search
      or:
        - _id:
            _ref:
              path: ../shared/search/regex_value.yaml
              vars:
                term:
                  _payload: filter.search
        - name:
            _ref:
              path: ../shared/search/regex_value.yaml
              vars:
                term:
                  _payload: filter.search
```

**3. Gate the score projection and sort.** Inside `$facet.results`, the current `_array.concat` starts with an `_if` that adds `$addFields: { score: { $meta: searchScore } }` when a term is present. Replace it with `_ref` `../shared/search/score_addfields.yaml` (vars: `atlas_search`, `term`), and split the unconditional `$sort` into a gated pair:

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
        updated.timestamp: -1
```

The `else` branch is this request's existing effective ordering when no term is set (most-recently-updated first) — this request has no `sort.by`/`sort.order` payload, so there is no field-sort selector to honour.

**4. Update the stage comments.** The comment above stage 1 ("Full-text search (must be the first stage). When no search term is entered, swap in a no-op `$match`…") describes a mechanism that is gone. Rewrite it to describe what the stage now is; keep the useful part — that company name is not stored on the deal document, so it stays a `$match` filter rather than a search field.

## Acceptance Criteria

- No `$search` block and no no-op `$match: {}` stage are authored in this file; stage 1 comes only from `text_lead.yaml`.
- The `_id` keyword-analyzer wildcard clause is preserved verbatim (boost 3, `multi: keywordAnalyzer`, no lowercasing) via `should_extra`.
- The `$match` `$and` gains the regex clause and keeps `removed: null` plus all six filter `_if`s unchanged.
- The `$facet` `$sort` uses `score` only when `atlas_search && term`; with no term, or in fallback mode, it sorts by `updated.timestamp: -1`.
- `pnpm --filter @lowdefy/modules-mongodb-demo ldf:b` succeeds.
- Built artifact for the deals list page shows the gated `$search` with both the generic `name` clauses and the `_id` clause under the default flag; with the flag temporarily flipped to `false` it shows no `$search`, no `$meta: searchScore`, a `$or` over `_id` and `name`, and the `$sort` test collapsed to the literal `false`.
- Searching a deal code and searching a deal name both still return the expected row in Atlas mode, and in fallback mode against a local MongoDB.

## Files

- `modules/deals/requests/get_deals_list.yaml` — modify — stage 1 via the shared builder with `should_extra`, regex clause in the `$and`, score projection and sort gated, stage comments rewritten.

## Notes

- `deals` declares no `request_stages.filter_match`, only `request_stages.get_deals_list` (a stage splice, kept as-is at the end of `$facet.results`). Do not add a filter hook — no concrete consumer has asked for one.
- `modules/deals/requests/get_active_deals.yaml` and the other deals requests do not use `$search` and are out of scope.
- Task 1 adds the `atlas_search` var to the deals manifest; this task depends on that as well as on task 2's builder.
