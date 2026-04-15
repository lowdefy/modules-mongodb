# Task 6: Create Link and Invalid Pages

## Context

Task 02 created the link-related requests (`get-notification-for-link`, `update-selected-notification`). This task creates the two new pages that handle notification deep-links and error states.

The **link page** is a non-visual routing page. It processes notification links from emails or in-app navigation — validates the notification, handles authentication, marks as read, and navigates to the target page. It uses a single request with an `$or` match: invite-user notifications match by `event_type` alone (no `contact_id` required), all others match by `contact_id`.

The **invalid page** is a simple error page shown when a notification link is bad or the notification doesn't belong to the user.

## Task

### 1. Create `pages/link.yaml`

The link page is a standalone `Box` (not wrapped in layout — it's a transient routing page). It has no visible UI blocks.

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

Auth flow:

1. Fetch notification with `$or` match (invite-user matches by `event_type`, others by `contact_id`)
2. If `invite-user` → navigate directly to notification's link target (login page with email hint)
3. If unauthenticated + not found → redirect to login with callback URL
4. If authenticated + not found → redirect to invalid page
5. Mark as read → navigate to `links.button.pageId` (or inbox fallback)

### 2. Create `pages/invalid.yaml`

Error page wrapped in the layout module's page component. Provides navigation to home and inbox.

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

## Acceptance Criteria

- `modules/notifications/pages/link.yaml` exists with the full routing logic
- Link page uses single `get-notification-for-link` request with `$or` match
- `invite-user` event type navigates directly to notification's link target without auth
- Unauthenticated non-invite users redirect to login with callback URL
- Invalid notifications redirect to `_module.pageId: invalid`
- Valid notifications mark as read and navigate to `links.button.pageId` / `links.button.urlQuery` / `links.button.input`
- Fallback navigation goes to `_module.pageId: inbox` when notification has no link data
- `modules/notifications/pages/invalid.yaml` exists with layout wrapper
- Invalid page shows Result component with "Invalid Notification Link" message
- Invalid page has "Go to home page" and "Go to inbox" buttons
- Both files are valid YAML

## Files

- `modules/notifications/pages/link.yaml` — create — deep-link routing page
- `modules/notifications/pages/invalid.yaml` — create — error page for bad notification links
