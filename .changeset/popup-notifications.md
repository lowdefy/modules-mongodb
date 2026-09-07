---
"@lowdefy/modules-mongodb-notifications": minor
"@lowdefy/modules-mongodb-layout": minor
---

Add popup notification toasts. Notifications flagged `popup: true` now surface as dismissible toast cards in a fixed-position stack (top-right), mounted globally by the `layout` page component the same way the bell is wired. The notifications module gains two exports — `popup-notifications` (the toast `List` block) and `popup-notifications-requests` (fetch + mark-read requests) — plus a `popup_limit` var (default 3). The layout page component gains a `hide_popup_notifications` gate. Toasts fetch on page mount (no sockets/polling), scope to the current user and `app_name`, and mark the notification read on Acknowledge. When a notification carries `links.button` the toast also shows a View button that navigates there via a `Link` action and marks it read.
