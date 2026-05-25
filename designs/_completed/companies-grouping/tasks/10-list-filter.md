# Task 10: Parent-scope filter + Atlas Search `must` clause (lowest priority)

## Context

This is the **lowest-priority** piece of the design — schedule it after the edit form, view page, and API cycle check. Apps without it still get hierarchy editing and display; the filter is convenience, not core.

### Pre-condition: fix the soft-delete Atlas Search filter first

The design's "Related cleanup" section flags that `get_all_companies.yaml:18-22` and `get_company_excel_data.yaml:23` use `mustNot: [{ exists: { path: 'removed.timestamp' } }]` — a no-op clause because `removed` is a boolean (`null` or `true`), not an object with a `timestamp` subfield. The clause never matches, so soft-deleted companies are not currently excluded from list/export results.

Today this is harmless because no `delete-company` API exists. But the moment any company has `removed: true` (set by hand, by a future delete API, or by a migration), this list-filter task's hierarchy filter would happily surface those soft-deleted companies under their parent's scope.

Replace the clause in **both files** with an Atlas Search `equals` form before enabling this task's filter:

```yaml
mustNot:
  - equals:
      path: removed
      value: true
```

If the deployed environment has no soft-deleted companies (verify via `db.companies.find({ removed: true }).count()`), the order doesn't matter — but landing the cleanup first keeps the filter behaviour correct under all data states.

The list page (`modules/companies/pages/all.yaml`) currently filters via Atlas Search (`$search`) on `get_all_companies.yaml`. To filter by hierarchy ("show all under company X, including descendants"), this task:

1. Adds a single-select `company-selector` filter block to `filter_companies.yaml`, writing the picked id to `state.filter.parent_scope`.
2. Wires its `onChange` to fire `get_descendant_company_ids` (resolving the picked id to its descendants), then re-fire `get_all_companies` via the existing `actions/search.yaml`.
3. Extends `get_all_companies.yaml` to accept `parent_scope_ids` payload (sourced from `_request: get_descendant_company_ids.0.ids`) and add a conditional Atlas Search `in: { path: "_id", value: parent_scope_ids }` clause to the existing `compound.must` array.

`$graphLookup` cannot run inside `$search` (Atlas Search must be the first pipeline stage), so descendants are resolved by the separate request and fed in via payload — keeping Atlas Search as the indexed authority for filtering and pagination.

The selector for `filter.parent_scope` reuses `company-selector` in plain `Selector` mode — **no `cycle_check_ids` plumbing**. Cycles are a write-time concern; for filtering, every company is a valid scope.

## Task

### A. `modules/companies/components/filter_companies.yaml` — append parent-scope filter

The current filter row has a search text input and a clear button. Append a new filter block (build-gated on `hierarchy.enabled`):

```yaml
# Append to the existing blocks: array
- _build.if:
    test:
      _module.var: hierarchy.enabled
    then:
      _build.array.concat:
        - - _ref:
              path: components/company-selector.yaml
              vars:
                field_id: filter.parent_scope
                mode: Selector
                label:
                  _string.concat:
                    - "Under "
                    - _module.var: label
            events:
              onChange:
                - id: resolve_descendants
                  type: Request
                  params: get_descendant_company_ids
                - _ref: actions/search.yaml
    else: []
```

Notes:

- `field_id: filter.parent_scope` makes the input write its picked value to `state.filter.parent_scope` (auto-bound per project rules).
- `mode: Selector` (single-select), not `MultipleSelector`.
- The `onChange` chain runs `get_descendant_company_ids` first (resolving the picked id to its descendants), then the existing `actions/search.yaml` which re-fetches `get_all_companies`.
- `get_descendant_company_ids` reads `_state: filter.parent_scope` for its `root_id` payload (the default per task 2). When `filter.parent_scope` is null, the request returns `[]` and the conditional `must` clause skips.

### B. `modules/companies/requests/get_all_companies.yaml` — add `parent_scope_ids` payload and `must` clause

Two changes to the existing request:

1. **Add `parent_scope_ids` to the `payload:` block** (build-gated):

   ```yaml
   payload:
     pagination:
       _state: pagination
     filter:
       _state: filter
     sort:
       _state: sort
     # Build-gated on hierarchy.enabled:
     parent_scope_ids:
       _request: get_descendant_company_ids.0.ids
   ```

   Lowdefy's payload object should accept a build-conditional via `_build.object.assign` if needed:

   ```yaml
   payload:
     _build.object.assign:
       - pagination:
           _state: pagination
         filter:
           _state: filter
         sort:
           _state: sort
       - _build.if:
           test:
             _module.var: hierarchy.enabled
           then:
             parent_scope_ids:
               _request: get_descendant_company_ids.0.ids
           else: {}
   ```

2. **Add a conditional Atlas Search `in` clause to `compound.must`** (build-gated). The existing `must:` is built via `_array.concat` (currently lines ~24–56) and includes the search-text clause and the `request_stages.filter_match` consumer slot. Append a third entry:

   ```yaml
   must:
     _array.concat:
       - _if:
           test: { _ne: [_payload: filter.search, null] }
           then: [...]
           else: []
       - _array.filter:
           - _module.var: request_stages.filter_match
           - _function:
               __ne:
                 - __args: 0
                 - null
       # Build-gated parent-scope clause:
       - _build.if:
           test:
             _module.var: hierarchy.enabled
           then:
             - _if:
                 test:
                   _gt:
                     - _array.length:
                         _if_none:
                           - _payload: parent_scope_ids
                           - []
                     - 0
                 then:
                   - in:
                       path: _id
                       value:
                         _payload: parent_scope_ids
                 else: []
           else: []
   ```

   When `parent_scope_ids` is empty (no filter set, or filter resolved to no descendants), the inner `_if` produces `[]` and the `_array.concat` adds nothing — the search runs unscoped.

### C. `modules/companies/pages/all.yaml` — wire the descendants request

The current page references `get_all_companies` and `get_company_excel_data` in `requests:`. Add `get_descendant_company_ids` build-gated:

```yaml
requests:
  _build.array.concat:
    - - _ref: requests/get_all_companies.yaml
      - _ref: requests/get_company_excel_data.yaml
    - _build.if:
        test:
          _module.var: hierarchy.enabled
        then:
          - _ref: requests/get_descendant_company_ids.yaml
        else: []
```

`onMountAsync` fires `get_all_companies` already; no change needed there. The descendants request fires reactively from the filter block's `onChange` (per A above), not on mount.

## Acceptance Criteria

- When `hierarchy.enabled: false`: list page is identical to today — no extra filter block, no `parent_scope_ids` payload, no `in` clause in `compound.must`.
- When `hierarchy.enabled: true`:
  - The list page has a "Under Company" single-select alongside the existing search/clear filters.
  - Picking a company in the filter resolves its descendants and re-fetches the list, scoping results to that company + descendants.
  - Clearing the filter (via the existing Reset/Clear button or by clearing the selector) re-runs `get_descendant_company_ids` with `root_id: undefined`, returns `[]`, and the conditional `must` clause skips — list returns to unscoped.
  - Pagination counts in the page header reflect the filtered total (Atlas Search `$facet.count` is computed post-filter).
- Manual verification: in the demo app with `hierarchy.enabled: true`, create three companies A → B → C (B's parent is A, C's parent is B). Filter the list by A — confirm A, B, C all appear. Filter by B — confirm B and C only. Clear filter — confirm full list.

## Files

- `modules/companies/components/filter_companies.yaml` — modify — append build-gated parent-scope filter block with `onChange` chain.
- `modules/companies/requests/get_all_companies.yaml` — modify — add build-gated `parent_scope_ids` payload field and conditional Atlas Search `in` clause in `compound.must`.
- `modules/companies/pages/all.yaml` — modify — add `get_descendant_company_ids.yaml` to `requests:` (build-gated).

## Notes

- **Atlas Search index requirement.** `in: { path: "_id", value: <ids> }` requires the Atlas Search index to map `_id` as a `string` field. Atlas auto-indexes `_id`, but if the deployed search index uses a custom mapping, confirm `_id` is included and indexed as `string`. Worth checking on the deployed index when wiring this up.
- **Reset button must re-fire `get_descendant_company_ids` after `Reset`.** The existing "Clear" button at `filter_companies.yaml:29-41` runs `Reset` then `actions/search.yaml`. `Reset` clears `state.filter.parent_scope` to undefined, but the *cached request result* of `get_descendant_company_ids` may still hold the previously-resolved descendant ids. The next `get_all_companies` fire would then read stale `_request: get_descendant_company_ids.0.ids` and apply a stale filter. Fix: when `hierarchy.enabled`, insert a re-fire between `Reset` and the existing search action:

  ```yaml
  onClick:
    _build.array.concat:
      - - id: reset
          type: Reset
      - _build.if:
          test: { _module.var: hierarchy.enabled }
          then:
            - id: re_resolve_descendants
              type: Request
              params: get_descendant_company_ids
          else: []
      - _ref: actions/search.yaml
  ```

  After `Reset`, `state.filter.parent_scope` is undefined → `state._id` is also undefined on the list page → the descendants request's `_if_none` chain falls through to undefined `root_id` → `$match` returns no rows → `_request: get_descendant_company_ids.0.ids` resolves to `[]` → the conditional `must` clause skips → list returns to unscoped.
- **Performance.** A small `in` clause (typically < 100 ids for a hierarchy filter) is fast in Atlas Search. The pre-resolution request runs once per filter change, not per row; cost is negligible.
- **No `$graphLookup` in `get_all_companies`.** Repeating for clarity: the list aggregation does **not** add a `$graphLookup` stage. All graph traversal is in the separate `get_descendant_company_ids` request.
- **Why this is lowest priority.** Hierarchy editing (task 7) and display (task 9) are the core value of the feature. The list filter is nice-to-have; an app can ship hierarchy without it. If timeline pressure hits, this is the task to defer.
