# Pagination

How to add server-side pagination to list pages, including the component, state initialization, and aggregation pipeline integration.

## Pattern

Pagination is a three-part system: a **state shape**, a **Pagination component**, and a **`$facet` pipeline** in the aggregation request. All three must be wired together correctly.

**State shape** — `pagination: { current, skip, pageSize }`. Initialized in the page's `onMountAsync` (or `onMount`) **before** the first Request. The `Pagination` block automatically binds to these keys — `current` tracks the page number, `skip` is the offset for the aggregation, `pageSize` is the limit.

**Pagination component** — `type: Pagination` with `showTotal: true`, `size: small`, right-aligned. The `total` property reads from the aggregation's count result. On page change, `onChange` re-fetches the data request. The component lives below the table, typically as the last block inside the Card.

**Aggregation `$facet`** — the request pipeline splits into two branches: `count` (for the total) and `results` (with `$skip` + `$limit` from payload). Two conventions exist for how count reaches the component:

Convention A — **unwound results** (used in modules):

```yaml
$facet:
  count: [{ $count: total }]
  results: [sort, $skip, $limit, $addFields]
# then:
- $unwind: { path: $count }
- $unwind: { path: $results }
- $addFields: { results.total_results: $count.total }
- $replaceRoot: { newRoot: $results }
```

Total accessed as: `_request: get_all_{entities}.0.total_results`

Convention B — **separate arrays** (used in app-level pages):

```yaml
$facet:
  count: [{ $count: count }]
  results: [sort, $lookup, $project, $skip, $limit]
```

Total accessed as: `_request: get_all_{entities}.0.count.0.count`

Convention B is simpler and allows placing `$skip`/`$limit` at the end of the results pipeline (after lookups and projections), which is more correct for complex pipelines.

**Search action reset** — the `actions/search.yaml` file must reset pagination to page 1 whenever filters change. This prevents users from landing on an empty page when filtered results have fewer pages than the current position.

## Data Flow

```
Page onMountAsync
  → SetState { pagination: { current: 1, skip: 0, pageSize: 500 } }
  → Request fires with payload: { pagination: _state: pagination }
  → Aggregation $facet: count branch + results branch ($skip/$limit from payload)
  → Pagination component reads total from _request
  → User clicks page 2
  → Pagination updates state (current: 2, skip: 500)
  → onChange fires → Request re-fetches with new skip/limit
  → Table updates with new page of results
```

## Variations

**Inline pagination (per-page):**

```yaml
id: pagination
type: Pagination
style:
  textAlign: right
properties:
  size: small
  showTotal: true
  total:
    _if_none:
      - _request: get_all_{entities}.0.total_results
      - 0
  pageSizeOptions: [100, 500, 1000]
events:
  onChange:
    - id: fetch_data
      type: Request
      params: get_all_{entities}
```

**Shared reusable pagination (parametric via `_var`):**

```yaml
# shared/pagination.yaml
id: pagination
type: Pagination
style:
  textAlign: right
properties:
  size: small
  showTotal: true
  total:
    _if_none:
      - _request:
          _string.concat:
            - _var: request_id
            - .0.total.0.count
      - 0
  pageSizeOptions:
    _var:
      key: pageSizeOptions
      default: [20, 40]
events:
  onChange:
    _build.array.concat:
      - - id: get_data
          type: Request
          params:
            - _var: request_id
      - _var:
          key: onChange
          default: []
```

Used via: `_ref: { path: ../shared/pagination.yaml, vars: { request_id: get_all_companies, pageSizeOptions: [500, 1000] } }`

**With loading and disabled state:**

```yaml
properties:
  disabled:
    _not:
      _request: get_all_{entities}
events:
  onChange:
    - id: fetch_data
      type: Request
      messages:
        loading: true
      params: get_all_{entities}
```

**With post-fetch state update** (when table reads from state, not request):

```yaml
events:
  onChange:
    - id: get_data
      type: Request
      params: get_{entities}
    - id: set_list
      type: SetState
      params:
        { entities }:
          _request: get_{entities}.0.results
```

## Anti-patterns

- **Don't initialize pagination after the first Request** — the Request runs with undefined skip/limit, returning all documents. Always `SetState` pagination before `Request` in `onMountAsync`.
- **Don't forget pagination reset in search actions** — when filters change, reset `current: 1, skip: 0` while preserving `pageSize`. Without this, users see empty pages after filtering narrows results.
- **Don't hardcode `$skip`/`$limit` values in the pipeline** — always read from `_payload: pagination.skip` and `_payload: pagination.pageSize`. Hardcoded values break when the user changes page size.
- **Don't put `$skip`/`$limit` before `$lookup` stages** — in Convention B, place skip/limit at the end of the results branch so lookups process only the paginated slice (better performance).

## Reference Files

- `modules/contacts/components/pagination.yaml` — standard inline pagination with showSizeChanger
- `modules/user-admin/components/pagination.yaml` — pagination with disabled state and loading messages
- `modules/data-upload/components/pagination-staged.yaml` — pagination with custom page sizes and onSizeChange
- `modules/contacts/requests/get_all_contacts.yaml` — Convention A: `$facet` with unwinding to `total_results`
- `modules/contacts/actions/search.yaml` — search action that resets pagination on filter change

## Template

```yaml
# components/pagination.yaml
id: pagination
type: Pagination
style:
  textAlign: right
properties:
  size: small
  showTotal: true
  showSizeChanger: true
  total:
    _if_none:
      - _request: get_all_{entities}.0.total_results
      - 0
  disabled:
    _not:
      _request: get_all_{entities}
  pageSizeOptions:
    - 100
    - 500
    - 1000
events:
  onChange:
    - id: fetch_data
      type: Request
      messages:
        loading: true
      params: get_all_{entities}
```

**Page-level initialization (in onMountAsync, before the Request):**

```yaml
onMountAsync:
  - id: set_pagination
    type: SetState
    params:
      pagination:
        current: 1
        skip: 0
        pageSize: 500
  - id: get_all
    type: Request
    params:
      - get_all_{entities}
```

**Aggregation $facet (Convention A — unwound):**

```yaml
- $facet:
    count:
      - $count: total
    results:
      - $sort: { sort_expression }
      - $skip:
          _payload: pagination.skip
      - $limit:
          _payload: pagination.pageSize
- $unwind: { path: $count }
- $unwind: { path: $results }
- $addFields: { results.total_results: $count.total }
- $replaceRoot: { newRoot: $results }
```

## Checklist

- [ ] Pagination state `{ current: 1, skip: 0, pageSize: {N} }` initialized in `onMountAsync` **before** the first Request
- [ ] `total` reads from `_request` result with `_if_none` fallback to `0`
- [ ] `$facet` pipeline has both `count` and `results` branches
- [ ] `$skip` and `$limit` read from `_payload: pagination.skip` / `pagination.pageSize`
- [ ] `actions/search.yaml` resets `current: 1, skip: 0` while preserving `pageSize` on filter change
- [ ] `onChange` re-fetches the same request used to populate the table
- [ ] Pagination component placed below the table, inside the same Card
- [ ] `disabled` when request returns no data (prevents clicking while loading)
