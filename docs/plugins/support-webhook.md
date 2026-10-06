---
title: SupportWebhook
module: plugins
type: reference
concepts: [webhook-verification]
---

# SupportWebhook

A connection with one request, `SupportWebhookVerify`, that checks a webhook delivery from Pelican's support desk was signed with the app's webhook secret. It is the verifier the `support` module's webhook endpoint runs in its `webhook: { verify }` gate, before the routine. Lowdefy answers 401 when verification fails, and a verified run is trusted.

## Usage

```yaml
connections:
  - id: support_webhook
    type: SupportWebhook
    properties:
      secret:
        _secret: SUPPORT_WEBHOOK_SECRET
```

```yaml
id: support-webhook
type: Api
webhook:
  verify:
    type: SupportWebhookVerify
    connectionId: support_webhook
    properties:
      rawBody:
        _payload: rawBody
      timestamp:
        _payload: headers.pelican-timestamp
      signature:
        _payload: headers.pelican-signature
routine:
  # runs only for a verified delivery
```

The verify gate evaluates the request's properties against `_payload` = `{ body, rawBody, query, headers }`, with header names lower-cased. `rawBody` must be the exact request text: the signature is over the bytes Pelican sent, and re-serialising `body` would change them.

## Connection properties

| Property | Type   | Description                                                                                                         |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `secret` | string | The webhook signing secret of the deployment's support app in Pelican. Without one, every delivery fails to verify. |

The connection holds no data, so the tenant wall never scopes it.

## `SupportWebhookVerify` request

| Property    | Type   | Description                                                             |
| ----------- | ------ | ----------------------------------------------------------------------- |
| `rawBody`   | string | The exact request body text.                                            |
| `timestamp` | string | The `Pelican-Timestamp` header: Unix seconds.                           |
| `signature` | string | The `Pelican-Signature` header: comma-separated `sha256=<hex>` entries. |

Returns `{ verified: true }` when both hold, otherwise `{ verified: false }`:

- **A signature matches.** Any `sha256=<hex>` entry equals the HMAC-SHA256, in hex, of `"{timestamp}.{rawBody}"` keyed with `secret`. Entries are compared in constant time. Pelican sends one entry per live secret, newest first, so while a rotated secret's old value is still live, a deployment holding either value verifies.
- **The timestamp is recent.** It is within 300 seconds of the server's clock, either side, so a captured delivery cannot be replayed later. A clock more than five minutes off Pelican's, ahead or behind, fails every delivery.

It never throws on bad input. A missing header, a non-numeric timestamp, an entry without `sha256=`, hex of the wrong length and a missing secret all fail verification.

## Signing a test delivery

```js
import { createHmac } from "node:crypto";

const timestamp = String(Math.floor(Date.now() / 1000));
const body = JSON.stringify({ event: "test", user_id: null, ticket: null });
const signature = `sha256=${createHmac("sha256", secret)
  .update(`${timestamp}.${body}`)
  .digest("hex")}`;
// Send body with headers Pelican-Timestamp: timestamp, Pelican-Signature: signature.
```
