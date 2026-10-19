---
"@lowdefy/modules-mongodb-notifications": minor
---

**The notifications module owns the dispatch pipeline around Lowdefy's notification render.** Lowdefy renders notification emails from the app's `notifications:` config through the `RenderNotification` step; the module composes the rest. See `docs/notifications/index.md`.

- **`dispatch-notifications`** (exported InternalApi, payload `{ notification_id, items }`): per item it mints the record id, renders the app's template, inserts the record before sending (claiming the dedup `key`, so concurrent dispatches cannot double-send), sends, and records the result. A failed send never fails the dispatch: the record stays `sent: false` with `send_attempts` bumped. `send_routine` keeps its `{ event_ids }` contract and typically ends in a `CallApi` to `dispatch-notifications`.
- **`drain-notifications`** (exported InternalApi) re-sends records a failed send left unsent, from their stored render, claiming each with an optimistic lock so overlapping runs cannot double-send. The module ships no schedule: call it from a cron-only endpoint of the app's own. Under `policy: tenant` it retries each record bound to its `organization_id`, which Lowdefy accepts only in a trusted system run, so call it from a schedule.
- **Transports.** `transport: smtp` (default, the `notifications-email` connection, configured by the `email` vars with the `NOTIFICATIONS_SMTP_PASS` secret) or `sendgrid` (`notifications-email-sendgrid`, the `sendgrid` vars with `SENDGRID_API_KEY`). Either connection can be remapped to the app's own.
- **Recipient filters.** `email.filter` and `sendgrid.filter` take `{ replaceAddress, allowlist, regex }`. Left null they fall back to the current Lowdefy environment's `email.filter`, and `server_url` (the origin of email links) falls back to the environment's `url`, so an app that declares `config.environments` can leave them unset. Types in the new `filter_exempt_types` var (default: the pre-auth invite types) always reach the real recipient. `email_result` on the record shows where the mail actually went.
- **Links.** A notification link is `{ pageId, pathParams?, urlQuery?, input? }`; the landing page and the inbox's View button follow `pathParams`. `public_link_types` names the link types the `link` page resolves without a session.
- **Public pages.** The manifest contributes `link`, `invalid` and `file-download` to `auth.pages.public`, so they can come out of the app's own list. The inbox (`all`) stays protected.
- **Tenant wall.** Every notification write keeps the wall; none uses `tenant: none`.

**Required index:** dedup needs a unique partial index on `key` (`notification_key_unique`, partial on `key: { $type: 'string' }`). Without it the guarantee does not exist. Two read indexes on `user_id` / `contact_id` with `created.app_name` and `created.timestamp` keep the inbox fast; see the module docs.

Auth emails (verify, magic link, invitation) are sent by the auth engine through `auth.email`, not through this pipeline.
