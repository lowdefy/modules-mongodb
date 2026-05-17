# Notifications

In-app notifications — bell counter, inbox page, deep-link routing, and a configurable send routine. Notification documents are scoped per app via [`app_name`](../../docs/idioms.md#app-name) so multiple apps can share a single MongoDB collection.

The send routine itself is provided by the consuming app — this module ships the schema, the read paths (bell, inbox), and the `send-notification` API stub. Wire whatever transport you need (email, SMS, push) inside `send_routine`.

## Dependencies

| Module                        | Why                                                     |
| ----------------------------- | ------------------------------------------------------- |
| [layout](../layout/README.md) | Page wrapper for the `all`, `link`, and `invalid` pages |

## How to Use

```yaml
modules:
  - id: notifications
    source: "github:lowdefy/modules-mongodb/modules/notifications@v0.5.2"
    vars:
      app_name: my-app
      send_routine:
        _ref: modules/notifications/send-routine.yaml
```

`app_name` is required. `send_routine` is an array of API routine steps that receives `{ event_ids }` in the payload — leave it empty to skip dispatch (notifications still write but nothing is sent). The `FILES_S3_*` secrets (including `FILES_S3_REGION`) back the `file-download` page; share them with the `files` module if both are installed.

The bell is rendered automatically by the [`layout`](../layout/README.md) page component, which wires `notification-config` and `unread-count-request` exports from this module.

## Exports

### Pages

| ID              | Description                                                                                                    | Path                       |
| --------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `all`           | Notifications inbox — list, filter, and view notifications                                                     | `/{entryId}/all`           |
| `link`          | Deep-link handler — routes notification links to target pages                                                  | `/{entryId}/link`          |
| `invalid`       | Error page for invalid notification links                                                                      | `/{entryId}/invalid`       |
| `file-download` | Public attachment redirect — resolves a notification file index to a presigned S3 URL and forwards the browser | `/{entryId}/file-download` |

### Components

- **`notification-config`** — Notification-bell config consumed by the layout module's page header. Provides count, icon, and link target.
- **`unread-count-request`** — MongoDB count request for unread notifications. Used by the bell and any custom unread badges.

### API Endpoints

| ID                  | Description                                                                       |
| ------------------- | --------------------------------------------------------------------------------- |
| `send-notification` | Dispatch one or more notifications. Receives `event_ids` and runs `send_routine`. |

### Connections

| ID                                  | Resource                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| `notifications-collection`          | MongoDB collection `notifications`                        |
| `notifications-files-bucket-public` | Public S3 bucket for `file-download` attachment redirects |

## Vars

### `app_name` (required)

`string` — App identifier used to scope notifications. Matches `created.app_name` on notification documents. See [App name scoping](../../docs/idioms.md#app-name).

### `send_routine`

`array`, default `[]`. API routine steps for dispatching notifications. Receives `{ event_ids }` in the payload. Default is a no-op.

## Secrets

| Name                         | Used for                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `MONGODB_URI`                | MongoDB connection                                                           |
| `FILES_S3_ACCESS_KEY_ID`     | AWS access key for the `notifications-files-bucket-public` connection        |
| `FILES_S3_SECRET_ACCESS_KEY` | AWS secret access key for the `notifications-files-bucket-public` connection |
| `FILES_S3_REGION`            | AWS region for the `notifications-files-bucket-public` connection            |
| `FILES_S3_BUCKET_PUB`        | Public S3 bucket name for notification attachments                           |

The `FILES_S3_*` secrets are shared with the `files` module by convention — point both modules at the same bucket and credentials.

Email / SMTP secrets are not consumed by this module — they belong to whichever transport the consuming app wires into `send_routine`.

## Plugins

- `@lowdefy/community-plugin-mongodb`

## Notes

### Link page resolution

The `link` page resolves a notification id to its target page and forwards the user. Invalid or expired links route through the `invalid` page. Any module producing notifications writes through `send-notification` and provides its own per-app deep-link payload — the routing logic on `link` is shared.

The link aggregation matches on `_id`, `created.app_name`, and an `$or` of either `contact_id` (the logged-in user is the notification's contact) or one of a fixed set of **auth-less event types** that any recipient can resolve regardless of session identity:

- `event_type: invite-user`
- `event_type: resend-user-invite`

Auth-less event types exist for flows where the recipient cannot yet be logged in as the target contact (initial invite emails, resent invites). Add new auth-less event types only when the recipient is genuinely unauthenticated at click time — otherwise prefer the `contact_id` branch.

### File-download page

The `file-download` page is a redirector for notification attachments. URL params `_id` (notification id) and `index` (file index in the notification's `$files` array) are required. The page fetches the notification, generates a presigned GET against `notifications-files-bucket-public`, and forwards the browser to the presigned URL. The page itself renders no UI — it is wrapped in a bare `Box` rather than the layout, so there is no header/sider flash before the redirect.

Use it from any notification template that references an attachment:

```
{{ notification_link }}/{entryId}/file-download?_id={{ notification._id }}&index=0
```
