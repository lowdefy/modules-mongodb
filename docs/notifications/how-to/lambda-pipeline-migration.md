---
title: Migrate from an external Lambda pipeline
module: notifications
type: how-to
concepts: [coexistence, migration, send_routine, legacy-records]
---

# Migrate from an external Lambda pipeline

Some production apps predate this module and deliver notifications through their own external pipeline — typically a consume Lambda that resolves recipients and writes notification records, an SQS queue, and a send Lambda over SendGrid. Those apps do **not** have to migrate: the module and an external pipeline can run side by side in one app indefinitely, and when an app does migrate, it migrates one notification type at a time. This page explains the coexistence model, the hybrid wiring, and the migration recipe.

## The coexistence model

Three properties of the module make coexistence work; none of them need a flag or setting:

- **`send_routine` is the delivery seam.** The module never sends anything on its own initiative — the `send-notification` endpoint's entire body is the app-supplied `send_routine`, and email only goes out when something calls `dispatch-notifications`. A `send_routine` that hands event ids to an external Lambda is exactly as valid as one that shapes items and dispatches in-process. An empty `send_routine` is a no-op.
- **Both systems share the `notifications` collection by design.** The module's read paths scope every query by `created.app_name` and `contact_id`, so records written by an external pipeline appear in the module's inbox and bell alongside module-written ones — one inbox, regardless of which side delivered the email.
- **Reads coalesce legacy field names.** The inbox falls back `description ?? preview`, badges and filters match `event_type ?? type`, and the link page falls back to a record's top-level `links.button` target. Records written by a Lambda-era pipeline render and deep-link without any data migration.

## The one rule: each type is owned by exactly one pipeline

Route a notification type through your Lambda's job registry **or** through a `send_routine` branch — never both. Both sides route per event type (`$match` branches in the `send_routine`, a job map in the consume Lambda), so this is easy to hold, but nothing can enforce it: the module cannot see what an external pipeline handles, and the dedup `key` index only prevents double-sends within the module's own pipeline. A type registered on both sides double-sends.

Two smaller boundaries of the same kind:

- **Recipient filters don't cross over.** The module's `email.filter` / `sendgrid.filter` fail-safes govern only module sends; an external pipeline needs its own non-prod redirect.
- **The [drain](../index.md#drain-retry) only retries module-written records.** It matches on `send_attempts >= 1`, which legacy records don't carry — an external pipeline keeps its own retry (SQS redelivery), and neither side retries the other's mail.

## Hybrid wiring: module UI, Lambda delivery

The halfway house is stable and production-proven: the module provides the bell, inbox, deep links, and the standard `send-notification` trigger endpoint, while the existing Lambda keeps doing recipient resolution and email delivery. The `send_routine` is a single handoff step:

```yaml
# modules/notifications/send-routine.yaml — hand event ids to the consume Lambda
- id: create_notifications
  type: AxiosHttp
  connectionId: consume-notifications # AxiosHttp connection to the Lambda's HTTP trigger
  properties:
    method: post
    data:
      ids:
        _payload: event_ids
```

App code triggers notifications identically in both worlds: log an event, then `CallApi` the module's `send-notification` endpoint with `event_ids`. Adopting this wiring changes no delivery behavior — it standardizes the trigger path and gives the app the module UI.

## Migrating one type

1. **Add the template** to the app's `notifications:` config section (subject/title/message/button), replacing the Lambda's template config for that type.
2. **Add a `send_routine` branch** for the type: `$match` the event type, embed the recipient contact, project the dedup `key`, template data, and `{ pageId, urlQuery }` links, then `CallApi` `dispatch-notifications`. See [the dispatch pipeline](../index.md#the-dispatch-pipeline).
3. **Remove the type from the Lambda's job registry** in the same release — this is the ownership handover; skipping it double-sends.
4. Add the type to the app's `event_types` enum additions for inbox badges.

Trigger points in app code do not change: the event insert and the `send-notification` call with `event_ids` are the same contract on both sides. When the Lambda's registry is empty, decommission the queue and functions.

## Upgrade warning: invites move to the module

`user-admin` (≥ 0.9) ships its invite templates inside the module and dispatches them directly through `dispatch-notifications` — invites do **not** pass through the app's `send_routine`, so a hybrid app's Lambda stops seeing them on upgrade. Before upgrading `user-admin`, configure the notification module's email transport (the `email` vars, or `transport: sendgrid` + `sendgrid` vars, or a connection remap). If no transport is configured, invite sends fail into retry bookkeeping — the invite API still returns success and the mail silently never arrives.

## What migration does NOT require

- **No data migration** — legacy records render in the inbox and resolve on the link page as-is.
- **No trigger-point changes** — the `event_ids` contract is identical.
- **No flag or mode** — coexistence and migration are wiring, not configuration.
- **No deadline** — a dormant module (only `app_name` set) alongside a fully external pipeline is a supported end state, as is the hybrid.
