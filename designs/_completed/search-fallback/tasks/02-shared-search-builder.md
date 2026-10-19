# Task 2: Shared search builder + convert `contacts/get_all_contacts`

## Context

`modules/contacts/requests/get_all_contacts.yaml` is the canonical filters-in-`$search` request: a single `$search.compound` block whose `filter.compound` mixes free-text ranking (`text` + `wildcard *term*` over `profile.name`, `lowercase_email`) with structural filters (`mustNot` on `hidden`/`disabled`, plus the consumer `request_stages.filter_match` array), followed by `$addFields: score`, a `$facet` with a term-dependent `$sort`, `$skip`/`$limit`, and derived date fields.

This task creates the shared builder that all seven searchable requests will use, and converts this request as its first caller — so the whole pattern is build-verified before it is applied five more times.

**The two gating dimensions.** `atlas_search` is a module var, i.e. a build-time literal: when it is `false`, the Atlas mechanism must vanish at compile via `_build.if`. The search term (`_payload: filter.search`) is runtime-only, so "skip `$search` when there is no term" has to be decided at runtime.

**The pipeline root stays a `_build.array.concat`** (design decision 2). Each gated piece is a `_build.if` on `atlas_search` returning `[]` or a **one-element array holding a runtime `_if`**, and that runtime `_if` resolves to either a real stage or a **no-op stage** — `$match: {}` for the text lead, `$addFields: {}` for the score projection. That avoids runtime flattening entirely: nothing the build pass has to splice depends on a runtime value.

What genuinely cannot work is a runtime-gated piece that must be *flattened* by an outer `_build.array.concat` — returning `[]` or `[stage]` for the build pass to splice. A runtime `_if` sitting as a single **element** inside a build-time array is fine, which is what the no-op form relies on.

All of this is verified, not assumed:

- **A runtime `_if` element survives inside a `_build.array.concat` root** — `modules/contacts/requests/get_contact_excel_data.yaml:74` already does exactly this, a runtime `_if` returning a `$sort` stage object inside a build-time concat.
- **The no-op stages are valid MongoDB.** Probed on mongod 7.0.39: `$match: {}` and `$addFields: {}` both parse and run. `$and: []` is the only construct in this design MongoDB rejects (`BadValue: $and/$or/$nor must be a nonempty array`); `$and: [{}]` and `$and: [{a:1},{}]` are accepted.
- **`deals/get_deals_list.yaml:16-25` already ships this shape in production** — a runtime `_if` selecting between `$search` and `$match: {}`. The builder generalises an existing repo pattern rather than introducing one.
- **`_module.var` resolves before `_build.*` sees the test**, which is what callers rely on when they pass `atlas_search: { _module.var: atlas_search }`: `modules/user-admin/api/reinstate.yaml:10-14` (`_build.not: { _module.var: suspension }` inside a `_build.if` test) and `modules/contacts/components/contact-selector.yaml.njk:213` (`_build.if` on `{ _module.var: use_verified }`). Note `search_contacts.yaml:61` does **not** show this — its test is a plain `_var` the caller substitutes with a literal boolean.
- **`_string.replace` is `String.prototype.replace`** and is available server-side, where request properties evaluate. The escape expression below was verified in node: `jo.h*n (a)+b[c]\d/e^$|{2}?` escapes to a pattern that matches the input literally and no longer matches `joXhnn`, where the unescaped term throws on compile.
- **`_function` prefix scoping is a documented contract.** A single-underscore operator in a `_function` body evaluates when the function is *created*; a double-underscore one when it is *executed*. That is what lets `regex_clause.yaml` resolve the term once and vary only the path per iteration.

**Emergent property to preserve:** when there is no term, `$search` is skipped entirely, so the browse/filter/paginate path is `$match` + `$sort` on both Atlas and local MongoDB — identical behaviour in both modes. Only an actual text query diverges.

## Task

### 1. Create the shared builder — `modules/shared/search/`

Four files, one per splice point, each ref'd independently with `_ref: { path: ../shared/search/<file>.yaml, vars: {...} }` (the relative-path idiom already used for `../shared/profile/*`). Do **not** try to expose them as keys of one file — a `_ref` combining `path` + `key` + `vars` has no precedent in this repo.

Every **gated** piece returns an **array** (`[]` or one element), so a gated-off piece disappears through the surrounding concat instead of leaving an empty object behind. The rule is about things that appear or disappear: a var that always contributes exactly one clause slot (the selector's `filter`, default `{}` — task 4) sits directly as a `$and` entry, because wrapping it in a one-element array would relocate its empty default rather than remove it. That is safe — `$and` accepts `{}` entries, verified on mongod 7.0.39; only `$and: []` is rejected.

**`modules/shared/search/text_lead.yaml`** — the Atlas text stage. Vars: `atlas_search`, `term`, `paths`, `should_extra` (default `[]`), `returnStoredSource` (default `true`).

```yaml
# Atlas $search text stage — the only Atlas-only stage in the searchable
# requests. Text ranking only: structural filters live in the $match that
# follows, so they run in both search modes.
#
# Two gates compose here. `atlas_search` is a module var, so a false flag drops
# the whole mechanism at compile. `term` is runtime, so the stage resolves at
# request time to either $search or a no-op $match — never to nothing, because
# a build-time concat cannot flatten a runtime value.
#
# returnStoredSource defaults to true: mongot returns the matched documents
# itself, so the $match below costs mongod no collection access. Callers whose
# list is refetched straight after a write pass false — mongot's copy lags index
# replication, so a stored-source row can show pre-edit values.
_build.if:
  test:
    _var: atlas_search
  then:
    - _if:
        test:
          _ne:
            - _if_none:
                - _var: term
                - ""
            - ""
        then:
          $search:
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
        # No term: resolve to a match-all rather than to nothing. The stage slot
        # is fixed at build time, so the runtime branch must yield a valid stage.
        else:
          $match: {}
  else: []
```

**`modules/shared/search/regex_clause.yaml`** — the gated fallback clause. Vars: `atlas_search` (default `false`), `term`, `paths`. It builds the per-field `$or` itself and owns the escaping, so callers pass a path list and nothing else.

```yaml
# Fallback text clause, ANDed into the request's $match. Mirror image of
# text_lead: emitted only when atlas_search is false (build) and a term is
# present (runtime).
#
# The $or is fanned out over `paths`, and this file is the only place user input
# is regex-escaped. Inside the callback the term uses a SINGLE underscore, so it
# resolves once when the callback is created; only the path varies per iteration
# (__args: 0, double underscore, evaluated per call). $& puts the matched
# metacharacter back after the added backslash, and single-quoted YAML keeps both
# patterns literal.
#
# atlas_search defaults to false so a module with no Atlas path at all
# (user-admin's members filter) can call this with just `term` and `paths`.
_build.if:
  test:
    _var:
      key: atlas_search
      default: false
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
            _array.map:
              on:
                _var: paths
              callback:
                _function:
                  __object.defineProperty:
                    on: {}
                    key:
                      __args: 0
                    descriptor:
                      value:
                        $regex:
                          _string.replace:
                            on:
                              _var: term
                            regex: '[.*+?^${}()|[\]\\/]'
                            newSubstr: '\$&'
                            regexFlags: g
                        $options: i
      else: []
```

The dynamic key needs `_object.defineProperty` because a YAML mapping key is a scalar string — Lowdefy resolves operators in value positions only, so a path drawn from `__args` cannot stand as a key. That idiom already runs server-side in every one of these requests: it is how each builds its `$sort` (e.g. `get_all_contacts.yaml:80-87`). Match their descriptor shape exactly (`descriptor: { value: … }`, no `enumerable`).

**This composition — a dynamic key inside a `_function` body — is the one part of the builder with no exact precedent.** Both halves are proven server-side here (`_array.filter` + `_function` with `__args` splices `filter_match` in four of these requests; `_object.defineProperty` builds their sorts), but confirm the combination on this task's first real run before tasks 3–7 copy it: check the `atlas_search: false` artifact actually contains a two-clause `$or` with resolved field names, and if it does not, fall back to hand-authoring the fan-out per caller and record that in the design.

**`modules/shared/search/score_stage.yaml`** — vars: `atlas_search`, `term`.

```yaml
# searchScore projection — only meaningful when a $search stage actually ran.
# Same build/runtime shape as text_lead: the slot is fixed at build time, so the
# no-term branch is an empty $addFields rather than nothing.
_build.if:
  test:
    _var: atlas_search
  then:
    - _if:
        test:
          _ne:
            - _if_none:
                - _var: term
                - ""
            - ""
        then:
          $addFields:
            score:
              $meta: searchScore
        else:
          $addFields: {}
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

Keep `id`, `type`, `connectionId`, and `payload` unchanged. Replace `properties.pipeline` with a `_build.array.concat` of four groups:

```yaml
properties:
  pipeline:
    _build.array.concat:
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
                      paths:
                        - profile.name
                        - lowercase_email
                - _array.filter:
                    - _module.var: request_stages.filter_match
                    - _function:
                        __ne:
                          - __args: 0
                          - null
      - _ref:
          path: ../shared/search/score_stage.yaml
          vars:
            atlas_search:
              _module.var: atlas_search
            term:
              _payload: filter.search
      - - $facet: # unchanged except for the $sort test below
        # ...
```

Note the two concats are different operators and both are correct: the **root** is `_build.array.concat`, splicing build-resolved arrays (the two builder refs collapse to `[]` or a one-element list at compile). The **`$and`** is a runtime `_array.concat`, because `regex_clause` and the `filter_match` null-drop appear and disappear on runtime values — and nothing build-time has to flatten it.

`paths` is passed to `regex_clause` in the same order and with the same values as to `text_lead`, so the two modes always search the same fields.

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

Everything else inside the `$facet` — the `_build.array.concat` splicing `request_stages.get_all_contacts`, `$skip`, `$limit`, the `updated_at`/`created_at` `$addFields` — stays as it is, and so does the `_build.array.concat` itself: `request_stages.*` is a build-time literal.

The `$unwind`/`$addFields`/`$replaceRoot` tail is unchanged and belongs in the same literal group as the `$facet`.

**Filter equivalence.** The old `mustNot: [equals hidden true, equals disabled true]` becomes `hidden: { $ne: true }` / `disabled: { $ne: true }` — the same semantics (missing field passes), and the same form `search_contacts.yaml` already uses.

## Acceptance Criteria

- `modules/shared/search/` contains the four files above; the escape pattern appears in `regex_clause.yaml` and nowhere else.
- `modules/contacts/requests/get_all_contacts.yaml` has no `$search` clause of its own — its Atlas stage comes only from `text_lead.yaml` — and its structural filters are a `$match` `$and`.
- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.
- With the demo left at the default (`atlas_search` unset → `true`), the built artifact `apps/demo/.lowdefy/server/build/pages/contacts/all/requests/get_all_contacts.json` shows: a flat pipeline array (the root `_build.array.concat` resolved at compile); a runtime `_if` whose branches are a `$search` with `returnStoredSource: true` and text/wildcard `should` clauses only (no `filter`/`mustNot`) and a `$match: {}`; a `$match` with `$and`; no `$or` regex clause anywhere (the build gate dropped it); and the `$sort` `_if` test resolved to a runtime `_ne` on the payload.
- Temporarily setting `atlas_search: false` in `apps/demo/modules/contacts/vars.yaml` and rebuilding shows the inverse: **no** `$search`, **no** `$meta: searchScore`, and no no-op `$match: {}`/`$addFields: {}` anywhere in that artifact — the build gate removed those slots entirely — plus a `$or` of two `$regex` clauses inside the `$match` `$and` with `profile.name` and `lowercase_email` as resolved keys, and the `$sort` test collapsed to the literal `false`. Revert the var afterwards — task 9 owns the demo wiring.

## Files

- `modules/shared/search/text_lead.yaml` — create.
- `modules/shared/search/regex_clause.yaml` — create.
- `modules/shared/search/score_stage.yaml` — create.
- `modules/shared/search/use_score.yaml` — create.
- `modules/contacts/requests/get_all_contacts.yaml` — modify — filters → `$match` `$and`, text via the builder, score sort gated.

## Notes

- `apps/demo/lowdefy.yaml` already watches `../../modules/shared` under `cli.watch`, so the new directory is picked up by the dev server without config changes.
- The `$and` array can never be empty here — `hidden`/`disabled` are unconditional — so MongoDB's rejection of `$and: []` cannot arise. Keep at least one unconditional structural clause in the first group when applying this pattern elsewhere.
- **The gates test against `""`, not `null`, in all four files — do not "simplify" them.** Three cases have to read as "no term": absent (`filter.search` before the filter block is touched), `null`, and the **empty string** a cleared input leaves behind. `_if_none` normalises the first two to `""` and the `_ne` then rejects all three in one test. Testing `null` instead would let `""` through into `$search` with `text: { query: "" }`, which Atlas rejects, and in fallback mode into `{ $regex: "", $options: i }`, which matches every document.
- Comments in the builder files should state the constraint (build vs runtime gating, why the no-term branch is a no-op stage rather than nothing), not the history of this task.
