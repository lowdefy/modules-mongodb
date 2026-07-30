# Task 2: Shared search builder + convert `contacts/get_all_contacts`

## Context

`modules/contacts/requests/get_all_contacts.yaml` is the canonical filters-in-`$search` request: a single `$search.compound` block whose `filter.compound` mixes free-text ranking (`text` + `wildcard *term*` over `profile.name`, `lowercase_email`) with structural filters (`mustNot` on `hidden`/`disabled`, plus the consumer `request_stages.filter_match` array), followed by `$addFields: score`, a `$facet` with a term-dependent `$sort`, `$skip`/`$limit`, and derived date fields.

This task creates the shared builder that all seven searchable requests will use, and converts this request as its first caller — so the whole pattern is build-verified before it is applied five more times.

**The two gating dimensions.** `atlas_search` is a module var, i.e. a build-time literal: when it is `false`, the Atlas mechanism must vanish at compile via `_build.if`. The search term (`_payload: filter.search`) is runtime-only: "skip `$search` when there is no term" must appear/disappear via a runtime `_if` returning `[]` or `[stage]`. A runtime-gated stage therefore **cannot** be spliced by an outer `_build.array.concat` — the build pass would try to flatten an unresolved operator. So the outer pipeline assembly becomes a **runtime** `_array.concat`.

Both of those mechanisms are verified against this project's Lowdefy build, not assumed:

- A runtime `_array.concat` at `properties.pipeline` builds successfully, and a runtime `_if` returning `[]` / `[stage]` survives into the built request artifact unevaluated (checked in `apps/demo/.lowdefy/server/build/pages/contacts/all/requests/get_all_contacts.json`).
- `_build.if` with a `_var`-supplied test wrapping a runtime `_if` in its branches is the shape `modules/contacts/requests/search_contacts.yaml:61` already uses.
- `_string.replace` is `String.prototype.replace`, is available server-side (where request properties evaluate), and the escape expression below was verified to escape metacharacters and neuter them.

**Emergent property to preserve:** when there is no term, `$search` is skipped entirely, so the browse/filter/paginate path is `$match` + `$sort` on both Atlas and local MongoDB — identical behaviour in both modes. Only an actual text query diverges.

## Task

### 1. Create the shared builder — `modules/shared/search/`

Five files, one per splice point, each ref'd independently with `_ref: { path: ../shared/search/<file>.yaml, vars: {...} }` (the relative-path idiom already used for `../shared/profile/*`). Do **not** try to expose them as keys of one file — a `_ref` combining `path` + `key` + `vars` has no precedent in this repo.

Every piece that lands in a pipeline or `$and` position returns an **array** (`[]` or `[clause]`), so a gated-off piece disappears through `_array.concat` instead of leaving an empty object behind.

**`modules/shared/search/text_lead.yaml`** — the Atlas text stage. Vars: `atlas_search`, `term`, `paths`, `should_extra` (default `[]`), `returnStoredSource` (default `true`).

```yaml
# Atlas $search text stage — the only Atlas-only stage in the searchable
# requests. Text ranking only: structural filters live in the $match that
# follows, so they run in both search modes.
#
# Two gates compose here. `atlas_search` is a module var, so a false flag drops
# the whole mechanism at compile. `term` is runtime, so the stage is spliced in
# or out per request by a runtime _if returning [] or [stage] — which is why
# callers must assemble the pipeline with a runtime _array.concat, never
# _build.array.concat.
#
# returnStoredSource defaults to true: mongot returns the matched documents
# itself, so the $match below costs mongod no collection access. Callers whose
# list is refetched straight after a write pass false — mongot's copy lags index
# replication, so a stored-source row can show pre-edit values.
_build.if:
  test:
    _var: atlas_search
  then:
    _if:
      test:
        _ne:
          - _if_none:
              - _var: term
              - ""
          - ""
      then:
        - $search:
            returnStoredSource:
              _var:
                key: returnStoredSource
                default: true
            compound:
              should:
                _array.concat:
                  - - text:
                        query:
                          _string.toLowerCase:
                            _var: term
                        path:
                          _var: paths
                    - wildcard:
                        query:
                          _string.concat:
                            - "*"
                            - _string.toLowerCase:
                                _var: term
                            - "*"
                        path:
                          _var: paths
                        allowAnalyzedField: true
                  - _var:
                      key: should_extra
                      default: []
      else: []
  else: []
```

**`modules/shared/search/regex_value.yaml`** — the escaped-regex value. Var: `term`. This is the only place user input is escaped.

```yaml
# Case-insensitive substring match value for the fallback path. The term is
# regex-escaped so metacharacters can't alter the query or be injected; $& puts
# the matched metacharacter back after the added backslash. Single-quoted YAML
# keeps both patterns literal.
$regex:
  _string.replace:
    on:
      _var: term
    regex: '[.*+?^${}()|[\]\\/]'
    newSubstr: '\$&'
    regexFlags: g
$options: i
```

**`modules/shared/search/regex_clause.yaml`** — the gated fallback clause. Vars: `atlas_search`, `term`, `or`.

```yaml
# Fallback text clause, ANDed into the request's $match. Mirror image of
# text_lead: emitted only when atlas_search is false (build) and a term is
# present (runtime). Callers pass `or` — the per-field fan-out — because the
# path list is build-time-known per request and one caller's path is itself an
# operator (companies' name_field); each clause gets its value from
# regex_value.yaml, so escaping stays single-source.
_build.if:
  test:
    _var: atlas_search
  then: []
  else:
    _if:
      test:
        _ne:
          - _if_none:
              - _var: term
              - ""
          - ""
      then:
        - $or:
            _var: or
      else: []
```

**`modules/shared/search/score_addfields.yaml`** — vars: `atlas_search`, `term`.

```yaml
# searchScore projection — only meaningful when a $search stage actually ran.
_build.if:
  test:
    _var: atlas_search
  then:
    _if:
      test:
        _ne:
          - _if_none:
              - _var: term
              - ""
          - ""
      then:
        - $addFields:
            score:
              $meta: searchScore
      else: []
  else: []
```

**`modules/shared/search/use_score.yaml`** — the `$sort` gate. Vars: `atlas_search`, `term`. Returns a test expression, not a stage.

```yaml
# `$sort` gate: relevance ordering exists only on the Atlas path with a term.
# Build-collapses to a literal false when atlas_search is false, so the score
# sort is unreachable in fallback mode.
_build.if:
  test:
    _var: atlas_search
  then:
    _ne:
      - _if_none:
          - _var: term
          - ""
      - ""
  else: false
```

### 2. Convert `modules/contacts/requests/get_all_contacts.yaml`

Keep `id`, `type`, `connectionId`, and `payload` unchanged. Replace `properties.pipeline` with a runtime `_array.concat` of four groups:

```yaml
properties:
  pipeline:
    _array.concat:
      - _ref:
          path: ../shared/search/text_lead.yaml
          vars:
            atlas_search:
              _module.var: atlas_search
            term:
              _payload: filter.search
            paths:
              - profile.name
              - lowercase_email
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
      - _ref:
          path: ../shared/search/score_addfields.yaml
          vars:
            atlas_search:
              _module.var: atlas_search
            term:
              _payload: filter.search
      - - $facet: # unchanged except for the $sort test below
        # ...
```

Then in the `$facet.results` array, invert the existing `$sort` `_if`: it currently tests "no term → field sort, else score sort". It must now test the shared `use_score` gate:

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

Everything else inside the `$facet` — the `_build.array.concat` splicing `request_stages.get_all_contacts`, `$skip`, `$limit`, the `updated_at`/`created_at` `$addFields` — stays as it is. The `$facet` keeps `_build.array.concat` because `request_stages.*` is a build-time literal; only the **outer** pipeline assembly must be the runtime concat.

The `$unwind`/`$addFields`/`$replaceRoot` tail is unchanged and belongs in the same literal group as the `$facet`.

**Filter equivalence.** The old `mustNot: [equals hidden true, equals disabled true]` becomes `hidden: { $ne: true }` / `disabled: { $ne: true }` — the same semantics (missing field passes), and the same form `search_contacts.yaml` already uses.

## Acceptance Criteria

- `modules/shared/search/` contains the five files above; the escape pattern appears in `regex_value.yaml` and nowhere else.
- `modules/contacts/requests/get_all_contacts.yaml` has no `$search` clause of its own — its Atlas stage comes only from `text_lead.yaml` — and its structural filters are a `$match` `$and`.
- `pnpm --filter @lowdefy/modules-mongodb-demo ldf:b` succeeds.
- With the demo left at the default (`atlas_search` unset → `true`), the built artifact `apps/demo/.lowdefy/server/build/pages/contacts/all/requests/get_all_contacts.json` shows: an outer `_array.concat`; a `_if`-gated `$search` with `returnStoredSource: true` and text/wildcard `should` clauses only (no `filter`/`mustNot`); a `$match` with `$and`; no `$or` regex clause anywhere (the build gate dropped it); and the `$sort` `_if` test resolved to a runtime `_ne` on the payload.
- Temporarily setting `atlas_search: false` in `apps/demo/modules/contacts/vars.yaml` and rebuilding shows the inverse: **no** `$search` and **no** `$meta: searchScore` anywhere in that artifact, a `$or` of two `$regex` clauses inside the `$match` `$and`, and the `$sort` test collapsed to the literal `false`. Revert the var afterwards — task 9 owns the demo wiring.

## Files

- `modules/shared/search/text_lead.yaml` — create.
- `modules/shared/search/regex_value.yaml` — create.
- `modules/shared/search/regex_clause.yaml` — create.
- `modules/shared/search/score_addfields.yaml` — create.
- `modules/shared/search/use_score.yaml` — create.
- `modules/contacts/requests/get_all_contacts.yaml` — modify — filters → `$match` `$and`, text via the builder, score sort gated.

## Notes

- `apps/demo/lowdefy.yaml` already watches `../../modules/shared` under `cli.watch`, so the new directory is picked up by the dev server without config changes.
- The `$and` array can never be empty here — `hidden`/`disabled` are unconditional — so MongoDB's rejection of `$and: []` cannot arise. Keep at least one unconditional structural clause in the first group when applying this pattern elsewhere.
- **The gates test against `""`, not `null`, in all four files — do not "simplify" them.** Three cases have to read as "no term": absent (`filter.search` before the filter block is touched), `null`, and the **empty string** a cleared input leaves behind. `_if_none` normalises the first two to `""` and the `_ne` then rejects all three in one test. Testing `null` instead would let `""` through into `$search` with `text: { query: "" }`, which Atlas rejects, and in fallback mode into `{ $regex: "", $options: i }`, which matches every document.
- Comments in the builder files should state the constraint (build vs runtime gating, why the outer concat must be runtime), not the history of this task.
