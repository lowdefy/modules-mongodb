# Notifications

How to wire up the notifications module, create notification types, and trigger notifications from API routines.

## Pattern

The notification system spans three layers: the **framework** (email template rendering via the `notifications:` config section and the `RenderNotification` step), the **notifications module** (dispatch pipeline, inbox UI, bell badge, deep-link routing), and the **app** (template configs, event shaping, SMTP credentials). The old external Lambda pipeline (consume + send via SQS/SendGrid) is retired — everything runs inside the Lowdefy server.

**Framework layer**: The app's `notifications:` config section defines email templates: `{ id, type, properties }` where the type is a React Email template (`NotificationEmail`, `DigestEmail`, `AlertEmail`, or a custom plugin). Properties are nunjucks data templates (`{{ approver_name }} approved your quote.`) interpolated against each dispatched item — interpolated values are inert and can never inject markup. The `RenderNotification` routine step renders one item and returns `{ subject, title, preview, html, text, data }`; the module's pipeline calls it for you.

**Module layer**: The `notifications` module provides the dispatch pipeline plus inbox, bell badge, and deep-link pages. `dispatch-notifications` (exported InternalApi) takes `{ notification_id, items }` and, per item: renders the template, inserts the notification record (with dedup on `key`), sends the email over the transport selected by the `transport` var (`smtp` default via the `notifications-email` connection, or `sendgrid` via the `notifications-email-sendgrid` SendGrid HTTP API connection), and records the send result. A send failure never fails the dispatch — the record stays `sent: false` with `send_attempts` bumped.

**App layer**: The app supplies module vars (`app_name`, `server_url`, `email` SMTP credentials or `transport: sendgrid` + `sendgrid` credentials — or a connection remap — and `send_routine`) and the `send_routine` — API routine steps that shape app events into notification items and `CallApi` `dispatch-notifications`.

**Triggering flow**: An API routine creates an event, then calls the notifications module's `send-notification` endpoint with `event_ids`. The app's `send_routine` aggregates those events into items (recipient contact, template data, page links) and dispatches them.

## Data Flow

```
App API routine (e.g., invite-user, quote approval)
  → Creates event in events collection (via events module CallApi)
  → Calls send-notification endpoint with event_ids
  → send_routine aggregation shapes items: { key, contact, links, ...template data }
  → CallApi dispatch-notifications { notification_id, items }
  → Per item (dispatch-notification-item):
      → Mint record id (_uuid) — landing links embed it
      → RenderNotification: interpolate + render the app's template config
      → Insert record { contact_id, type, subject, title, preview, body, text, data, sent: false, ... }
        (duplicate key → already dispatched → skip)
      → Send via the selected transport (SMTP or SendGrid API) → mark sent + email_result
        (failure → $inc send_attempts, record stays for a drain retry)
  → User sees notification in inbox (filtered by contact_id + app_name)
  → Bell badge shows unread count
  → Email button → link page (?_id=<record>&option=<dataPath>) marks read → redirects to target
```

## Variations

**Simple notification** — single recipient. The send_routine branch matches the event, embeds the recipient contact, projects the item:

```yaml
- id: shape_example
  type: MongoDBAggregation
  connectionId:
    _module.connectionId: { id: events-collection, module: events }
  properties:
    pipeline:
      - $match: { _id: { $in: { _payload: event_ids } }, type: example-event }
      - $lookup:
          from: user-contacts
          localField: contact_id
          foreignField: _id
          as: recipient_contact
      - $set: { recipient_contact: { $first: $recipient_contact } }
      - $project:
          _id: 0
          key: { $concat: [$_id, ":", $contact_id] } # dedup key
          contact:
            _id: $recipient_contact._id
            email: $recipient_contact.email
            profile: { name: $recipient_contact.profile.name }
          entity_title: $title # template data — addressable as {{ entity_title }}
          links:
            button: { pageId: target-page, urlQuery: { _id: $_id } }
- id: dispatch_example
  type: CallApi
  properties:
    endpointId:
      _module.endpointId: { id: dispatch-notifications, module: notifications }
    payload:
      notification_id: example-event
      items:
        _step: shape_example
```

**Multi-recipient notification** — the aggregation produces one item per recipient (e.g. `$unwind` over a subscriber lookup before `$project`). `dispatch-notifications` loops all items.

**Inbox-only notification** — project `send_email: false` on the item; the record is stored for the inbox but no email is sent.

**Scheduled notifications** — a scheduled endpoint (`schedules: [{ cron }]`) runs the same shape → dispatch steps.

## Anti-patterns

- **Don't `$merge` notification documents directly from a send_routine** — dispatch through `dispatch-notifications` so rendering, dedup, and email delivery happen. (The store-only `$merge` pattern survives only as a test mock in workflows-test.)
- **Don't hardcode URLs in item links** — use `{ pageId, urlQuery }` objects. The render step resolves them against `server_url`, routing through the link page for mark-as-read.
- **Don't store the render result's `data` on the record** — store the original item. The link page reads `{ pageId, urlQuery }` targets back out of `data` at the `?option` dot-path; resolved copies would redirect the landing page to itself. (The module pipeline already does this correctly.)
- **Don't skip the dedup index** — the unique partial index on `key` (see the module docs) is what makes concurrent dispatches safe. Without it, duplicate inserts succeed and double-sends are possible.
- **Don't forget the enum entry** — records write `type: <notification_id>`; add a matching key to the app's `event_types` enum additions for badge colors/titles in the inbox.

## Reference Files

**Module:**

- `modules/notifications/module.lowdefy.yaml` — module manifest with vars (`server_url`, `transport`, `email`, `sendgrid`, `public_link_types`), exports, dependencies
- `modules/notifications/api/dispatch-notifications.yaml` — batch entry point: validate → `:for` items → CallApi per item
- `modules/notifications/api/dispatch-notification-item.yaml` — the per-item pipeline: render → insert with dedup → send → bookkeeping
- `modules/notifications/connections/notifications-email.yaml` — SMTP connection fed by the `email.*` vars (remappable)
- `modules/notifications/connections/notifications-email-sendgrid.yaml` — SendGrid HTTP API connection fed by the `sendgrid.*` vars (remappable, used when `transport: sendgrid`)
- `modules/notifications/pages/all.yaml` — two-column inbox: list (span 10) + detail (span 14), filters, pagination
- `modules/notifications/pages/link.yaml` — deep-link router: fetch → pre-auth check → auth check → mark read → redirect via `data` at the `option` dot-path
- `modules/notifications/components/notification-config.yaml` — bell badge config (count, icon, link)
- `modules/notifications/components/unread-count-request.yaml` — unread count aggregation ($match + $count)

**App wiring (this demo app):**

- `apps/demo/lowdefy.yaml` — the `notifications:` template config section (`quote-approved`; invites are module-shipped)
- `apps/demo/modules/notifications/vars.yaml` — `server_url` + `transport: sendgrid` with `sendgrid` vars (SendGrid HTTP API)
- `apps/demo/modules/notifications/send-routine.yaml` — one shape → dispatch branch (quote approval); invites no longer shaped here
- `apps/demo/modules/events/event_types.yaml` — enum entries for `quote-approved` + scoped `user-admin/*` invite badges
- `modules/user-admin/notifications/` — module-shipped invite templates (scoped `user-admin/invite-user`)
- `modules/user-admin/api/invite-user.yaml` — direct dispatch to dispatch-notifications with `_module.notificationId`

## Template

### Notification config (app `notifications:` section)

```yaml
notifications:
  - id: "{notification-id}"
    type: NotificationEmail
    properties:
      subject: "{Subject with {{ item_field }} template vars}"
      title: "{Heading above the message}"
      message: "{Body text with {{ item_field }} template vars — markdown allowed}"
      button:
        label: "{CTA label}" # links to the item's links.button
```

### Triggering from an API routine

```yaml
# In an API routine (e.g., api/create-{entity}.yaml), after creating the event:
- id: send-notification
  type: CallApi
  properties:
    endpointId:
      _module.endpointId:
        id: send-notification
        module: notifications
    payload:
      event_ids:
        - _step: new-event.eventId
```

## Checklist

- [ ] Module vars: `app_name`, `server_url`, and transport credentials — `email` SMTP vars, or `transport: sendgrid` + `sendgrid` vars (or a connection remap) — set in the app's module config
- [ ] `notifications:` config section defines a template per notification type, `subject` required
- [ ] send_routine branch: `$match` events → embed recipient `contact` (`_id`, `email`, `profile.name`) → project `key` + template data + `links` → CallApi `dispatch-notifications`
- [ ] Links use `pageId` + `urlQuery` objects (not hardcoded URLs) — the render step resolves them per environment via `server_url`
- [ ] Dedup `key` projected on every item (event id + recipient id is the convention)
- [ ] Unique partial index `notification_key_unique` on `key` exists in the app database (see module docs — the dedup guarantee needs it)
- [ ] Notification id has a matching key in the app's `event_types` enum additions for badge colors/titles
- [ ] `testData` on the notification config for `lowdefy emails` preview rendering
