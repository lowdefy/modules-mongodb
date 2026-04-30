# Notifications

In-app notifications — bell counter, inbox page, deep-link routing, and a configurable send routine. Notification documents are scoped per app via [`app_name`](../../docs/idioms.md#app-name) so multiple apps can share a single MongoDB collection.

The send routine itself is provided by the consuming app — this module ships the schema, the read paths (bell, inbox), and the `send-notification` API stub. Wire whatever transport you need (email, SMS, push) inside `send_routine`.

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | Page wrapper for the `all`, `link`, and `invalid` pages |

## How to Use

```yaml
modules:
  - id: notifications
    source: "github:lowdefy/modules-mongodb/modules/notifications@v0.2.0"
    vars:
      app_name: my-app
      send_routine:
        _ref: modules/notifications/send-routine.yaml
```

`app_name` is required. `send_routine` is an array of API routine steps that receives `{ event_ids }` in the payload — leave it empty to skip dispatch (notifications still write but nothing is sent).

The bell is rendered automatically by the [`layout`](../layout/README.md) page component, which wires `notification-config` and `unread-count-request` exports from this module.

## Exports

### Pages

| ID | Description | Path |
|---|---|---|
| `all` | Notifications inbox — list, filter, and view notifications | `/{entryId}/all` |
| `link` | Deep-link handler — routes notification links to target pages | `/{entryId}/link` |
| `invalid` | Error page for invalid notification links | `/{entryId}/invalid` |

### Components

- **`notification-config`** — Notification-bell config consumed by the layout module's page header. Provides count, icon, and link target.
- **`unread-count-request`** — MongoDB count request for unread notifications. Used by the bell and any custom unread badges.

### API Endpoints

| ID | Description |
|---|---|
| `send-notification` | Dispatch one or more notifications. Receives `event_ids` and runs `send_routine`. |

### Connections

| ID | Collection |
|---|---|
| `notifications-collection` | `notifications` |

## Vars

### `app_name` (required)

`string` — App identifier used to scope notifications. Matches `created.app_name` on notification documents. See [App name scoping](../../docs/idioms.md#app-name).

### `send_routine`

`array`, default `[]`. API routine steps for dispatching notifications. Receives `{ event_ids }` in the payload. Default is a no-op.

## Secrets

| Name | Used for |
|---|---|
| `MONGODB_URI` | MongoDB connection |

Email / SMTP secrets are not consumed by this module — they belong to whichever transport the consuming app wires into `send_routine`.

## Plugins

- `@lowdefy/community-plugin-mongodb`

## Notes

The `link` page resolves a notification id to its target page and forwards the user. Invalid or expired links route through the `invalid` page. Any module producing notifications writes through `send-notification` and provides its own per-app deep-link payload — the routing logic on `link` is shared.
