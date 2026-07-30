# Task 4: Add the fallback toggle to `contacts/search_contacts`

## Context

`modules/contacts/requests/search_contacts.yaml` is the typeahead behind the `contact-selector` block (ref'd from `modules/contacts/components/contact-selector.yaml.njk` with `id`, `input`, `company_only_contacts`, and `filter` vars). It is **already split** in the shape the rest of this design is converging on:

1. `$search` — text ranking only (`should` of `text` + `wildcard`, gated on the input being non-empty), with a `filter: [ exists: { path: _id } ]` baseline clause because Atlas `compound` requires at least one clause and `should` collapses to `[]` when the input is empty.
2. `$match` — structural filters as a plain Mongo query: `hidden`/`disabled` `$ne: true`, a `_build.if`-gated company-scoping clause, and the consumer `filter` var (a single `$match` object, default `{}`).
3. `$limit: 10` + `$project` shaping to the block's `{ label, value }` contract.

So it needs no filters→`$match` restructure. It needs the stage-1 toggle and the regex clause, and nothing else: there is no `$facet`, no pagination, and no score sort, so `score_addfields` and `use_score` do not apply. Note this request's term is `_payload: input`, not `_payload: filter.search`, and its consumer hook is the component-level `filter` var — **not** `request_stages.filter_match`. The two hooks stay deliberately distinct.

## Task

In `modules/contacts/requests/search_contacts.yaml`:

**1. Replace the hand-authored `$search` stage with the shared builder.** The pipeline root becomes a runtime `_array.concat`:

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
              _payload: input
            paths:
              - profile.name
              - lowercase_email
      - - $match: # existing stage, extended — see below
        - $limit: 10
        - $project: # unchanged
```

The `filter: [ exists: { path: _id } ]` baseline clause disappears with the hand-authored stage: `text_lead` only emits `$search` when there **is** a term, so `should` is never empty and the baseline clause is no longer needed.

**2. Add the regex clause to the existing `$match`.** The stage currently merges three sources with `_object.assign`. Keep that merge for the existing three (they own distinct keys), and wrap the whole body in `$and` so the regex clause's `$or` cannot collide with a consumer `filter` that also uses `$or`:

```yaml
- $match:
    $and:
      _array.concat:
        - - hidden:
              $ne: true
            disabled:
              $ne: true
          - _var:
              key: filter
              default: {}
        - _build.if:
            test:
              _var: company_only_contacts
            then:
              _if:
                test:
                  _gt:
                    - _array.length:
                        _if_none:
                          - _user: global_attributes.company_ids
                          - []
                    - 0
                then:
                  - global_attributes.company_ids:
                      $in:
                        _user: global_attributes.company_ids
                else: []
            else: []
        - _ref:
            path: ../shared/search/regex_clause.yaml
            vars:
              atlas_search:
                _module.var: atlas_search
              term:
                _payload: input
              or:
                - profile.name:
                    _ref:
                      path: ../shared/search/regex_value.yaml
                      vars:
                        term:
                          _payload: input
                - lowercase_email:
                    _ref:
                      path: ../shared/search/regex_value.yaml
                      vars:
                        term:
                          _payload: input
```

Note the split between the two groups. The `company_only_contacts` scoping is a **gate** — it appears or disappears — so it moves out of the first literal group and becomes its own `_array.concat` entry returning `[clause]` or `[]`, matching every other gated piece in the design. The consumer `filter` var stays a direct entry in the first group: it always contributes exactly one clause slot, and wrapping it in a one-element array would only relocate its `{}` default, not remove it.

That `{}` default is fine where it sits — **verified**, not assumed (mongod 8.3.4): `$and: [{a:1}, {}]`, `$and: [{}]`, and `$match: { $and: [{hidden:{$ne:true}}, {}, {}] }` all parse; only `$and: []` is rejected (`BadValue: $and argument must be a non-empty array`), and the unconditional `hidden`/`disabled` clause means the array is never empty here.

**3. Update the file's header comment.** It currently says apps without Atlas Search "can drop stage 1" and describes the required index as covering `profile.name`, `profile.picture`, `lowercase_email`, `global_attributes.*`, `hidden`, `disabled`. Both statements are now wrong: the stage is dropped by the `atlas_search` flag, and the index requirement is `storedSource: true` (whole document) with only the text fields mapped — see the committed `modules/contacts/search-indexes/default.search.json` (task 8). Rewrite the comment to describe the current pipeline and point at the search index file; do not narrate the change.

## Acceptance Criteria

- No `$search` block is authored in this file; the Atlas stage comes only from `text_lead.yaml`.
- The `$match` body is a `$and` array; `hidden`/`disabled`, the company-scoping `_build.if`, and the consumer `filter` var all behave exactly as before.
- The term is `_payload: input` everywhere (not `filter.search`), including inside the regex fan-out.
- `pnpm --filter @lowdefy/modules-mongodb-demo ldf:b` succeeds.
- The header comment describes the pipeline as it now stands, with no "used to"/"apps can drop stage 1" framing.
- Built artifact for a page hosting the contact selector (e.g. the activities or deals form pages) shows the gated `$search` under the default flag, and the `$or` regex clause with no `$search` when the flag is temporarily flipped to `false`.

## Files

- `modules/contacts/requests/search_contacts.yaml` — modify — runtime concat root, `$search` via the shared builder, regex clause in a `$and` `$match`, header comment rewritten.

## Notes

- The typeahead gains one behaviour change on the Atlas path: `text_lead` lowercases the query (`_string.toLowerCase`), which this request does not do today. That is deliberate and is what makes the `wildcard` clause match the lowercase-stored `lowercase_email`; the five list/export requests already do it.
- **The empty-term gate must be preserved, and it is — by the builder, not this file.** This request's term is `_state: <id>_input` from the `ContactSelector` search box (`contact-selector.yaml.njk:90-91`), and clearing that box leaves `""`, not `null` — which is why the hand-authored `should` gates on `_eq: [{ _if_none: [{ _payload: input }, ""] }, ""]` today. The shared gates test `""` for exactly this reason (task 2), so the behaviour carries over unchanged. Verify it: with the box cleared, the built artifact's gate must reject `""`, not just `null` — otherwise Atlas gets `text: { query: "" }` and the typeahead errors where it currently returns the unranked top-10.
- Do not touch `modules/contacts/requests/get_contacts_for_selector.yaml` (the `basic-contact-selector`) — it never used `$search` and is explicitly out of scope.
- The component-level `filter` var is not being unified with `request_stages.filter_match`. They differ in who sets them, which request they feed, and their shape (object vs array); after this design both are plain `$match`, which is as close as they get.
