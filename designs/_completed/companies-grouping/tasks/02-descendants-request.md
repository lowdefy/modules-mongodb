# Task 2: Add shared `get_descendant_company_ids` request

## Context

A single `MongoDBAggregation` request returns the set of `_id`s for a given root company plus all its descendants in the parent_ids DAG. It's reused on two surfaces:

- **Edit form** (task 7): payload `root_id: _state._id` — drives the parent-selector's cycle-check disable list.
- **List filter** (task 10): payload `root_id: _state.filter.parent_scope` — feeds the Atlas Search `must` clause on `get_all_companies`.

The request walks the graph **downward**: starts at the root, follows the inverse `parent_ids` relationship to find every company whose `parent_ids` array contains the current node. Because `parent_ids` is a multikey-indexed array, `$graphLookup` walks it natively.

The repo-wide soft-delete idiom is a boolean — documents are inserted with `removed: null` and soft-deleted by setting `removed: true`. Plain-aggregation queries filter via `removed: { $ne: true }` (see `modules/companies/requests/get_company.yaml:13`, `get_companies_for_selector.yaml:8`).

Per the design's "$graphLookup traversal does not skip soft-deleted nodes" decision, the `$graphLookup` runs without `restrictSearchWithMatch` — soft-deleted intermediate nodes are still traversed. Only the **root match** filters on `removed: { $ne: true }`, so picking a deleted root returns no descendants (and an empty result is the correct response in that case).

## Task

Create `modules/companies/requests/get_descendant_company_ids.yaml` with:

```yaml
id: get_descendant_company_ids
type: MongoDBAggregation
connectionId:
  _module.connectionId: companies-collection
payload:
  # Fallback chain so one request file serves both consumers without
  # per-invocation payload overrides (Lowdefy resolves payload from the
  # request file, not from the Request action invocation site):
  #   - List page: state.filter.parent_scope is set, state._id is undefined → uses parent_scope
  #   - Edit page: state._id is set, state.filter.parent_scope is undefined → falls back to _id
  root_id:
    _if_none:
      - _state: filter.parent_scope
      - _state: _id
properties:
  pipeline:
    - $match:
        _id:
          _payload: root_id
        removed:
          $ne: true
    - $graphLookup:
        from:
          _ref:
            path: connections/companies-collection.yaml
            key: properties.collection
        startWith: "$_id"
        connectFromField: _id
        connectToField: parent_ids
        maxDepth:
          _module.var: hierarchy.max_depth
        as: __descendants
    - $project:
        ids:
          $concatArrays:
            - ["$_id"]
            - "$__descendants._id"
```

When `root_id` is unset (e.g. `state.filter.parent_scope` is null), the `$match` returns no rows and the request result is `[]` — no `ids` field is projected. Downstream consumers must handle the empty-result case.

The `payload.root_id` uses `_if_none` to fall back from `state.filter.parent_scope` (set on the list page) to `state._id` (set on the edit page). Lowdefy resolves payload from the request file — invocations don't supply per-call overrides — so the fallback chain is the right idiom for serving both consumers.

## Acceptance Criteria

- `modules/companies/requests/get_descendant_company_ids.yaml` exists with the structure above.
- `pnpm ldf:b:i` builds without errors. The request file is referenced by tasks 7 and 10; it's not invoked yet on its own.
- Manual verification (after tasks 7 / 10 land): given a company `C-0001` with one descendant `C-0002`, the request returns `[{ ids: ["C-0001", "C-0002"] }]`.

## Files

- `modules/companies/requests/get_descendant_company_ids.yaml` — create — new shared request.

## Notes

- **`$graphLookup.from` via `_ref` to the connection file.** `$graphLookup.from` is a MongoDB pipeline argument that needs the literal collection name — Lowdefy's `_module.connectionId` returns the connection's *ID*, not its target collection name. Rather than hardcoding `from: companies`, the lookup uses `_ref: { path: connections/companies-collection.yaml, key: properties.collection }` to read the collection name from the connection file at build time. Verified working at build. If the module ever targets a renamed collection, every lookup updates automatically. Module-internal `_ref` paths resolve from the module root, so the path is the same regardless of which file refers to it.
- **Direction of walk.** `connectFromField: _id` + `connectToField: parent_ids` walks **downward** (root → children → grandchildren). The cycle-check request in task 4 walks **upward** (`connectFromField: parent_ids`, `connectToField: _id`). Don't confuse the two.
- **No `_build.if` gating.** This request file is added unconditionally — it doesn't read `hierarchy.enabled`. The request is harmless when no consumer invokes it. If desired, page-level `_build.if` gating happens in the consuming pages (tasks 7 and 10), not here.
