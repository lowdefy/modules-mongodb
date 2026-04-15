# Task 3: Create Action Files

## Context

The notifications module has no `actions/` directory yet. The inbox page and its components reference action files via `_ref: actions/*.yaml` for reusable event handler chains. These actions orchestrate state changes, request fetching, and list updates.

Actions reference requests by name (e.g., `params: get_notifications`) — they don't `_ref` request files. This task can run in parallel with task 02.

## Task

Create the `actions/` directory and four action files.

### 1. `actions/update-list.yaml`

Resets pagination to page 1 and refetches the notification list. Used by: filter changes, mark-all-read, page mount. Returns an array of actions (consumed by `_build.array.concat` in callers).

```yaml
- id: set_pagination
  type: SetState
  params:
    pagination:
      pageSize: 10
      skip: 0
      current: 1
- id: fetch
  type: Request
  params: get_notifications
- id: set_notifications
  type: SetState
  params:
    list:
      _request: get_notifications.0.notifications
- _ref: actions/set-types.yaml
```

Note: this file `_ref`s `actions/set-types.yaml`, so `set-types.yaml` must be created first (or simultaneously — they're in the same directory).

### 2. `actions/set-types.yaml`

Populates the event type filter options from the intersection of available notification types (from the `get_notification_types` request) and the `enums.event_types` global. Single action (not an array).

```yaml
id: set_event_types
type: SetState
params:
  event_types:
    _js: |
      const notification_types = request('get_notification_types.0.event_types');
      const event_types = lowdefyGlobal('enums.event_types');
      if (!notification_types || !event_types) return [];
      return Object.keys(event_types)
        .filter(key => notification_types.includes(key))
        .map(key => ({
          value: key,
          label: event_types[key].title,
          tag: { color: event_types[key].color }
        }));
```

### 3. `actions/set-selected.yaml`

Selects a notification, fetches its detail, and marks it as read. Uses `_build.array.concat` to return a flat action array. Accepts an optional `_var: selected_id` — when called from the list item click, this is passed with the clicked item's `_id`. When called on page mount, it falls back to `_url_query: _id`.

```yaml
_build.array.concat:
  - - id: scroll_top
      type: ScrollTo
      params:
        top: 0
    - id: set_id
      type: SetState
      params:
        selected_id:
          _if_none:
            - _var: selected_id
            - _url_query: _id
    - id: get_selected_notification
      type: Request
      params: get_selected_notification
    - id: update_selected_notification
      type: Request
      params: update_selected_notification
```

### 4. `actions/filter-onchange.yaml`

Debounced filter handler — wraps `update-list.yaml` with a 500ms debounce.

```yaml
debounce:
  ms: 500
try:
  _ref: actions/update-list.yaml
```

## Acceptance Criteria

- All four action files exist in `modules/notifications/actions/`
- `update-list.yaml` resets pagination, fetches `get_notifications`, sets `list` state, and refs `set-types.yaml`
- `set-types.yaml` uses `_js` to intersect notification types with global enum
- `set-selected.yaml` uses `_build.array.concat`, sets `selected_id` from `_var` or `_url_query`, fetches + marks read
- `filter-onchange.yaml` wraps `update-list.yaml` with 500ms debounce
- All files are valid YAML

## Files

- `modules/notifications/actions/set-types.yaml` — create — populate event type filter options
- `modules/notifications/actions/update-list.yaml` — create — reset pagination + refetch list
- `modules/notifications/actions/set-selected.yaml` — create — select notification + mark read
- `modules/notifications/actions/filter-onchange.yaml` — create — debounced filter handler
