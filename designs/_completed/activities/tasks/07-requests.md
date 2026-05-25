# Task 7: Requests

## Context

After Task 6, the four shared pipeline stages exist. This task wires them into five concrete requests: list, detail, selector feed, for-entity, and Excel data. Each request composes a different combination of stages plus its own match/sort/pagination logic.

Reference shapes:
- `modules/companies/requests/get_all_companies.yaml` — Atlas Search list with $search/compound/filter/$facet/$sort. Use as the template for `get_activities.yaml`.
- `modules/companies/requests/get_company.yaml` — single-doc detail. Template for `get_activity.yaml`.
- `modules/companies/requests/get_companies_for_selector.yaml` — selector feed. Template for `get_activity_options.yaml`.
- `modules/companies/requests/get_company_excel_data.yaml` — Excel export. Template for `get_activities_excel_data.yaml`.

There's no companies counterpart for `get_activities_for_entity` — that's a new pattern (parameterised by reference field + value). Build it from scratch using `match_filter` + `lookup_*` stages.

## Task

### `modules/activities/requests/get_activities.yaml`

List page request. Atlas `$search` for free-text + filter clauses, then standard `$facet` + `$sort` + `$skip` + `$limit` + flatten — same envelope as `get_all_companies.yaml:1-115`.

Key adaptations:

- `connectionId: { _module.connectionId: activities-collection }`.
- The Atlas `compound.filter.mustNot: exists: path: removed.timestamp` clause stays exactly as in companies' file.
- Build the filter `must` clause to handle the activities-specific filters: `type`, current `stage`, `contact_id`, `company_id`, `date_from`/`date_to` on `updated.timestamp`.
- The `must` clause's text/wildcard search blocks search across `title` and `description` (which is rich-text HTML — search the rendered text via the Atlas index). Use the same `_payload: filter.search` shape as companies.
- After `$facet` flattening, append `_module.var: request_stages.get_all_activities` (the consumer pipeline hook).
- `$sort` defaults to `updated.timestamp: -1` per `decisions.md` §3.

The `add_derived_fields` stage needs to land **before** `$sort` if the sort uses derived fields (it doesn't — sort is on `updated.timestamp`). For now, append `add_derived_fields` after the consumer hook so list rows have `current_stage`, `completed_at` etc. for AgGrid columns and the row-action conditional rendering (Mark done vs Reopen).

### `modules/activities/requests/get_activity.yaml`

Single-doc detail. Mirror `get_company.yaml`:

```yaml
id: get_activity
type: MongoDBAggregation
connectionId:
  _module.connectionId: activities-collection
payload:
  _id:
    _url_query: _id
properties:
  pipeline:
    - $match:
        _id:
          _payload: _id
        removed.timestamp:
          $exists: false   # NOT { $ne: true } — that's the get_company.yaml bug
    - _ref: stages/add_derived_fields.yaml
    - _ref: stages/lookup_contacts.yaml
    - _ref: stages/lookup_companies.yaml
    - _module.var: request_stages.get_activity   # if such a hook exists; otherwise skip. Verify against vars table.
```

Note: the design's vars table lists `request_stages.get_all_activities`, `request_stages.selector`, `request_stages.filter_match`, `request_stages.write` — but **not** a `get_activity` hook. Companies has `get_contact` but not `get_company` either. Skip the consumer hook here; if needed later, add the var.

### `modules/activities/requests/get_activity_options.yaml`

Selector feed for `activity-selector`. Mirror `get_companies_for_selector.yaml`:

- `$match` excluding soft-deletes.
- `add_derived_fields` so the selector can show current stage as a chip.
- `$sort` by `updated.timestamp: -1`.
- `$limit` (e.g. 50, or paginated via payload).
- Append `_module.var: request_stages.selector`.

### `modules/activities/requests/get_activities_for_entity.yaml`

New pattern. Parameterised by `{ reference_field, reference_value }` — feeds the cross-module `activities-timeline` (Task 11) and any consumer-driven activity list scoped to a parent entity.

```yaml
id: get_activities_for_entity
type: MongoDBAggregation
connectionId:
  _module.connectionId: activities-collection
payload:
  reference_field:
    _state: reference_field   # passed via the embedding component's vars
  reference_value:
    _state: reference_value
properties:
  pipeline:
    - $match:
        # Dynamic field name — _payload.reference_field is "contact_ids" or "company_ids"
        # Use _object.defineProperty to build the $match doc with a runtime key:
        $expr:
          $in:
            - _payload: reference_value
            - $$ROOT.${reference_field}    # see note below
        removed.timestamp:
          $exists: false
    - _ref: stages/add_derived_fields.yaml
    - $sort:
        updated.timestamp: -1
    - $limit: 20    # tile shows recent — paginate or "View all" for the rest
```

The `$match` with a dynamic field name is the tricky bit. Two viable approaches:
- **(a)** Use `$expr` + `$in`. The above sketch shows this. The path `$$ROOT.${reference_field}` isn't directly supported — use `$getField` with the reference_field as a key. Aggregation operator `$getField: { field: { _payload: reference_field }, input: '$$ROOT' }` might work. Verify against Mongo docs.
- **(b)** Build the `$match` doc at request-prep time using Lowdefy operators (`_object.defineProperty` to set the key dynamically). The shape would be:
  ```yaml
  $match:
    _object.assign:
      - removed.timestamp: { $exists: false }
      - _object.defineProperty:
          on: {}
          key: { _payload: reference_field }
          descriptor:
            value: { _payload: reference_value }
  ```
  This builds `$match: { removed.timestamp: { $exists: false }, contact_ids: <value> }` (or `company_ids`) at request resolution time. Cleaner than `$expr`.

Approach (b) is preferred — it produces a plain `$match` that uses the standard btree indexes (`{ contact_ids: 1 }` and `{ company_ids: 1 }` from the design's Indexes section).

### `modules/activities/requests/get_activities_excel_data.yaml`

Excel export aggregation. Mirror `get_company_excel_data.yaml`. Reads filter state, applies the same filter shape as the list (but via `$match`, not Atlas Search — since Excel export doesn't need free-text search), runs `add_derived_fields` + `lookup_contacts` + `lookup_companies`, projects to flat columns suitable for Excel.

```yaml
id: get_activities_excel_data
type: MongoDBAggregation
connectionId:
  _module.connectionId: activities-collection
payload:
  filter:
    _state: filter
properties:
  pipeline:
    - _ref: stages/match_filter.yaml
    - _ref: stages/add_derived_fields.yaml
    - _ref: stages/lookup_contacts.yaml
    - _ref: stages/lookup_companies.yaml
    - $sort:
        updated.timestamp: -1
    - $project:
        _id: 1
        type: 1
        title: 1
        current_stage: 1
        completed_at: 1
        contacts: 1
        companies: 1
        # Plus consumer column overrides
    # Append _module.var: components.download_columns to the project? Or append a $project after.
    # Verify shape against companies' excel data request.
```

## Acceptance Criteria

- All five request files exist under `modules/activities/requests/`.
- The list request runs against an empty collection without error (returns 0 results, count: 0).
- The detail request returns a single doc when called with an existing `_id`; returns nothing for a soft-deleted doc.
- The selector feed returns a paginated list of activities sorted by `updated.timestamp` desc.
- `get_activities_for_entity` correctly filters by either `contact_ids` or `company_ids` based on the `reference_field` payload value.
- The Excel data request returns rows projected for export.
- All requests' `_match` filters exclude soft-deleted docs via the right shape (`$exists: false` for `$match`, `mustNot exists` for Atlas Search).
- Build is clean.

## Files

- `modules/activities/requests/get_activities.yaml` — create — Atlas Search list.
- `modules/activities/requests/get_activity.yaml` — create — single-doc detail.
- `modules/activities/requests/get_activity_options.yaml` — create — selector feed.
- `modules/activities/requests/get_activities_for_entity.yaml` — create — parameterised tile feed.
- `modules/activities/requests/get_activities_excel_data.yaml` — create — Excel export.

## Notes

- **Atlas Search vs `$match`.** Only `get_activities.yaml` (list) uses Atlas `$search`. All other requests use plain `$match`. The Atlas Search index needs to cover `removed.timestamp`, `title`, `description`, `type`, `status.0.stage` (per the design's Indexes section). The btree indexes on `contact_ids`, `company_ids`, `'status.0.stage' + 'updated.timestamp'`, `type`, and the source-channel partial index serve the non-Atlas requests.
- **Don't copy `get_company.yaml`'s `removed: { $ne: true }` filter.** It's the buggy pattern flagged in review-3 #3 — a soft-deleted doc has `removed: { timestamp, user }`, an object that's also `≠ true`, so deleted docs match. Use `$match: { 'removed.timestamp': { $exists: false } }` consistently.
- **Dynamic field name in `get_activities_for_entity`.** The Lowdefy build-time approach (option b) is preferred — produces a static `$match` shape at request-prep time, uses standard btree indexes. Verify by running the request twice (once with `reference_field: contact_ids`, once with `company_ids`) and confirming both hit their respective indexes (`explain` should show `IXSCAN`).
- **The list request's `request_stages.get_all_activities` hook** is a build-time `_module.var` — empty default `[{ $addFields: {} }]` makes it a no-op. Mirrors companies.
