# Task 5: Replace Stub Inbox Page

## Context

The current `modules/notifications/pages/inbox.yaml` is a stub:

```yaml
id: inbox
type: PageHeaderMenu
properties:
  title: Notifications
blocks:
  - id: placeholder
    type: Html
    properties:
      html: <p>Notifications inbox — coming soon.</p>
```

Tasks 01-04 created all the building blocks: request files, pipeline stages, actions, and components. This task replaces the stub with the full inbox implementation.

The inbox uses the layout module's `page` component (via `_ref: module: layout, component: page`). Two-column layout: notification list (left, span 10) and selected detail (right, span 14). On mobile (sm), stacks vertically with the detail panel on top (order 1) and list below (order 2).

## Task

Replace `modules/notifications/pages/inbox.yaml` with the full inbox page. Delete all existing content.

```yaml
_ref:
  module: layout
  component: page
  vars:
    id: inbox
    title: Notifications
    hide_title: true
    requests:
      - _ref: requests/get-notifications.yaml
      - _ref: requests/get-notification-types.yaml
      - _ref: requests/get-selected-notification.yaml
      - _ref: requests/update-notifications.yaml
      - _ref: requests/update-selected-notification.yaml
    events:
      onInit:
        - id: init
          type: SetState
          params:
            pagination:
              pageSize: 10
              skip: 0
            filter:
              type: Unread
        - id: get_notification_types
          type: Request
          params: get_notification_types
      onMount:
        _build.array.concat:
          - _ref: actions/set-selected.yaml
          - _ref: actions/update-list.yaml
    blocks:
      - id: content_wrapper
        type: Box
        style:
          maxWidth: 1200
          margin: 64px auto
        layout:
          contentGutter: 16
          contentJustify: center
        blocks:
          # Left column — notification list
          - id: notifications_area
            type: Box
            layout:
              span: 10
              contentGutter: 16
              sm:
                span: 24
                order: 2
              md:
                span: 10
                order: 1
            blocks:
              - id: title_box
                type: Box
                layout:
                  contentGutter: 8
                blocks:
                  - id: notifications_area_title
                    type: Divider
                    layout:
                      flex: 1 0 auto
                    style:
                      "& > *":
                        margin: 0px !important
                    properties:
                      title:
                        _nunjucks:
                          template: |
                            {{ type }} Notifications ({{ total or 0 }})
                          on:
                            total:
                              _request: get_notifications.0.total_count.0.total
                            type:
                              _state: filter.type
                  - id: button_mark_all_read
                    type: Button
                    layout:
                      flex: 1 1 auto
                    style:
                      textAlign: right
                    properties:
                      title: Mark All Read
                      type: default
                      disabled:
                        _or:
                          - _eq:
                              - _if_none:
                                  - _request: get_notifications.0.total_count.0.total
                                  - 0
                              - 0
                          - _eq:
                              - _state: filter.type
                              - Read
                    events:
                      onClick:
                        _build.array.concat:
                          - - id: update_notifications
                              type: Request
                              params: update_notifications
                          - _ref: actions/update-list.yaml
                  - id: filter.type
                    type: ButtonSelector
                    layout:
                      flex: 0 1 auto
                    style:
                      textAlign: right
                    loading:
                      _not:
                        _request: get_notifications
                    properties:
                      label:
                        disabled: true
                      options:
                        - Unread
                        - Read
                    events:
                      onChange:
                        debounce:
                          ms: 500
                        try:
                          _build.array.concat:
                            - - id: get_notification_types
                                type: Request
                                params: get_notification_types
                            - _ref: actions/update-list.yaml
              - _ref: components/form-filter.yaml
              - _ref: components/list-notifications.yaml
              - id: pagination
                type: Pagination
                style:
                  textAlign: right
                properties:
                  showTotal: true
                  total:
                    _get:
                      from:
                        _request: get_notifications.0.total_count
                      key: 0.total
                      default: 0
                events:
                  onChange:
                    - id: clear
                      type: SetState
                      params:
                        list: []
                    - id: fetch
                      type: Request
                      params: get_notifications
                    - id: set_list
                      type: SetState
                      params:
                        list:
                          _request: get_notifications.0.notifications
                    - _ref: actions/set-types.yaml
          # Right column — selected notification detail
          - id: selected_area
            type: Box
            layout:
              span: 14
              sm:
                span: 24
                order: 1
              md:
                span: 14
                order: 2
              contentGutter: 8
            blocks:
              - id: selected_area_title
                type: Divider
                style:
                  "& > *":
                    margin: 0px !important
                layout:
                  flex: 1 0 auto
                properties:
                  title: Selected
                  orientation: left
              - id: selected_area_card
                type: Card
                properties:
                  style:
                    boxShadow: 0px 5px 8px -3px rgba(0,0,0,0.1)
                blocks:
                  - _ref: components/area-selected.yaml
```

Key behaviors:

- **onInit**: Sets default pagination (page size 10, skip 0) and default filter (Unread). Fetches notification types for the filter dropdown.
- **onMount**: Selects notification from URL query (if present) and fetches the list.
- **Mark All Read**: Fires `update_notifications` request then refreshes the list.
- **ButtonSelector (Unread/Read)**: Switches the read/unread filter tab with debounce, refetches types and list.
- **Pagination onChange**: Clears list, fetches with new skip/limit, updates list state and types.

## Acceptance Criteria

- `modules/notifications/pages/inbox.yaml` contains the full page definition (no more stub)
- Page uses `_ref: module: layout, component: page` with `id: inbox`
- All five requests are referenced in `vars.requests`
- `onInit` sets default pagination and filter state
- `onMount` runs `set-selected` and `update-list` actions
- Two-column layout: span 10 left (list), span 14 right (detail)
- Mobile responsive: sm spans 24, detail order 1, list order 2
- Mark All Read button disabled when count is 0 or filter is "Read"
- Pagination component with `showTotal` and proper `onChange` handler
- All `_ref` paths resolve to files created in tasks 01-04

## Files

- `modules/notifications/pages/inbox.yaml` — modify (full rewrite) — replace stub with inbox implementation
