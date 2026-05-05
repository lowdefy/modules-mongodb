# Task 6: Pipeline Stages

## Context

After Task 1, the module skeleton exists. The four shared aggregation-pipeline stages live in `modules/activities/requests/stages/` and are `_ref`'d by the requests in Task 7. Factoring them keeps list / detail / selector / for-entity / Excel queries consistent — one source of truth for derived fields and lookups.

This task can run in parallel with Tasks 2–5 (APIs).

Reference shape: companies and contacts don't have a `requests/stages/` subfolder — their pipelines are inline. Activities introduces this convention because `add_derived_fields` is reused by every read pipeline. Subfolder is fine — `_ref: stages/<name>.yaml` works.

## Task

### `modules/activities/requests/stages/add_derived_fields.yaml`

`$addFields` stage projecting derived values from the status array. Lives at the top of every read pipeline so consumer queries can sort/filter on `current_stage`, `completed_at`, etc.

```yaml
$addFields:
  current_stage:
    $arrayElemAt:
      - "$status.stage"
      - 0
  completed_at:
    $let:
      vars:
        done:
          $arrayElemAt:
            - $filter:
                input: "$status"
                cond:
                  $eq:
                    - "$$this.stage"
                    - done
            - 0
      in: "$$done.created.timestamp"
  cancelled_at:
    $let:
      vars:
        cancelled:
          $arrayElemAt:
            - $filter:
                input: "$status"
                cond:
                  $eq:
                    - "$$this.stage"
                    - cancelled
            - 0
      in: "$$cancelled.created.timestamp"
  opened_at:
    $let:
      vars:
        open:
          $arrayElemAt:
            - $filter:
                input: "$status"
                cond:
                  $eq:
                    - "$$this.stage"
                    - open
            - 0
      in: "$$open.created.timestamp"
```

`current_stage: { $arrayElemAt: ["$status.stage", 0] }` works because Mongo projects fields through arrays — `$status.stage` evaluates to an array of stage strings, and `$arrayElemAt` picks index 0. Don't "fix" this to `$let` form unless tests show it's broken.

The `$let` form for `completed_at` / `cancelled_at` / `opened_at` is needed because `$arrayElemAt: [{...}.created.timestamp, 0]` is JavaScript dot-access, not a Mongo expression. The `$let` binds the filtered+picked entry to a var, then projects `created.timestamp` off it. `opened_at` returns the timestamp of the most recent `open` entry (handles reopens — since status[0] is the newest, the `$filter` returns most-recent-open at position 0).

### `modules/activities/requests/stages/match_filter.yaml`

`$match` stage that translates the list page's filter state into MongoDB query clauses. Used by the list page's `get_activities_excel_data` (which doesn't go through Atlas Search) and the for-entity tile query.

Wraps the consumer's `request_stages.filter_match` var hook for app-level extensibility.

```yaml
$match:
  $and:
    _array.concat:
      # Soft-delete filter
      - - removed.timestamp:
            $exists: false
      # Type filter
      - _if:
          test:
            _ne:
              - _payload: filter.type
              - null
          then:
            - type:
                _payload: filter.type
          else: []
      # Current-stage filter (uses fixed-position index `status.0.stage`)
      - _if:
          test:
            _ne:
              - _payload: filter.stage
              - null
          then:
            - status.0.stage:
                _payload: filter.stage
          else: []
      # Linked-contact filter
      - _if:
          test:
            _ne:
              - _payload: filter.contact_id
              - null
          then:
            - contact_ids:
                _payload: filter.contact_id
          else: []
      # Linked-company filter
      - _if:
          test:
            _ne:
              - _payload: filter.company_id
              - null
          then:
            - company_ids:
                _payload: filter.company_id
          else: []
      # Date-range filter on updated.timestamp
      - _if:
          test:
            _ne:
              - _payload: filter.date_from
              - null
          then:
            - updated.timestamp:
                $gte:
                  _date:
                    _payload: filter.date_from
          else: []
      - _if:
          test:
            _ne:
              - _payload: filter.date_to
              - null
          then:
            - updated.timestamp:
                $lte:
                  _date:
                    _payload: filter.date_to
          else: []
      # Consumer hook
      - _module.var: request_stages.filter_match
```

Note: this is the `$match` shape. The list page (`get_activities.yaml` in Task 7) uses Atlas Search `$search` instead, so this file isn't used by the main list — it's used by Excel export and for-entity. Look at `companies/requests/get_company_excel_data.yaml` for the parallel.

### `modules/activities/requests/stages/lookup_contacts.yaml`

`$lookup` stage joining linked contacts. Used by detail and Excel export to render contact chips/columns.

```yaml
$lookup:
  from:
    _module.var:
      module: contacts
      var: collection
  localField: contact_ids
  foreignField: _id
  as: contacts
  pipeline:
    - $match:
        removed.timestamp:
          $exists: false
    - $project:
        _id: 1
        profile: 1  # name, email, etc.
```

The exact `$project` keys depend on what the contact chips need (Task 10 — `contact_list_items`). Default to `_id` + `profile` (since that's where contact name + email live in the contacts module). Verify against `modules/contacts/requests/get_contact.yaml`'s projection.

### `modules/activities/requests/stages/lookup_companies.yaml`

Mirror `lookup_contacts.yaml` for companies:

```yaml
$lookup:
  from:
    _module.var:
      module: companies
      var: collection
  localField: company_ids
  foreignField: _id
  as: companies
  pipeline:
    - $match:
        removed.timestamp:
          $exists: false
    - $project:
        _id: 1
        trading_name: 1  # or whatever name_field defaults to in companies
```

Check `modules/companies/module.lowdefy.yaml`'s `name_field` default — it's `trading_name`. Either project just that field or include enough for the company chip rendering (Task 10).

## Acceptance Criteria

- All four files exist under `modules/activities/requests/stages/`.
- `add_derived_fields.yaml` parses as a valid aggregation stage. Verify by running it against a test activity in Mongo shell or via a test request — `current_stage`, `completed_at`, `cancelled_at`, `opened_at` should appear on the projected doc.
- `match_filter.yaml` resolves to a valid `$match` stage with all filter conditions ANDed. With no filters set, it should still match the soft-delete clause.
- `lookup_contacts.yaml` and `lookup_companies.yaml` resolve to valid `$lookup` stages projecting the right fields.
- Build is clean.

## Files

- `modules/activities/requests/stages/add_derived_fields.yaml` — create — derived fields stage.
- `modules/activities/requests/stages/match_filter.yaml` — create — list-page filter $match.
- `modules/activities/requests/stages/lookup_contacts.yaml` — create — contact join.
- `modules/activities/requests/stages/lookup_companies.yaml` — create — company join.

## Notes

- **`current_stage` syntax verified to work.** Don't rewrite to `$let` form unless a test proves it doesn't render. Mongo projects field access through arrays.
- **`opened_at` returns the most-recent open timestamp** (handles reopens). Because `status[0]` is the newest entry, `$filter` returns matches in the order they appear in the array — newest first — so `$arrayElemAt 0` picks the most recent open transition. Verify this assumption against Mongo docs if behavior surprises.
- **`match_filter.yaml` is for non-Atlas paths only.** The main list page uses Atlas Search via `$search` in `get_activities.yaml` (Task 7); this `$match` shape is for Excel export and for-entity, which read from indexes directly.
- **Consumer extensibility hook** (`request_stages.filter_match`) at the bottom of `match_filter`'s `_array.concat` lets apps add custom filter clauses without modifying the module. Mirrors `companies/requests/get_all_companies.yaml`'s pattern.
