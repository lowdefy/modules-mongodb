---
"@lowdefy/modules-mongodb-companies": patch
"@lowdefy/modules-mongodb-contacts": patch
"@lowdefy/modules-mongodb-events": patch
"@lowdefy/modules-mongodb-files": patch
"@lowdefy/modules-mongodb-layout": patch
"@lowdefy/modules-mongodb-notifications": patch
"@lowdefy/modules-mongodb-plugins": patch
"@lowdefy/modules-mongodb-release-notes": patch
"@lowdefy/modules-mongodb-user-account": patch
"@lowdefy/modules-mongodb-user-admin": patch
---

Fix the notifications bell badge always rendering as `0` on layout pages. The `page` component registered the `notifications_unread_count` request via `unread-count-request` but nothing ever fired it, so `_request: notifications_unread_count.0.total` stayed null and `notification-config`'s `_if_none` fell through to `0`. The `onMount` events array now prepends a `Request` action that fires `notifications_unread_count` whenever notifications aren't hidden, before any user-supplied `events.onMount` runs. Symmetric to how `requests` is gated on `!hide_notifications`.
