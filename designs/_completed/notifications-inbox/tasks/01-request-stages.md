# Task 1: Create Request Pipeline Stages

## Context

The notifications module (`modules/notifications/`) currently has no request files — only a `connections/notifications-collection.yaml` and a stub `api/send-notification.yaml`. The inbox requests use shared pipeline stage fragments via `_ref` to filter notifications by date range, event type, and read/unread status.

These stage files must exist before the request files (task 02) can reference them.

## Task

Create the `requests/stages/` directory and two pipeline stage fragments.

### 1. Create `requests/stages/match-filter.yaml`

Date range and event type filtering. Uses `_object.assign` to conditionally build a `$match` stage from `filter.dates` and `filter.status` payload fields.

```yaml
$match:
  _object.assign:
    - _if:
        test:
          _gt:
            - _array.length:
                _payload: filter.dates
            - 0
        then:
          created.timestamp:
            $gte:
              _payload: filter.dates.0
            $lt:
              _mql.expr:
                on:
                  end_date:
                    _if_none:
                      - _payload: filter.dates.1
                      - _date: now
                expr:
                  $dateAdd:
                    startDate: $end_date
                    unit: day
                    amount: 1
        else: {}
    - _if:
        test:
          _gt:
            - _array.length:
                _payload: filter.status
            - 0
        then:
          event_type:
            $in:
              _if_none:
                - _payload: filter.status
                - []
        else: {}
```

### 2. Create `requests/stages/match-filter-read-status.yaml`

Read/unread status filtering. Matches on `read: false` when filter type is "Unread", `read: true` when "Read", and passes through (`{}`) otherwise.

```yaml
$match:
  _object.assign:
    - _if:
        test:
          _eq:
            - _payload: filter.type
            - Unread
        then:
          read: false
        else: {}
    - _if:
        test:
          _eq:
            - _payload: filter.type
            - Read
        then:
          read: true
        else: {}
```

## Acceptance Criteria

- `modules/notifications/requests/stages/` directory exists
- `match-filter.yaml` builds a conditional `$match` for date range and event type from payload
- `match-filter-read-status.yaml` builds a conditional `$match` for read/unread from payload
- Both files are valid YAML and use `_object.assign` + `_if` for conditional matching

## Files

- `modules/notifications/requests/stages/match-filter.yaml` — create — date range + event type filter stage
- `modules/notifications/requests/stages/match-filter-read-status.yaml` — create — read/unread status filter stage
