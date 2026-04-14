# Notification Header Badge

## Problem

The `PageHeaderMenu` block API changed — it no longer fires an `onNotificationClick` event. Notification click behavior is now configured via `notifications.link` properties (property-driven navigation, not event-driven).

demo's current implementation has:

- `notification-config.yaml` — exports `count` and `icon` only
- `notification-on-click.yaml` — exports an `onNotificationClick` event handler (Link action navigating to inbox)
- `page.yaml` — wires `onNotificationClick` event from the notifications module

The event-based approach no longer works. The `notification-config` component needs to include the `link` property, and the event handler + event wiring become dead code.

## Current PageHeaderMenu Notification Properties

```
notifications.link.pageId     string    Page to link to when bell is clicked.
notifications.link.url        string    External URL to link to.
notifications.link.newTab     boolean   Open link in new tab.
notifications.count           number    Badge count. 0 hides the badge (unless showZero).
notifications.dot             boolean   Show a dot instead of count.
notifications.showZero        boolean   Show badge when count is zero.
notifications.overflowCount   number    Max count to show (default 99).
notifications.color           string    Badge color.
notifications.icon            string|object   Notification icon (default AiOutlineBell).
notifications.size            string    Button size: small (default), default, large.
```

## Design

### Updated `notification-config.yaml`

The `notification-config` component absorbs the navigation that was in `notification-on-click`. It becomes the single export that fully configures the header notification bell.

```yaml
# notifications/components/notification-config.yaml
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

The `link.pageId` uses `_module.pageId: inbox` — resolves in the notifications module's scope to the correct scoped page ID (e.g., `notifications/inbox`).

### Removed: `notification-on-click.yaml`

Delete `modules/notifications/components/notification-on-click.yaml`. The Link event handler is replaced by the `link` property above.

### Removed: `notification-on-click` export

Remove from `modules/notifications/module.lowdefy.yaml`:

- The component entry for `notification-on-click`
- The export entry for `notification-on-click`

### Updated `page.yaml`

Remove the `onNotificationClick` event block from `modules/layout-header-menu/components/page.yaml`. The layout module no longer needs to wire notification click behavior — it's embedded in the `notification-config` component that the `notifications` property already refs.

### Updated layout `module.lowdefy.yaml`

The `header_extra` var description still mentions `compact` and `mobile_extra` — these were removed when the built-in header features replaced custom block components. Update the description to reflect reality.

## Changes

| File                                                          | Change                                              |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `modules/notifications/components/notification-config.yaml`   | Add `link.pageId` with `_module.pageId: inbox`      |
| `modules/notifications/components/notification-on-click.yaml` | Delete                                              |
| `modules/notifications/module.lowdefy.yaml`                   | Remove `notification-on-click` component and export |
| `modules/layout-header-menu/components/page.yaml`             | Remove `onNotificationClick` event block            |
| `modules/layout-header-menu/module.lowdefy.yaml`              | Update `header_extra` var description               |

## Key Decisions

### Link on the component, not the layout

The `link.pageId` lives in `notification-config.yaml` (the notifications module), not in `page.yaml` (the layout module). This is the right placement because:

1. The notifications module knows where its inbox is (`_module.pageId: inbox` resolves in its scope).
2. The layout module already refs `notification-config` as an opaque object into `properties.notifications` — adding `link` to that object flows through without any layout changes beyond removing dead event code.
3. No new vars or override points needed. If an app needed different click behavior in the future (external URL, different page), the same `_module.var` override pattern used elsewhere could be added to `notification-config.yaml` then.

### No new vars for notification appearance

The new API exposes `dot`, `showZero`, `overflowCount`, `color`, and `size`. None of these need vars or module-level configuration now. The defaults (`count` display, no dot, overflow at 99, small size) are correct for demo. If customization is needed later, they can be added to `notification-config.yaml` with `_module.var` defaults.
