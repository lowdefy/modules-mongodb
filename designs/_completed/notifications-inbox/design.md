# Notifications Module: Inbox, Link, and Invalid Pages

## Problem

The notifications module currently has a stub inbox page ("coming soon"), three header integration components (`notification-config`, `notification-on-click`, `unread-count-request`), a `send-notification` API stub, and a `notifications-collection` connection. Users can see the bell badge in the header and click it, but land on an empty page.

The module needs three pages:

- **Inbox** (`/notifications/inbox`) — list of notifications with filtering, pagination, and detail view
- **Link** (`/notifications/link`) — deep-link handler for notification routing (email links, in-app links)
- **Invalid** (`/notifications/invalid`) — error page for bad notification links

The example app (`apps/shared/notifications/`) has a working implementation of all three. This design adapts that implementation into the demo module system.

## Notification Document Schema

The module queries documents in the `notifications` collection with this shape:

```
{
  _id: string,
  contact_id: string,        // matches _user.id
  type: string,              // notification template identifier (e.g., "ticket-inserted-notify-author")
  event_type: string,        // business event type, key into event_types enum (e.g., "create-contact")
  title: string,
  description: string,
  body: string,              // HTML content for detail view
  read: boolean,
  created: {
    timestamp: date,
    app_name: string           // scopes notifications to an app
  },
  links: {                   // optional — routing data for notification deep-links
    button: {                // default link option key (example convention)
      pageId: string,        // target page ID
      urlQuery: object,      // URL query params
      input: object          // page input params
    }
  }
}
```

Follows example's `contact_id` convention. Also follows example's `created.app_name` filtering — notifications are scoped to the current app via the `app_name` module var.

## Module Structure

```
modules/notifications/
├── module.lowdefy.yaml
├── pages/
│   ├── inbox.yaml              # Replace stub — full inbox with list + detail
│   ├── link.yaml               # NEW — deep-link handler
│   └── invalid.yaml            # NEW — error page
├── components/
│   ├── notification-config.yaml        # Existing — header bell config
│   ├── notification-on-click.yaml      # Existing — header click handler
│   ├── unread-count-request.yaml       # Existing — header unread count
│   ├── list-notifications.yaml         # NEW — notification list panel
│   ├── view-notification.yaml          # NEW — notification detail view
│   ├── area-selected.yaml              # NEW — right panel (detail or empty state)
│   └── form-filter.yaml               # NEW — date range + event type filters
├── requests/
│   ├── get-notifications.yaml          # NEW — paginated list with filtering
│   ├── get-notification-types.yaml     # NEW — available event types for filter
│   ├── get-selected-notification.yaml  # NEW — single notification detail
│   ├── get-notification-for-link.yaml  # NEW — notification lookup for deep-link
│   ├── update-notifications.yaml       # NEW — mark all as read
│   ├── update-selected-notification.yaml # NEW — mark one as read
│   └── stages/
│       ├── match-filter.yaml           # NEW — date range + event type match
│       └── match-filter-read-status.yaml      # NEW — read/unread status match
├── actions/
│   ├── update-list.yaml                # NEW — reset pagination + refetch
│   ├── set-selected.yaml              # NEW — select notification + mark read
│   ├── set-types.yaml                 # NEW — populate event type filter options
│   └── filter-onchange.yaml           # NEW — debounced filter handler
├── connections/
│   └── notifications-collection.yaml   # Existing
└── api/
    └── send-notification.yaml          # Existing stub
```

## Module Manifest Changes

```yaml
# module.lowdefy.yaml
name: Notifications
description: Notification bell, inbox, and deep-link routing

dependencies:
  - id: layout
    description: Page layout wrapper

vars:
  app_name:
    type: string
    required: true
    description: >
      App identifier used to scope notifications. Matches created.app_name
      on notification documents.

connections:
  - _ref: connections/notifications-collection.yaml

pages:
  - _ref: pages/inbox.yaml
  - _ref: pages/link.yaml
  - _ref: pages/invalid.yaml

exports:
  pages:
    - id: inbox
      description: Notifications inbox — list, filter, and view notifications
    - id: link
      description: Deep-link handler — routes notification links to target pages
    - id: invalid
      description: Error page for invalid notification links
  connections:
    - id: notifications-collection
      description: MongoDB connection for notifications collection
  api:
    - id: send-notification
  components:
    - id: notification-config
      description: Notification bell config for PageHeaderMenu — count and icon
    - id: unread-count-request
      description: MongoDB count request for unread notifications

api:
  - _ref: api/send-notification.yaml

components:
  - id: notification-config
    component:
      _ref: components/notification-config.yaml
  - id: unread-count-request
    component:
      _ref: components/unread-count-request.yaml

secrets:
  - name: MONGODB_URI
    description: MongoDB connection URI

plugins:
  - name: "@lowdefy/community-plugin-mongodb"
    version: "^2"
```

Changes from current manifest:

- **Added** `app_name` var (required — scopes notification queries)
- **Added** `link` and `invalid` pages + exports
- **Updated** description

## Page Design: Inbox

The inbox page uses the layout module's `page` component. Two-column layout: notification list (left) and selected notification detail (right). On mobile, stacks vertically.

### `pages/inbox.yaml`

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

### List Notifications Component

`components/list-notifications.yaml` — displays the paginated notification list as clickable cards.

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

Key differences from example:

- Uses `_module.pageId: inbox` for link navigation
- Uses CSS variables (`var(--ant-color-primary)`) instead of `_ref: app_config.yaml` for theming
- Uses `_dayjs.humanizeDuration` instead of example's `_moment.humanizeDuration` (Lowdefy v5 migration)

### View Notification Component

`components/view-notification.yaml` — full detail of a single notification.

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

### Area Selected Component

`components/area-selected.yaml` — right panel showing detail or empty state.

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

### Form Filter Component

`components/form-filter.yaml` — date range and event type filter controls.

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

## Page Design: Link

The link page is a non-visual routing page. It loads the notification by `_id` from the URL query, validates it belongs to the current user, marks it as read, and navigates to the target page from the notification's `links.button` data. If the notification is invalid, it redirects to the invalid page.

### `pages/link.yaml`

The link page uses a single request with an `$or` match: invite-user notifications match by `event_type` (no `contact_id` required), all others match by `contact_id`. This fixes a example bug where unauthenticated users on invite links fell through to the invalid page.

```yaml
id: link
type: Box
requests:
  - _ref: requests/get-notification-for-link.yaml
  - _ref: requests/update-selected-notification.yaml
events:
  onMount:
    # Fetch notification (invite-user matches without contact_id, others need contact_id)
    - id: get_notification
      type: Request
      params: get_notification_for_link
    # If invite-user, navigate directly to the notification's link (login page with hint)
    - id: link_invite
      type: Link
      skip:
        _ne:
          - _request: get_notification_for_link.0.event_type
          - invite-user
      params:
        pageId:
          _if_none:
            - _request: get_notification_for_link.0.links.button.pageId
            - _module.pageId: inbox
        urlQuery:
          _if_none:
            - _request: get_notification_for_link.0.links.button.urlQuery
            - {}
        input:
          _if_none:
            - _request: get_notification_for_link.0.links.button.input
            - {}
    # Break if invite link was followed
    - id: break_invite
      type: Throw
      skip:
        _ne:
          - _request: get_notification_for_link.0.event_type
          - invite-user
      messages:
        error: false
      params:
        throw: true
    # If unauthenticated + not found, redirect to login with callback
    - id: link_to_login
      type: Link
      skip:
        _ne:
          - _user: true
          - null
      params:
        pageId: login
        input:
          callbackUrl:
            pageId:
              _module.pageId: link
            urlQuery:
              _url_query: true
    # Break if no user (login redirect should have fired)
    - id: break_no_user
      type: Throw
      messages:
        error: false
      params:
        throw:
          _eq:
            - _user: true
            - null
    # Authenticated — redirect to invalid page if not found
    - id: invalid_notification
      type: Link
      skip:
        _ne:
          - _request: get_notification_for_link.length
          - 0
      params:
        pageId:
          _module.pageId: invalid
    # Break if no notification
    - id: break_no_notification
      type: Throw
      messages:
        error: false
      params:
        throw:
          _eq:
            - _request: get_notification_for_link.length
            - 0
    # Mark as read
    - id: mark_read
      type: SetState
      params:
        selected_id:
          _url_query: _id
    - id: update_read
      type: Request
      params: update_selected_notification
    # Navigate to target page or fall back to inbox
    - id: link_notification
      type: Link
      params:
        pageId:
          _if_none:
            - _request: get_notification_for_link.0.links.button.pageId
            - _module.pageId: inbox
        urlQuery:
          _if_none:
            - _request: get_notification_for_link.0.links.button.urlQuery
            - {}
        input:
          _if_none:
            - _request: get_notification_for_link.0.links.button.input
            - {}
```

### Link Requests

`requests/get-notification-for-link.yaml` — fetches the notification with conditional ownership validation. Invite-user notifications match by `event_type` alone (the user may not be authenticated); all other types require `contact_id` ownership.

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

## Page Design: Invalid

A simple error page shown when a notification link is invalid or the notification doesn't belong to the user.

### `pages/invalid.yaml`

```yaml
_ref:
  module: layout
  component: page
  vars:
    id: invalid
    title: Invalid Notification
    hide_title: true
    blocks:
      - id: invalid_result
        type: Result
        properties:
          status: info
          title: Invalid Notification Link
          subTitle: The notification link you are trying to access is not valid.
        areas:
          extra:
            blocks:
              - id: home
                type: Button
                properties:
                  title: Go to home page
                  type: link
                  icon: AiOutlineHome
                events:
                  onClick:
                    - id: go_home
                      type: Link
                      params:
                        home: true
              - id: inbox
                type: Button
                properties:
                  title: Go to inbox
                  icon: AiOutlineBell
                events:
                  onClick:
                    - id: go_inbox
                      type: Link
                      params:
                        pageId:
                          _module.pageId: inbox
```

Uses the layout page component (user sees the normal app header). Provides navigation to home and inbox.

## Requests

### `requests/get-notifications.yaml`

Paginated list with filtering. Uses `$facet` for simultaneous count and result queries.

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

### `requests/get-notification-types.yaml`

Returns unique `event_type` values for the current user's notifications (used to populate the type filter).

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

### `requests/get-selected-notification.yaml`

Single notification detail by ID. Validates `contact_id` ownership.

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

### `requests/update-notifications.yaml`

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

### `requests/update-selected-notification.yaml`

Mark a single notification as read.

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

### `requests/stages/match-filter.yaml`

Date range and event type filtering stage.

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

### `requests/stages/match-filter-read-status.yaml`

Read/unread status filtering stage.

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

## Actions

### `actions/update-list.yaml`

Resets pagination and refetches the notification list.

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

### `actions/set-selected.yaml`

Selects a notification, fetches its detail, and marks it as read. The `_var: selected_id` parameter allows this action to be called from the list item click handler (passing the clicked item's `_id`) or on page mount (reading from URL query).

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

Simplified from example: removes the `company_id` extraction + `SetGlobal` + `LocalStorageSetItem` chain (example-specific company context). Removes the `get_notification_data` request (the header bell count refreshes on page navigation via its own mount logic).

### `actions/set-types.yaml`

Populates the event type filter options from the intersection of available notification types and the `enums.event_types` global — same approach as example.

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

### `actions/filter-onchange.yaml`

Debounced filter handler.

```yaml
debounce:
  ms: 500
try:
  _ref: actions/update-list.yaml
```

## App Wiring

The notifications module entry already exists in `apps/demo/modules.yaml`. Add `vars` to provide the required `app_name`:

```yaml
- id: notifications
  source: "file:../../modules/notifications"
  vars:
    app_name: demo
```

The new pages auto-register at `/notifications/inbox`, `/notifications/link`, and `/notifications/invalid`.

### Menu

The app can add a notifications link to its menu if desired, but it's not required — the primary entry point is the header bell icon. If a menu item is wanted:

```yaml
# In app menus.yaml
- id: notifications
  type: MenuLink
  pageId: notifications/inbox
  properties:
    title: Notifications
    icon:
      name: AiOutlineBell
      size: 14
```

## Key Decisions

### Event types from global state

Same as example — reads event type display metadata (color, title, icon) from `lowdefyGlobal('enums.event_types')` at runtime. This is a convention across the module set:

1. Each module defines its own `enums/event_types.yaml` with display metadata (color, title, icon) keyed by event type string.
2. The shared module assembles these into a combined map (`modules/shared/enums/event_types.yaml`).
3. The app populates `enums.event_types` into global state at init (via the events module's exported component).
4. Consumer modules (like notifications) read `lowdefyGlobal('enums.event_types')` at runtime for filter options and status badges.

The notifications module does not declare a dependency on events — it consumes the global convention. If the app does not populate `enums.event_types`, the event type filter will show empty options and status badges will render blank. This is acceptable degradation, not a hard failure.

**Note:** The events module `VARS.md` should document this consumer convention — that other modules read `enums.event_types` from global state and depend on the app wiring the events module to populate it.

### contact_id field convention

Follows example's `contact_id` convention — notification documents use `contact_id` to identify the recipient, matched against `_user: id` at query time. The existing `unread-count-request.yaml` stub uses `user_id` but will be updated to match.

### Link page invite-user handling

example uses a two-request pattern for the link page: first fetch the notification type (without `contact_id`), then conditionally bypass login for invite types. This has a bug — unauthenticated invite users pass the auth bypass but fail the subsequent `contact_id`-filtered fetch, landing on the invalid page instead of login.

The demo version fixes this with a single request using an `$or` match: invite-user notifications match by `event_type` alone (no `contact_id` required), all other types match by `contact_id`. If the notification is invite-user, the link page navigates directly to the notification's link target (the login page with email hint). For unauthenticated users on non-invite notifications, the page redirects to login with a callback URL.

Other example-specific patterns dropped:

- Company context extraction (`links.button.input.company_id` + SetGlobal + LocalStorage) — not applicable
- Dynamic link option via `_url_query: option` — hardcoded to `links.button` (example's default key) instead of `_string.concat` with a URL query param

### No popup toasts or WebSocket real-time

example has `popup_notifications.yaml` (toast overlays) and `socket_notification_count.yaml` (WebSocket for real-time badge updates). Both are deferred:

- **Popup toasts** add significant UI complexity (overlay positioning, acknowledgment flow, popup-specific requests). Add as a separate feature later.
- **WebSocket real-time** depends on the socket infrastructure (SignJWT + Socket.io). The unread count refreshes on each page navigation via the layout's `unread-count-request`. Real-time can be added when the socket infrastructure is available.

### Invalid page uses layout

The example invalid page is a standalone `Result` component with `minHeight: 100vh`. The demo version wraps it in the layout module's page component so the user sees the normal header and can navigate normally. Adds an "inbox" button alongside "home".

### CSS variables instead of app_config colors

example references `_ref: app_config.yaml, key: colors.primary` for the selected notification border. The demo version uses `var(--ant-color-primary)` — antd's CSS variable that respects the app's theme configuration. Same for text colors (`var(--ant-color-text-secondary)`).

## Tasks

### 01 — Request stages

Create the pipeline stage fragments:

- `requests/stages/match-filter.yaml`
- `requests/stages/match-filter-read-status.yaml`

### 02 — Requests

Create the request files:

- `requests/get-notifications.yaml`
- `requests/get-notification-types.yaml`
- `requests/get-selected-notification.yaml`
- `requests/get-notification-for-link.yaml` (uses `$or` match for invite-user handling)
- `requests/update-notifications.yaml`
- `requests/update-selected-notification.yaml` (includes `contact_id` + `app_name` ownership filter)

Depends on task 01.

### 03 — Actions

Create the action files:

- `actions/update-list.yaml`
- `actions/set-selected.yaml`
- `actions/set-types.yaml`
- `actions/filter-onchange.yaml`

### 04 — Internal components

Create the inbox UI components:

- `components/list-notifications.yaml`
- `components/view-notification.yaml`
- `components/area-selected.yaml`
- `components/form-filter.yaml`

### 05 — Inbox page

Replace `pages/inbox.yaml` with the full inbox implementation. Depends on tasks 02, 03, 04.

### 06 — Link and invalid pages

Create `pages/link.yaml` and `pages/invalid.yaml`. Link page depends on task 02 (get-notification-for-link request).

### 07 — Module manifest

Update `module.lowdefy.yaml`:

- Add `app_name` var
- Add `link` and `invalid` page refs and exports
- Update description

Update `components/unread-count-request.yaml`:

- Change `user_id` to `contact_id` (match `_user: id`)
- Add `created.app_name` filter using `_module.var: app_name`

Update `apps/demo/modules.yaml`:

- Add `vars: { app_name: demo }` to the notifications module entry

Update `VARS.md`:

- Document the `app_name` var
