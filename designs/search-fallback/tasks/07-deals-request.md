# Task 7: Add the fallback toggle to `deals/get_deals_list`

## Context

`deals` was added to this design's scope at task time: the module landed after the design was written, and `modules/deals/requests/get_deals_list.yaml` leads with `$search`, so the demo's deal list hard-fails on local MongoDB — the design's stated goal (a demo that works end-to-end on community MongoDB) is unmet without it.

Like `search_contacts`, this request is **already split**: its filters live in a separate `$match` whose body is already a `$and` built with `_array.concat`, followed by a company `$lookup` and a `$facet`. Three things still need doing:

1. **Stage 1 toggles.** Today it is a runtime `_if` that swaps in `$match: {}` when there is no term and a hand-authored `$search` otherwise. **That shape is the one the shared builder generalises** — design decision 2 adopted it after this file demonstrated it works (`get_deals_list.yaml:16-25` is cited as the precedent). So the `_if` and its `$match: {}` branch are not removed; they move into `text_lead.yaml` and this file gets them via `_ref`. What changes here is that the `$search` becomes builder-generated, and the whole slot now also disappears at compile when `atlas_search` is `false`.
2. **The regex clause** joins the existing `$and`.
3. **The score sort.** The `$facet.results` `$sort` reads `score: -1, updated.timestamp: -1` unconditionally, relying on the missing `score` field sorting as null when there is no term. That accident does not survive the fallback (there is no `score` at all), so it must be gated properly.

**The Atlas-specific wrinkle.** This request's `should` clauses are not the generic text+wildcard pair. It searches:

- `wildcard` on `_id` with `path: { value: _id, multi: keywordAnalyzer }`, `score: { boost: { value: 3 } }`, `allowAnalyzedField: true` — the deal code, boosted so an exact-code match wins, and deliberately **not** lowercased.
- `text` on `name`.
- `wildcard *term*` on `name` with `allowAnalyzedField: true`.

The `name` pair is what `text_lead.yaml` generates from `paths: [name]` — with one deliberate behaviour change: the builder lowercases the term (`_string.toLowerCase`), which this request does not do today. That is intended (design decision 2's `should_extra` note): five of the seven requests already lowercase, and it is what makes the `wildcard` clause match analyzed lowercase text. The `_id` clause is caller-specific and must **not** be lowercased, so it is passed verbatim through the builder's `should_extra` var — the gating stays shared, the quirk stays with its caller. In fallback mode both `_id` and `name` are searched by regex, so searching by deal code keeps working (`$options: i` handles case).

## Task

In `modules/deals/requests/get_deals_list.yaml`:

**1. Replace stage 1.** Make `properties.pipeline` a `_build.array.concat` whose first element is:

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

The `index: default` option on the current `$search` is dropped — `default` is what Atlas uses when no `index` is given, and the shared builder specifies none.

**Pass `returnStoredSource: false`.** This request does not set the flag today and must not gain it: the deals list is refetched after every deal write, and `mongot`'s stored copy lags index replication, so a stored-source row can come back showing pre-edit values whenever a search term is active. This matches `activities` (task 6), where the same exposure was fixed deliberately in PR #68. Consequence: the deals search index (task 8) omits `storedSource`, since no query here reads the stored copy. Comment the call-site var with that reason.

**2. Add the regex clause to the existing `$match` `$and`.** Append one more entry to its `_array.concat`, leaving the `removed: null` clause and the six existing filter `_if`s untouched:

```yaml
- _ref:
    path: ../shared/search/regex_clause.yaml
    vars:
      atlas_search:
        _module.var: atlas_search
      term:
        _payload: filter.search
      paths:
        - _id
        - name
```

Note `paths` here is **not** the same list passed to `text_lead` (`[name]`): in fallback mode the deal code has to be searched by regex too, since there is no `keywordAnalyzer` clause to carry it. This is the one caller where the two lists legitimately differ, and it is why searching by deal code keeps working on a plain `mongod`.

**3. Gate the score projection and sort.** Inside `$facet.results`, the current `_array.concat` starts with an `_if` that adds `$addFields: { score: { $meta: searchScore } }` when a term is present. Replace it with `_ref` `../shared/search/score_stage.yaml` (vars: `atlas_search`, `term`), and split the unconditional `$sort` into a gated pair:

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

**4. Update the stage comments.** The comment above stage 1 ("Full-text search (must be the first stage). When no search term is entered, swap in a no-op `$match`…") still describes the runtime behaviour correctly, but that behaviour now lives in the builder rather than here. Trim it to what a reader of _this_ file needs — that stage 1 is the shared text lead, and that company name is not stored on the deal document so it stays a `$match` filter rather than a search field. Do not narrate the move.

## Acceptance Criteria

- Neither the `$search` block nor the no-op `$match: {}` is authored **in this file** any more; stage 1 comes only from `text_lead.yaml`, which supplies both branches.
- The `_id` keyword-analyzer wildcard clause is preserved verbatim (boost 3, `multi: keywordAnalyzer`, no lowercasing) via `should_extra`.
- The `$match` `$and` gains the regex clause and keeps `removed: null` plus all six filter `_if`s unchanged.
- The `$facet` `$sort` uses `score` only when `atlas_search && term`; with no term, or in fallback mode, it sorts by `updated.timestamp: -1`.
- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.
- Built artifact for the deals list page shows the gated `$search` with both the generic `name` clauses and the `_id` clause under the default flag; with the flag temporarily flipped to `false` it shows no `$search`, no `$meta: searchScore`, no no-op stage slots, a `$or` over `_id` and `name`, and the `$sort` test collapsed to the literal `false`.
- Searching a deal code and searching a deal name both still return the expected row in Atlas mode, and in fallback mode against a local MongoDB.

## Files

- `modules/deals/requests/get_deals_list.yaml` — modify — stage 1 via the shared builder with `should_extra`, regex clause in the `$and`, score projection and sort gated, stage comments rewritten.

## Notes

- `deals` declares no `request_stages.filter_match`, only `request_stages.get_deals_list` (a stage splice, kept as-is at the end of `$facet.results`). Do not add a filter hook — no concrete consumer has asked for one.
- `modules/deals/requests/get_active_deals.yaml` and the other deals requests do not use `$search` and are out of scope.
- Task 1 adds the `atlas_search` var to the deals manifest; this task depends on that as well as on task 2's builder.
