# Task 1: Add Link to Notification Config, Remove Dead Event Handler

## Context

`PageHeaderMenu` no longer fires an `onNotificationClick` event. Notification click behavior is now configured via `notifications.link` properties on the block itself.

The notifications module currently exports two components for header integration:

- `notification-config` (`modules/notifications/components/notification-config.yaml`) — badge count and icon
- `notification-on-click` (`modules/notifications/components/notification-on-click.yaml`) — Link event handler navigating to inbox

The layout module's `page.yaml` wires `onNotificationClick` from `notification-on-click`. This event no longer exists on the block.

## Task

### 1. Update `notification-config.yaml`

Add a `link` property with `pageId` pointing to the inbox page. The file should become:

```yaml
# modules/notifications/components/notification-config.yaml
count:
  _if_none:
    - _request: notifications_unread_count.0.total
    - 0
icon:
  name: AiOutlineBell
link:
  pageId:
    _module.pageId: inbox
```

`_module.pageId: inbox` resolves in the notifications module's scope (e.g., `notifications/inbox`).

### 2. Delete `notification-on-click.yaml`

Delete `modules/notifications/components/notification-on-click.yaml`. Its behavior is now covered by the `link` property above.

### 3. Update notifications `module.lowdefy.yaml`

In `modules/notifications/module.lowdefy.yaml`:

Remove the `notification-on-click` component entry:

```yaml
- id: notification-on-click
  component:
    _ref: components/notification-on-click.yaml
```

Remove the `notification-on-click` export entry:

```yaml
- id: notification-on-click
  description: Event handler to navigate to notifications inbox
```

Update the `notification-config` export description to reflect it now includes navigation:

```yaml
- id: notification-config
  description: Notification bell config for PageHeaderMenu — count, icon, and inbox link
```

### 4. Remove `onNotificationClick` from layout `page.yaml`

In `modules/layout-header-menu/components/page.yaml`, remove lines 107–119 (the `onNotificationClick` event block):

```yaml
# Header action events — gated by same hide flags
onNotificationClick:
  _build.if:
    test:
      _build.not:
        _var:
          key: hide_notifications
          default: false
    then:
      _ref:
        module: notifications
        component: notification-on-click
    else: []
```

Also remove the comment `# Header action events — gated by same hide flags` since there are no more header action events in this section.

### 5. Update layout `module.lowdefy.yaml` var description

In `modules/layout-header-menu/module.lowdefy.yaml`, update the `header_extra` var description from:

```yaml
description: "Header customization: { blocks, compact, mobile_extra, requests }"
```

to:

```yaml
description: "Header customization: { blocks, requests }"
```

The `compact` and `mobile_extra` keys no longer exist — built-in header features render responsively.

## Acceptance Criteria

- `modules/notifications/components/notification-config.yaml` includes `link.pageId` with `_module.pageId: inbox`
- `modules/notifications/components/notification-on-click.yaml` does not exist
- `modules/notifications/module.lowdefy.yaml` has no reference to `notification-on-click`
- `modules/layout-header-menu/components/page.yaml` has no `onNotificationClick` event
- `modules/layout-header-menu/module.lowdefy.yaml` `header_extra` description says `{ blocks, requests }`

## Files

- `modules/notifications/components/notification-config.yaml` — modify — add `link.pageId`
- `modules/notifications/components/notification-on-click.yaml` — delete
- `modules/notifications/module.lowdefy.yaml` — modify — remove `notification-on-click` component + export, update `notification-config` description
- `modules/layout-header-menu/components/page.yaml` — modify — remove `onNotificationClick` event block
- `modules/layout-header-menu/module.lowdefy.yaml` — modify — update `header_extra` var description
