---
title: Email transport (SMTP or SendGrid)
module: notifications
type: reference
---

# Email transport — SMTP or SendGrid

The dispatch pipeline sends email over one of two transports, selected by the `transport` var:

- `transport: smtp` (default) — an `SMTPMailSend` request over the module's `notifications-email` connection (`SMTP` type), configured via the `email.*` vars.
- `transport: sendgrid` — a `SendGridMailSend` request over the module's `notifications-email-sendgrid` connection (`SendGridMail` type, the SendGrid HTTP API), configured via the `sendgrid.*` vars.

Any other value throws on dispatch.

## Why a switch, not a remap

In Lowdefy a request type belongs to a specific connection type — the connection plugin declares which requests it provides:

- `@lowdefy/connection-smtp` → connection `SMTP`, request `SMTPMailSend`
- `@lowdefy/connection-sendgrid` → connection `SendGridMail`, request `SendGridMailSend`

`SMTPMailSend` exists only on an `SMTP` connection, and `SendGridMailSend` only on a `SendGridMail` connection. Remapping a module connection (`connections: { notifications-email: my-conn }`) only changes **which connection instance** a step uses, never the request **type** the step issues — so a remap alone can never switch transports. The `transport` var switches the send step itself; the module ships both steps and the build keeps only the selected branch live.

Both transports send the same thing: the pipeline's `RenderNotification` step produces the final HTML and text, and the send step is a pure transport for the rendered message. `email_result.transport` on the notification record says which one delivered it (`messageId` is recorded for SMTP; SendGrid's API does not return one through the request).

## Using SendGrid over its HTTP API

```yaml
modules:
  - id: notifications
    source: ...
    vars:
      app_name: my-app
      transport: sendgrid
      sendgrid:
        from: My App <notify@example.com>
        # api_key defaults to the NOTIFICATIONS_SENDGRID_KEY secret — set that
        # env var to your SendGrid API key.
```

Optional `sendgrid.*` vars:

- `reply_to` — reply-to address, defaults to `from`.
- `filter` — a SendGridMail recipient filter (`{ replaceAddress, allowlist, regex }`) to redirect or restrict outgoing mail in non-production environments.
- `sandbox` — enable SendGrid sandbox mode; SendGrid validates the send without delivering. Useful for testing the pipeline end to end.

Apps with an existing `SendGridMail` connection (for example one whose API key lives under a different secret name) remap the connection instead of setting the vars:

```yaml
modules:
  - id: notifications
    source: ...
    vars:
      transport: sendgrid
    connections:
      notifications-email-sendgrid: my-app-sendgrid
```

Note `transport: sendgrid` is still required — the remap picks the connection instance, the var picks the send step.

## Using SendGrid over its SMTP relay

The default SMTP transport reaches SendGrid (and SES, Postmark, Mailgun, Resend, or a self-hosted server) through its SMTP relay — no `transport` var needed:

```yaml
modules:
  - id: notifications
    source: ...
    vars:
      email:
        host: smtp.sendgrid.net
        port: 465
        secure: true
        user: apikey
        # pass defaults to the NOTIFICATIONS_SMTP_PASS secret — set that env
        # var to the SendGrid API key.
        from: My App <notify@example.com>
```

Or remap `notifications-email` to an existing app `SMTP` connection. The relay and the HTTP API deliver the same rendered message; prefer the HTTP API when outbound SMTP ports are blocked in your environment, or when you want SendGrid features tied to API sends (event webhooks, categories).

## See also

- [Notifications](index.md) — the dispatch pipeline, record convention, and required indexes
- [Vars](reference/vars.md) — the `transport`, `email.*`, and `sendgrid.*` vars and connection remaps
