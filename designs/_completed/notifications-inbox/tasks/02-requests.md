# Task 2: Create Request Files

## Context

Task 01 created the pipeline stage fragments in `requests/stages/`. This task creates all six request files used by the inbox, link, and update operations. All requests use `MongoDBAggregation` or `MongoDBUpdate*` types against the existing `notifications-collection` connection.

The connection is referenced as `_module.connectionId: notifications-collection`. All list/detail queries filter by `contact_id: _user: id` and `created.app_name: _payload: app_name` for ownership and app scoping.

Note: the existing `components/unread-count-request.yaml` uses `user_id` — the design uses `contact_id`. The unread count request is a header component and will be updated separately in task 07.

## Task

Create the `requests/` directory (it doesn't exist yet) and seven request files.

### 1. `requests/get-notifications.yaml`

Paginated notification list with filtering. Uses `$facet` for simultaneous count + results.

```yaml
id: get_notifications
type: MongoDBAggregation
connectionId:
  _module.connectionId: notifications-collection
payload:
  filter:
    _state: filter
  pagination:
    _state: pagination
  app_name:
    _module.var: app_name
properties:
  pipeline:
    - $match:
        contact_id:
          _user: id
        created.app_name:
          _payload: app_name
    - _ref: requests/stages/match-filter.yaml
    - _ref: requests/stages/match-filter-read-status.yaml
    - $facet:
        notifications:
          - $sort:
              created.timestamp: -1
          - $skip:
              _payload: pagination.skip
          - $limit:
              _payload: pagination.pageSize
        total_count:
          - $count: total
```

### 2. `requests/get-notification-types.yaml`

Unique event types for the filter dropdown. Filters by read/unread status (via `match-filter-read-status` stage) so the type options reflect the current tab.

```yaml
id: get_notification_types
type: MongoDBAggregation
connectionId:
  _module.connectionId: notifications-collection
payload:
  filter:
    _state: filter
  app_name:
    _module.var: app_name
properties:
  pipeline:
    - $match:
        contact_id:
          _user: id
        created.app_name:
          _payload: app_name
    - _ref: requests/stages/match-filter-read-status.yaml
    - $group:
        _id: 0
        event_types:
          $addToSet: $event_type
```

### 3. `requests/get-selected-notification.yaml`

Single notification detail by ID with ownership validation.

```yaml
id: get_selected_notification
type: MongoDBAggregation
connectionId:
  _module.connectionId: notifications-collection
payload:
  _id:
    _state: selected_id
  app_name:
    _module.var: app_name
properties:
  pipeline:
    - $match:
        _id:
          _payload: _id
        contact_id:
          _user: id
        created.app_name:
          _payload: app_name
```

### 4. `requests/get-notification-for-link.yaml`

Notification lookup for the link page with conditional ownership validation. Uses `$or` match: invite-user notifications match by `event_type` alone (user may not be authenticated), all other types require `contact_id` ownership.

```yaml
id: get_notification_for_link
type: MongoDBAggregation
connectionId:
  _module.connectionId: notifications-collection
payload:
  _id:
    _url_query: _id
  app_name:
    _module.var: app_name
  contact_id:
    _user: id
properties:
  pipeline:
    - $match:
        _id:
          _payload: _id
        created.app_name:
          _payload: app_name
        $or:
          - event_type: invite-user
          - contact_id:
              _payload: contact_id
```

### 5. `requests/update-notifications.yaml`

Mark all unread notifications as read for the current user.

```yaml
id: update_notifications
type: MongoDBUpdateMany
connectionId:
  _module.connectionId: notifications-collection
payload:
  app_name:
    _module.var: app_name
properties:
  filter:
    contact_id:
      _user: id
    created.app_name:
      _payload: app_name
    read: false
  update:
    $set:
      read: true
```

### 6. `requests/update-selected-notification.yaml`

Mark a single notification as read by `_id`. Includes `contact_id` and `app_name` ownership validation in the filter.

```yaml
id: update_selected_notification
type: MongoDBUpdateOne
connectionId:
  _module.connectionId: notifications-collection
payload:
  selected_id:
    _state: selected_id
  app_name:
    _module.var: app_name
properties:
  disableNoMatchError: true
  filter:
    _id:
      _payload: selected_id
    contact_id:
      _user: id
    created.app_name:
      _payload: app_name
  update:
    $set:
      read: true
```

## Acceptance Criteria

- All six request files exist in `modules/notifications/requests/`
- Each uses `_module.connectionId: notifications-collection`
- List/detail queries filter by `contact_id: _user: id` and `created.app_name`
- `get-notifications` uses `$facet` with `notifications` and `total_count` facets
- `get-notification-for-link` uses `$or` match: `event_type: invite-user` OR `contact_id` ownership
- `update-selected-notification` includes `contact_id` and `created.app_name` in its filter
- Stage refs in `get-notifications` and `get-notification-types` resolve to the files from task 01
- All files are valid YAML

## Files

- `modules/notifications/requests/get-notifications.yaml` — create — paginated list with filtering
- `modules/notifications/requests/get-notification-types.yaml` — create — unique event types for filter
- `modules/notifications/requests/get-selected-notification.yaml` — create — single notification detail
- `modules/notifications/requests/get-notification-for-link.yaml` — create — notification lookup for link page (with `$or` auth)
- `modules/notifications/requests/update-notifications.yaml` — create — mark all as read
- `modules/notifications/requests/update-selected-notification.yaml` — create — mark one as read
