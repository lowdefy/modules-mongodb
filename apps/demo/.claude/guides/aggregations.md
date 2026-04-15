# MongoDB Aggregations

How to write aggregation request pipelines for list pages, including search, filtering, pagination, and lookups.

## Pattern

List requests use `MongoDBAggregation` with `connectionId` from `_module.connectionId` (modules) or a direct connection name (app-level). Page state flows via `payload:` — **never** inline `_state` in pipeline properties.

```yaml
payload:
  filter:
    _state: filter
  pagination:
    _state: pagination
  sort:
    _state: sort
```

**Pipeline structure** follows a standard sequence:

1. **Search/Match** — find candidate documents
2. **Pre-facet stages** — `$lookup`, `$addFields`, `$match` for filters (if needed before count)
3. **`$facet`** — split into `count` and `results` branches
4. **Results branch** — sort, skip, limit, post-pagination lookups, field projection

Two search approaches:

- **Atlas Search** (`$search`) — for full-text search with relevance scoring. Uses `compound` with `mustNot` (hidden/disabled) and `must` (text/wildcard search + injected filter stages).
- **`$match`** — for simple field matching without full-text. Use when the collection doesn't have an Atlas Search index or search isn't needed.

**Conditional filtering** uses a `$match` with `$expr` and `$cond` per filter field. Each condition checks if the filter array has values, then applies the filter, else passes through:

```yaml
$cond:
  - _gt: [_payload: filter.{field}.length, 0]
  - $in: [$field, _payload: filter.{field}]
  - true
```

For complex pages, extract this into `stages/match_filter.yaml` via `_ref`.

**Sort logic** switches between search relevance (when text search is active) and user-selected field sort:

```yaml
_if:
  test:
    _eq:
      - _if_none: [_payload: filter.search, null]
      - null
  then:
    $sort: { _payload_sort_expression }
  else:
    $sort: { score: -1 }
```

**Module var injection** provides two extension points:

- `request_stages.filter_match` — inject additional `$search` must clauses or `$match` conditions
- `request_stages.get_all_{entities}` — inject post-pagination `$addFields` or `$project` stages

## Data Flow

```
Page state { filter, sort, pagination }
  → Request payload maps _state to _payload
  → Pipeline: $search/$match → filter stages → $facet
  → Count branch: $count → feeds pagination total
  → Results branch: $sort → $skip → $limit → $lookup → $project → feeds table rowData
```

## Variations

**Atlas Search + unwound facet (module pattern):**
Full-text search with `$search compound`, search score capture, `$facet`, then unwinding to flat results. Total accessed as `.0.total_results`. Best for module requests with `_module.var` injection.

**$match + separate facet (app-level pattern):**
Conditional `$search` or `$match: {}`, extracted filter match stages, `$facet` with count + results kept separate. Total accessed as `.0.count.0.count`. Place `$lookup` and `$project` inside results branch after `$skip/$limit` for efficiency.

**Simple match + facet (no search):**

```yaml
- $match:
    tool: { _module.var: tool.id }
    "status.0.stage": { _payload: filter.status }
- $facet:
    results: [{ $skip: ... }, { $limit: ... }]
    total: [{ $count: count }]
```

**Selector options pipeline:**

```yaml
- $facet:
    authors:
      - $group: { _id: $created.user.id }
      - $lookup:
          { from: user_contacts, localField: _id, foreignField: _id, as: user }
      - $unwind: { path: $user }
      - $project: { label: $user.profile.name, value: $_id }
      - $sort: { label: 1 }
    companies:
      - $group: { _id: $company_id }
      - $lookup: { from: companies, ... }
      - $project: { label: $company.trading_name, value: $_id }
```

Use `$facet` to build multiple `{ label, value }` option lists in a single request for filter dropdowns.

**Extracted match stages** (for complex filter logic):

```yaml
# requests/stages/match_filter.yaml
$match:
  $expr:
    $and:
      - $cond:
          - _gt: [_payload: filter.status.length, 0]
          - $in: [$arrayElemAt: [$status.stage, 0], _payload: filter.status]
          - true
      - $cond:
          - _eq: [_payload: filter.dates.length, 2]
          - $and:
              - $gte: [$created.timestamp, _payload: filter.dates.0]
              - $lte: [$created.timestamp, { end-of-day expression }]
          - true
```

Extract into `stages/*.yaml` when the `$match` exceeds ~20 lines.

## Anti-patterns

- **Don't use `_state` in pipeline properties** — always pass state through `payload:` and read via `_payload:`. Inline `_state` breaks request caching and creates hidden dependencies.
- **Don't put `$lookup` before `$facet` unless needed for filtering** — lookups on the full collection are expensive. Place them inside the results branch after `$skip/$limit` so they only run on the paginated slice.
- **Don't forget `_if_none` on pagination payload** — if pagination state isn't initialized yet, `$skip: null` crashes the pipeline. Always wrap: `_if_none: [_payload: pagination.skip, 0]`.
- **Don't hardcode filter conditions inline** — for 3+ filters, extract to `stages/match_filter.yaml` and use the `$cond` conditional pattern. This keeps the main request file scannable.
- **Don't skip the `mustNot` for hidden/disabled** — Atlas Search `$search` doesn't respect `$match` filters applied later. Exclusion conditions (`hidden: true`, `disabled: true`) must go inside the `$search` compound `mustNot`.

## Reference Files

- `modules/contacts/requests/get_all_contacts.yaml` — Atlas Search + unwound facet + module var injection (Convention A)
- `modules/data-upload/requests/get-staged.yaml` — simple `$match` + `$facet` + `$lookup` (no search)
- `modules/notifications/requests/get-notifications.yaml` — `$match` + extracted filter stages via `_ref`
- `modules/contacts/requests/get_contacts_for_selector.yaml` — selector options with `_build.array.concat` + module var injection

## Template

```yaml
# requests/get_all_{entities}.yaml
id: get_all_{entities}
type: MongoDBAggregation
connectionId:
  _module.connectionId: {entities}-collection
payload:
  pagination:
    _state: pagination
  filter:
    _state: filter
  sort:
    _state: sort
properties:
  pipeline:
    # 1. Search or match
    - _if:
        test:
          _eq:
            - _if_none: [_payload: filter.search, null]
            - null
        then:
          $match: {}
        else:
          $search:
            compound:
              filter:
                - compound:
                    mustNot:
                      - equals: { path: hidden, value: true }
                      - equals: { path: disabled, value: true }
                    must:
                      _array.concat:
                        - - compound:
                              should:
                                - text:
                                    query:
                                      _string.toLowerCase:
                                        _payload: filter.search
                                    path: [{search_field_1}, {search_field_2}]
                                - wildcard:
                                    query:
                                      _string.concat: ["*", { _string.toLowerCase: { _payload: filter.search } }, "*"]
                                    path: [{search_field_1}, {search_field_2}]
                                    allowAnalyzedField: true
                        - _module.var:
                            key: request_stages.filter_match
                            default: []

    # 2. Facet: count + results
    - $facet:
        count:
          - $count: total
        results:
          _build.array.concat:
            - - $sort:
                    _if:
                      test:
                        _eq:
                          - _if_none: [_payload: filter.search, null]
                          - null
                      then:
                        score: -1
                      else:
                        _object.defineProperty:
                          on: {}
                          key: { _payload: sort.by }
                          descriptor:
                            value: { _payload: sort.order }
              - $skip:
                  _if_none: [_payload: pagination.skip, 0]
              - $limit:
                  _if_none: [_payload: pagination.pageSize, 500]
              - $addFields:
                  updated_at:
                    $dateToString: { date: $updated.timestamp, format: "%Y-%m-%d" }
                  created_at:
                    $dateToString: { date: $created.timestamp, format: "%Y-%m-%d" }
            - _module.var:
                key: request_stages.get_all_{entities}
                default:
                  - $addFields: {}

    # 3. Unwinding (Convention A)
    - $unwind: { path: $count }
    - $unwind: { path: $results }
    - $addFields: { results.total_results: $count.total }
    - $replaceRoot: { newRoot: $results }
```

## Checklist

- [ ] State passed via `payload:`, not inline `_state` in pipeline
- [ ] `$search` compound includes `mustNot` for hidden/disabled
- [ ] `$facet` has both `count` and `results` branches
- [ ] `$skip`/`$limit` wrapped in `_if_none` with safe defaults
- [ ] Sort switches between search relevance and field sort based on whether search is active
- [ ] `$lookup` placed inside results branch after `$skip/$limit` (not before `$facet`)
- [ ] Module var injection points: `request_stages.filter_match` and `request_stages.get_all_{entities}`
- [ ] Complex filter `$match` extracted to `stages/*.yaml` using `$cond` conditional pattern
- [ ] Selector requests output `{ label, value }` shape for dropdown options
