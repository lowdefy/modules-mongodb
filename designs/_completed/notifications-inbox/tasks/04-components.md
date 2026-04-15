# Task 4: Create Inbox UI Components

## Context

The notifications module has three existing components (`notification-config.yaml`, `notification-on-click.yaml`, `unread-count-request.yaml`) — all header integration components. The inbox page needs four new internal components for its two-column layout.

These components are referenced via `_ref` from the inbox page (task 05). They reference requests by `_request` name and actions by `_ref: actions/*.yaml` at runtime. This task can run in parallel with tasks 02 and 03.

## Task

Create four component files in `modules/notifications/components/`.

### 1. `components/list-notifications.yaml`

Displays the paginated notification list as clickable cards. Shows an empty state when no notifications match. Each card shows the event type badge (color from `enums.event_types` global), timestamp, title, and description. The selected card gets a primary-color border.

Card click handler:

- Updates URL query with `_id` via `Link` to `_module.pageId: inbox`
- Runs `set-selected.yaml` with `vars.selected_id` set to the clicked item's `_id`

```yaml
id: list_box
type: Box
loading:
  _not:
    _request: get_notifications
blocks:
  - id: list_none
    type: Result
    visible:
      _eq:
        - _request: get_notifications.0.notifications.length
        - 0
    properties:
      icon:
        name: AiOutlineContainer
        color: "#d9d9d9"
      subTitle: No matching notifications. Change filter to view more.
  - id: list
    type: List
    visible:
      _ne:
        - _request: get_notifications.0.notifications.length
        - 0
    blocks:
      - id: list.$.card
        type: Card
        properties:
          size: small
          style:
            boxShadow: 0px 5px 8px -3px rgba(0,0,0,0.1)
            border:
              _if:
                test:
                  _eq:
                    - _state: list.$._id
                    - _state: selected_id
                then: 2px solid var(--ant-color-primary)
                else: 2px solid var(--ant-color-border-secondary)
        style:
          margin: 4
        events:
          onClick:
            _build.array.concat:
              - - id: set_url_query
                  type: Link
                  params:
                    pageId:
                      _module.pageId: inbox
                    urlQuery:
                      _id:
                        _state: list.$._id
              - _ref:
                  path: actions/set-selected.yaml
                  vars:
                    selected_id:
                      _state: list.$._id
        blocks:
          - id: list.$.status_box
            type: Box
            layout:
              contentAlign: middle
              contentGutter: 6
            blocks:
              - id: list.$.type
                type: Html
                layout:
                  flex: 0 1 auto
                properties:
                  html:
                    _nunjucks:
                      template: |
                        {% if status %}<div style="font-size: 0.7rem; background: {{ status.color }}; padding: 6px; border-radius: 4px; color: white; min-width: 80px; text-align: center"><b>{{ status.title | safe }}</b></div>{% endif %}
                      on:
                        status:
                          _global:
                            _string.concat:
                              - enums.event_types.
                              - _state: list.$.event_type
              - id: list.$.time_ago
                type: Html
                layout:
                  flex: 1 1 auto
                properties:
                  html:
                    _nunjucks:
                      template: |
                        <div style="text-align: middle; font-size: 12px;">Received {{ time_ago }} ago</div>
                      on:
                        time_ago:
                          _dayjs.humanizeDuration:
                            on:
                              _subtract:
                                - _date.valueOf:
                                    _date: now
                                - _date.valueOf:
                                    _state: list.$.created.timestamp
                            withSuffix: false
              - id: list.$.body
                type: Html
                properties:
                  html:
                    _nunjucks:
                      template: |
                        <div><b>{{ notification.title | safe }}</b></div>
                        <div style="color: var(--ant-color-text-secondary);">{{ notification.description | safe }}</div>
                      on:
                        notification:
                          _state: list.$
```

### 2. `components/view-notification.yaml`

Full detail view of a single notification. Receives notification data via `_var: notification`. Shows event type badge, title, received date, and HTML body.

```yaml
id: view_notification
type: Box
blocks:
  - id: header
    type: Html
    properties:
      html:
        _nunjucks:
          template: |
            <div style="display: flex; gap: 1em;">
              <div style="flex: 0 1 auto;">
              {% if status %}
                <div style="font-size: 0.7rem; background: {{ status.color }}; padding: 6px; border-radius: 4px; color: white; min-width: 80px; text-align: center; margin-top: 8px;">
                  <b>{{ status.title | safe }}</b>
                </div>
              {% endif %}
              </div>
              <div style="flex: 1 1 auto; width: 100%;">
                <h3 style="margin: 0;">{{ notification.title | safe }}</h3>
                <p><small style="color: var(--ant-color-text-secondary);">Received on {{ notification.created.timestamp | date('D MMM YYYY') }}</small></p>
              </div>
            </div>
          on:
            notification:
              _var: notification
            status:
              _global:
                _string.concat:
                  - enums.event_types.
                  - _get:
                      key: event_type
                      from:
                        _var: notification
  - id: divider
    type: Divider
    properties:
      title: Notification Details
  - id: notification_details
    type: Html
    style:
      marginBottom: 2em
    properties:
      html:
        _get:
          key: body
          from:
            _var: notification
```

### 3. `components/area-selected.yaml`

Right panel — shows the detail view when a notification is selected (via URL query `_id`), or an empty state otherwise. Uses a spinner skeleton while loading.

```yaml
id: area_selected
type: Box
loading:
  _not:
    _request: get_selected_notification
skeleton:
  type: Box
  style:
    padding: 100px 24px 200px 24px
  blocks:
    - id: spinner
      type: Spinner
      properties:
        size: large
blocks:
  - id: no_selected
    type: Result
    visible:
      _not:
        _url_query: _id
    properties:
      subTitle: Click on a notification to view details.
      title: No Selected Notification
      icon:
        name: AiOutlineFileExclamation
        color: "#d9d9d9"
  - id: selected_item
    type: Box
    visible:
      _not:
        _not:
          _url_query: _id
    blocks:
      - _ref:
          path: components/view-notification.yaml
          vars:
            notification:
              _request: get_selected_notification.0
```

### 4. `components/form-filter.yaml`

Date range and event type filter controls. Both trigger `filter-onchange.yaml` on change.

```yaml
id: filter_box
type: Box
loading:
  _not:
    _request: get_notifications
layout:
  contentGutter: 8
blocks:
  - id: filter.dates
    type: DateRangeSelector
    layout:
      flex: 1 0 auto
    properties:
      title: Date Range
    events:
      onChange:
        _ref: actions/filter-onchange.yaml
  - id: filter.status
    type: MultipleSelector
    layout:
      flex: 1 0 auto
    properties:
      title: Type
      placeholder: Select type
      renderTags: true
      options:
        _state: event_types
    events:
      onChange:
        _ref: actions/filter-onchange.yaml
```

## Acceptance Criteria

- All four component files exist in `modules/notifications/components/`
- `list-notifications.yaml` renders a List with Card items, showing badge/timestamp/title/description
- Card click navigates via `_module.pageId: inbox` with `_id` URL query and triggers `set-selected.yaml`
- `view-notification.yaml` accepts `_var: notification` and renders badge, title, date, and body
- `area-selected.yaml` shows empty state when no `_url_query: _id`, detail view when present
- `form-filter.yaml` has DateRangeSelector and MultipleSelector, both triggering `filter-onchange.yaml`
- CSS variables used for theming: `var(--ant-color-primary)`, `var(--ant-color-text-secondary)`, `var(--ant-color-border-secondary)`
- All files are valid YAML

## Files

- `modules/notifications/components/list-notifications.yaml` — create — notification list panel
- `modules/notifications/components/view-notification.yaml` — create — notification detail view
- `modules/notifications/components/area-selected.yaml` — create — right panel (detail or empty state)
- `modules/notifications/components/form-filter.yaml` — create — date range + event type filters
