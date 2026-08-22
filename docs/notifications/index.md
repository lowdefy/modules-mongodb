---
title: Notifications
module: notifications
type: index
---

# Notifications

In-app notifications — bell counter, inbox page, deep-link routing, and a configurable send routine. Notification documents are scoped per app via `app_name` so multiple apps can share a single MongoDB collection.

The send routine itself is provided by the consuming app — this module ships the schema, the read paths (bell, inbox), and the `send-notification` API stub. Wire whatever transport you need (email, SMS, push) inside `send_routine`.

## Dependencies

| Module                       | Why                                                     |
| ---------------------------- | ------------------------------------------------------- |
| [layout](../layout/index.md) | Page wrapper for the `all`, `link`, and `invalid` pages |

## When to use

Add `notifications` when an app needs an in-app notification bell and inbox. The bell is rendered automatically by the `layout` page component, which wires `notification-config` and `unread-count-request` exports from this module. Also required by `user-admin` for invite dispatch and by `workflows` for engine-emitted notifications.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: notifications
    source: "github:lowdefy/modules-mongodb/modules/notifications@v0.8.1"
    vars:
      app_name: my-app
      send_routine:
        _ref: modules/notifications/send-routine.yaml
```

`app_name` is required. `send_routine` is an array of API routine steps that receives `{ event_ids }` in the payload — leave it empty to skip dispatch (notifications still write but nothing is sent).

## Popup notifications (toasts)

Any notification flagged `popup: true` is also surfaced as a dismissible toast card in a fixed-position stack, top-right of the viewport, over every page. The stack is mounted automatically by the `layout` page component (the `popup-notifications` and `popup-notifications-requests` exports), the same way the bell is wired.

- **Opt in per notification.** Set `popup: true` on the document in your `send_routine`. Notifications left `popup: false` still appear in the bell and inbox but never toast. No migration is needed — apps that never set it see no toasts.
- **Refresh.** Toasts are fetched on page mount/navigation (no sockets or polling), showing up to `popup_limit` (default 3) most-recent unread popups scoped to the current user and `app_name`.
- **Acknowledge marks read.** Clicking **Acknowledge** sets `read: true`, so the toast, the inbox unread entry, and the bell count clear together.
- **Optional deep-link button.** If the notification has a `links.button` (`{ pageId, urlQuery }`), the toast also shows a **View** button that navigates there via a `Link` action. Toasts without `links.button` show only Acknowledge.
- **Disable per page.** Pass `hide_popup_notifications: true` to the `layout` page component to suppress the stack (independent of the bell's `hide_notifications`). The stack is also hidden on the notifications inbox (`all`) page.

Toast icon and color come from the `enums.event_types.<event_type>` global (falling back to a bell icon), the same lookup the inbox uses.

## Deep-link and file-download pages

The `link` page resolves a notification id to its target page and forwards the user. Auth-less event types (`invite-user`, `resend-user-invite`) can be resolved without a session, for flows where the recipient is not yet logged in.

The `file-download` page is a redirector for notification attachments: params `_id` and `index` are required; it generates a presigned GET against `notifications-files-bucket-public` and forwards the browser.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [App name scoping](../shared/app-name.md) — how `app_name` scopes notifications
- [Secrets](../shared/secrets.md) — `MONGODB_URI`, `FILES_S3_*` connection secrets
