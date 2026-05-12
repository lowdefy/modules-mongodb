---
"@lowdefy/modules-mongodb-layout": patch
---

Fetch the notifications unread-count request on mount so the bell badge actually renders.

The `page` component already wired `notifications/unread-count-request` into its `requests` array (when `hide_notifications` is false), and `notification-config.yaml` reads the count via `_request: notifications_unread_count.0.total`. But the `_request` operator only reads previously-fetched data — it does not auto-trigger a fetch — and the layout never invoked the request, so the count stayed `null`, fell through `_if_none` to `0`, and the badge never appeared regardless of how many unread notifications a user had.

`onMountAsync` runs the fetch in parallel with the consumer's mount sequence, so it neither blocks render nor delays consumer-supplied mount actions.
