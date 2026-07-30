# Task 11: Bring `user-admin`'s members filter onto the `$and` idiom and the shared escaping

## Context

`modules/user-admin/requests/stages/members_filter.yaml` is the `$match` stage behind the members list — a post-`$lookup` filter, because the searchable fields (contact name, user email) only coexist after the joins, and `$search` must be a pipeline's first stage. It composes four optional clauses (a name/email `$or` regex, a `roles_arr` `$in`, and two mutually-exclusive status branches), each dropping out when its filter is unset.

It solves the same problem as this design's `$match` bodies and reaches the opposite conclusion, documented in its own header:

> the set clauses are merged into a single object (implicit AND) rather than wrapped in `$and` — with no filter set that leaves the canonical match-all `$match: {}`, where `$and: []` would be rejected by MongoDB. So every clause must own a distinct top-level key

Design decision 2 chose `$and` for the seven searchable requests, because it composes any clauses without top-level key collisions rather than relying on every author remembering the distinct-key rule. Leaving both in place would put two documented, contradicting idioms for one job in neighbouring modules.

**The stated obstacle does not hold.** `$and: []` is indeed rejected, but this file already seeds its `_array.concat` with `{}` (line 17), so the `$and` form yields `$and: [{}]` when nothing is set — which MongoDB accepts. Verified on mongod 8.3.4: `$and: [{}]`, `$and: [{}, {}]`, and `$match: { $and: [{hidden:{$ne:true}}, {}, {}] }` all parse; only `$and: []` errors (`BadValue: $and argument must be a non-empty array`).

**There is also a live defect to fix while the file is open.** Lines 28-34 interpolate `filter.search` straight into `$regex` with no escaping, so a `(` typed in the members search box makes MongoDB reject the regex, and `.*` matches every member. The shared `regex_value.yaml` from task 2 owns exactly this escaping.

This is the module's **only** change. `user-admin` still gets no `atlas_search` var and no `$search` stage — its search remains the always-unindexed regex path, on Atlas as well.

## Task

**1. Convert the merge to `$and`.** Replace the `_object.assign` wrapper with a `$and` array over the same `_array.concat`, keeping all four clause `_if`s and their tests byte-for-byte. The `{}` seed entry stays — it is what keeps the array non-empty when no filter is set:

```yaml
$match:
  $and:
    _array.concat:
      - - {}
      -  # ...the four existing clause _ifs, unchanged...
```

**2. Route the search regex through the shared escaping.** In the `search` clause, replace each inline `$regex` / `$options` pair with a `_ref` to `regex_value.yaml`:

```yaml
then:
  - $or:
      - name:
          _ref:
            path: ../shared/search/regex_value.yaml
            vars:
              term:
                _payload: filter.search
      - email:
          _ref:
            path: ../shared/search/regex_value.yaml
            vars:
              term:
                _payload: filter.search
```

`../shared/...` resolves module-root-relative regardless of the referencing file's depth — `modules/user-admin/components/view/tile_security.yaml:168` and `modules/user-account/components/view/modal_profile.yaml:28` are both depth-2 files doing this, so `requests/stages/` reaches it fine.

**3. Rewrite the header comment.** The distinct-top-level-key rule and the `$and: []` reasoning no longer apply and must go — a stale rationale reads to the next agent as an unsettled decision. State the current design: clauses are composed as a `$and` array so they cannot collide on a top-level key; the `{}` seed keeps the array non-empty when no filter is set; the search term is escaped by the shared `regex_value.yaml`. Keep the existing notes that carry real constraints (why search runs post-`$lookup`, and the exact-match `roles_arr` rule from that module's decision 1). Do not narrate the change.

## Acceptance Criteria

- `members_filter.yaml` emits `$match: { $and: [ … ] }`, with the four clauses and their `_if` tests unchanged.
- With no filter set the built stage is `$match: { $and: [{}] }`.
- The search clause contains no inline `$regex` — both fields get their value from `../shared/search/regex_value.yaml`.
- Typing `(` in the members search box returns results (matching contacts whose name or email contains a literal `(`) instead of erroring; typing `.*` matches only members with a literal `.*`, not everyone.
- The header comment describes the current shape, with no reference to `_object.assign`, the distinct-key rule, or `$and: []`.
- `pnpm --filter @lowdefy/modules-mongodb-demo ldf:b` succeeds.
- `user-admin/module.lowdefy.yaml` is unchanged — no `atlas_search` var.

## Files

- `modules/user-admin/requests/stages/members_filter.yaml` — modify — `_object.assign` → `$and`, shared regex escaping, header rewritten.

## Notes

- Depends on task 2 only for `regex_value.yaml`'s existence; it is otherwise independent of tasks 3-9.
- `user-admin`'s `request_stages.filter_match` is **already** plain `$match` clauses, so it needs no migration and no CHANGELOG breaking-change note. The only consumer-visible effect of this task is that the members search now handles regex metacharacters as literals — a fix, not a break.
- Do not add `user-admin` to `docs/shared/search.md`'s `atlas_search` sections. Task 10 already gives it the one note it needs: its search is always the unindexed regex path, and it has no search-index requirement.
