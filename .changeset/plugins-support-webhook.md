---
"@lowdefy/modules-mongodb-plugins": minor
---

**New `SupportWebhook` connection with a `SupportWebhookVerify` request.** It checks that a webhook delivery from Pelican's support desk was signed with the app's webhook secret: any `sha256=<hex>` entry in `Pelican-Signature` must be the HMAC-SHA256 of `"{Pelican-Timestamp}.{rawBody}"`, and the timestamp must be within five minutes of the server's clock. It is meant for an endpoint's `webhook: { verify }` gate, and fails verification rather than throwing on bad input. See `docs/plugins/support-webhook.md`.
