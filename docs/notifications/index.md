---
title: Notifications
module: notifications
type: index
---

# Notifications

In-app notifications — bell counter, inbox page, deep-link routing, and a configurable send routine. Notification documents are scoped per app via the app's `slug` so multiple apps can share a single MongoDB collection.

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
      send_routine:
        _ref: modules/notifications/send-routine.yaml
```

Scoping reads the app's own `slug` — nothing to pass. `send_routine` is an array of API routine steps that receives `{ event_ids }` in the payload — leave it empty to skip dispatch (notifications still write but nothing is sent).

## Deep-link and file-download pages

The `link` page resolves a notification id to its target page and forwards the user. Auth-less event types (`invite-user`, `resend-user-invite`) can be resolved without a session, for flows where the recipient is not yet logged in.

The `file-download` page is a redirector for notification attachments: params `_id` and `index` are required; it generates a presigned GET against `notifications-files-bucket-public` and forwards the browser.

`link`, `invalid`, and `file-download` are contributed to `auth.pages.public` by the module manifest, so they resolve without a session in any app that embeds the module — no need to list them in the app's own `auth.pages.public`. The inbox (`all`) stays protected.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [App slug scoping](../shared/app-name.md) — how the app's `slug` scopes notifications
- [Secrets](../shared/secrets.md) — `MONGODB_URI`, `FILES_S3_*` connection secrets
