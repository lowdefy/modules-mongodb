---
'@lowdefy/modules-mongodb-notifications': minor
---

The notifications module now owns the full notification dispatch pipeline. Lowdefy's framework (≥ 5.4) renders notification emails from the app's `notifications:` config section via the `RenderNotification` step; this module composes everything around the render.

**Dispatch pipeline.** New exported `dispatch-notifications` InternalApi (payload `{ notification_id, items }`): per item it mints the record id, renders the app's template, inserts the notification record **before** sending (claiming the dedup `key` so concurrent dispatches cannot double-send; duplicate key → skip), sends over the new `notifications-email` SMTP connection, and records the send result. A send failure never fails the dispatch — the record stays `sent: false` with `send_attempts` bumped. `send_routine` remains the app's event-shaping hook (unchanged `{ event_ids }` contract) and now typically ends in a `CallApi` to `dispatch-notifications`.

**New vars.** `server_url` (origin for email link URLs), `email` (SMTP transport for `notifications-email` — or remap the connection to an app email connection), `public_link_types` (pre-auth link types, replacing the hardcoded invite checks). New secret `NOTIFICATIONS_SMTP_PASS` (default of `email.pass`).

**Required index.** Dedup depends on an app-managed unique partial index on `key` (`notification_key_unique`, partial on `key: { $type: 'string' }`) — documented in the module docs; the guarantee does not exist without it.

**Unified record convention.** Pipeline records write `type` (the notification config id), `preview`, and rendered `subject`/`body`/`text`; the inbox, badges, filters, and link page coalesce legacy Lambda-era fields on read (`description ?? preview`, `event_type ?? type`, top-level `links.button` fallback). The link page resolves framework landing links (`?_id=<record>&option=<dataPath>`) from the record's `data` at the `option` dot-path — records store the original `{ pageId, urlQuery }` link objects.

The demo app is the reference implementation: `notifications:` template configs, SMTP vars reusing the SendGrid relay, and a send_routine that shapes events into items and dispatches through the pipeline.
