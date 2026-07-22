---
title: Notifications
module: notifications
type: index
---

# Notifications

Notification dispatch and in-app display — a render/store/send pipeline, bell counter, inbox page, and deep-link routing. Notification documents are scoped per app via `app_name` so multiple apps can share a single MongoDB collection.

The Lowdefy framework renders notification emails (the `notifications:` config section and the `RenderNotification` step, Lowdefy ≥ 5.4); this module owns everything around the render: the dispatch pipeline (insert with dedup, send, retry bookkeeping), the record convention, and the read paths (bell, inbox, deep links). Apps shape their events into notification items inside `send_routine` and hand them to the pipeline. Modules can also ship their own templates and dispatch directly (the user-admin module's invites do — no app-side template or send_routine branch needed).

## Dependencies

| Module                       | Why                                                     |
| ---------------------------- | ------------------------------------------------------- |
| [layout](../layout/index.md) | Page wrapper for the `all`, `link`, and `invalid` pages |

## When to use

Add `notifications` when an app needs an in-app notification bell and inbox, or email notifications rendered from the app's `notifications:` template configs. The bell is rendered automatically by the `layout` page component, which wires `notification-config` and `unread-count-request` exports from this module. Also required by `user-admin` for invite dispatch and by `workflows` for engine-emitted notifications.

## Quickstart

```yaml
# lowdefy.yaml
notifications: # framework template configs — the pipeline renders these
  - id: quote-approved
    type: NotificationEmail
    properties:
      subject: Your quote was approved
      message: "{{ approver_name }} approved your quote."
      button:
        label: View lead

modules:
  - id: notifications
    source: "github:lowdefy/modules-mongodb/modules/notifications@v0.10.0"
    vars:
      app_name: my-app
      server_url: https://my-app.example.com
      email:
        host: smtp.example.com
        user: my-user
        from: "My App <notify@my-app.example.com>"
        # pass defaults to the NOTIFICATIONS_SMTP_PASS secret
      # Or send over SendGrid's HTTP API instead of SMTP:
      # transport: sendgrid
      # sendgrid:
      #   from: "My App <notify@my-app.example.com>"
      #   # api_key defaults to the SENDGRID_API_KEY secret
      send_routine:
        _ref: modules/notifications/send-routine.yaml
```

`app_name` is required. `server_url` is the origin used to compose email link URLs — required when notification items carry page links. `send_routine` is an array of API routine steps that receives `{ event_ids }` in the payload — leave it empty to skip dispatch.

Apps with an existing email connection can remap `notifications-email` instead of setting the `email` vars (or `notifications-email-sendgrid` instead of the `sendgrid` vars when `transport: sendgrid`):

```yaml
modules:
  - id: notifications
    source: ...
    connections:
      notifications-email: my-app-smtp
```

## The dispatch pipeline

`dispatch-notifications` (exported InternalApi) is the generic pipeline. Payload:

```yaml
notification_id: quote-approved # id from the app's notifications: section
items: # one notification per item (or `item`, a single object)
  - key: "evt-1:UC-1" # optional dedup key
    contact: { _id: UC-1, email: jane@example.com, profile: { name: Jane } }
    send_email: true # optional, default true; false = inbox only
    cc: [] # optional
    bcc: [] # optional
    approver_name: Sam # everything else is template data
    links:
      button: { pageId: lead-view, urlQuery: { _id: L-1 } }
```

Per item the pipeline: mints the record id → `RenderNotification` (interpolates and renders the app's template; `{ pageId, urlQuery }` links resolve to landing URLs `{server_url}/{link page}?_id=<record>&option=<dataPath>`) → inserts the record — **before** sending, so the dedup key is claimed and concurrent dispatches cannot double-send (duplicate key → skip) → sends over `notifications-email` (or `notifications-email-sendgrid` when `transport: sendgrid`) → marks `sent` + `email_result`. A send failure never fails the dispatch: the record stays `sent: false` with `send_attempts` bumped and `last_attempt` set, ready for a drain retry.

The typical `send_routine` is one aggregation per event type that shapes items (recipient contact embed, template data, links) followed by a `CallApi` to `dispatch-notifications` — see the demo app's `apps/demo/modules/notifications/send-routine.yaml` for the reference implementation.

## Drain retry

`drain-notifications` (exported InternalApi) re-sends records left at `sent: false` by a failed send. Records store their render outputs, so a retry sends the stored email without re-rendering. Payload (all optional): `max_attempts` (default 5) — records at or past this many failed attempts are left alone; `limit` (default 50) — max records per run, oldest attempt first.

Each record is claimed with an optimistic lock (an update conditional on the `last_attempt` value the drain read) before sending, so overlapping drain runs cannot double-send. Only records with at least one failed attempt (`send_attempts >= 1`) drain — a record whose first send is still in flight is never raced, and legacy (Lambda-era) records, which lack the field, are never picked up.

The module ships no schedule of its own — apps choose the cadence with a small cron-only endpoint (see the demo app's `apps/demo/api/notifications-drain.yaml`):

```yaml
# api/notifications-drain.yaml — registered in the app's `api:` section
id: notifications-drain
type: InternalApi
schedules:
  - cron: "0 * * * *"
routine:
  - id: drain
    type: CallApi
    properties:
      endpointId:
        _module.endpointId:
          id: drain-notifications
          module: notifications
      payload: {}
```

## Record convention

The pipeline writes this shape; the inbox, bell, and link pages read it. Everything except lifecycle fields is yours to extend via `data`.

| Field                                                   | Purpose                                                                                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_id`                                                   | Record id (uuid, minted before render — landing links embed it)                                                                                                                                 |
| `key`                                                   | Dedup key (`null` when the item has none)                                                                                                                                                       |
| `type`                                                  | The notification config id — drives inbox badges via `enums.event_types`                                                                                                                        |
| `contact_id`, `contact`                                 | Recipient (flat id for queries; embedded `{ _id, email, profile }`)                                                                                                                             |
| `email`, `is_valid_email`                               | Normalized recipient address and validity (invalid → inbox only)                                                                                                                                |
| `subject`, `title`, `preview`, `body`, `text`           | Render outputs (`body` = HTML) — retries and drains never re-render                                                                                                                             |
| `data`                                                  | The ORIGINAL item — link targets stay as `{ pageId, urlQuery }` objects                                                                                                                         |
| `send_email`, `cc`, `bcc`                               | Delivery inputs                                                                                                                                                                                 |
| `sent`, `send_attempts`, `last_attempt`, `email_result` | Delivery lifecycle — `email_result.to` records the post-filter address mail actually went to (differs from `email` under a `replaceAddress` redirect); `filtered: true` = dropped by the filter |
| `read`                                                  | Inbox state (mark-as-read)                                                                                                                                                                      |
| `created.timestamp`, `created.app_name`                 | Ordering and app scoping                                                                                                                                                                        |

**`data` stores the original item, never the render result's resolved copy** — the link page reads `{ pageId, urlQuery }` targets back out of `data` at the `?option` dot-path; a resolved copy would redirect the landing page to itself.

Legacy (Lambda-era) records coalesce on read: the inbox falls back `description ?? preview`, badges and filters match `event_type ?? type`, and the link page falls back to the top-level `links.button` target.

## Required indexes

The pipeline's no-double-send guarantee depends on a unique partial index on `key` — **without it duplicate inserts succeed and the dedup does not exist**. The module cannot create indexes; create it with the app's index tooling (e.g. splice-actions):

```js
db.notifications.createIndex(
  { key: 1 },
  {
    unique: true,
    partialFilterExpression: { key: { $type: "string" } },
    name: "notification_key_unique",
  },
);
```

Partial rather than sparse because records store explicit `key: null`, and a sparse unique index still collides on explicit nulls.

## Deep-link and file-download pages

The `link` page resolves a notification id to its target page, marks the record read, and forwards the user. Pre-auth notification types (the `public_link_types` var, default `invite-user` / `resend-user-invite` / `user-invite` plus the user-admin module's scoped `user-admin/invite-user` / `user-admin/resend-user-invite`) can be resolved without a session, for flows where the recipient is not yet logged in.

Email links composed by the pipeline arrive as `?_id=<record>&option=<dataPath>`, where `option` is a dot-path into the record's `data` (e.g. `links.button`, `actions.0.link`). Absolute URL targets in `data` are followed as-is; legacy records resolve from their top-level `links.button`.

The `file-download` page is a redirector for notification attachments: params `_id` and `index` are required; it generates a presigned GET against `notifications-files-bucket-public` and forwards the browser.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions
- [Email transport](email-transport.md) — SMTP (default) or the SendGrid HTTP API, selected by the `transport` var
- [Migrate from an external Lambda pipeline](how-to/lambda-pipeline-migration.md) — coexistence model, hybrid wiring, and the per-type migration recipe

## Shared idioms

- [App name scoping](../shared/app-name.md) — how `app_name` scopes notifications
- [Secrets](../shared/secrets.md) — `MONGODB_URI`, `NOTIFICATIONS_SMTP_PASS`, `SENDGRID_API_KEY`, `FILES_S3_*` connection secrets
