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

Both transports send the same thing: the pipeline's `RenderNotification` step produces the final HTML and text, and the send step is a pure transport for the rendered message. `email_result` on the notification record captures the delivery outcome:

- `transport` — which transport delivered it (`smtp` or `sendgrid`).
- `messageId` — the provider message id.
- `to` — the post-filter address mail actually went to. When a `filter.replaceAddress` redirect is active this differs from the record's `email` (the intended recipient), making the redirect visible in the data.
- `filtered` — `true` when the filter (`allowlist`/`regex`) dropped the send entirely and nothing was delivered.
- `timestamp` — when the send completed.

On Lowdefy versions where the mail send requests do not yet return per-message results, `messageId` and `to` are null and `filtered` is false.

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
        # api_key defaults to the SENDGRID_API_KEY secret — set that
        # env var to your SendGrid API key.
```

Optional `sendgrid.*` vars:

- `reply_to` — reply-to address, defaults to `from`.
- `filter` — a SendGridMail recipient filter (`{ replaceAddress, allowlist, regex }`) to redirect or restrict outgoing mail in non-production environments. The record's `email_result.to` shows where mail actually went after the filter. Types in `filter_exempt_types` bypass it — see [Auth-flow exemption](#auth-flow-exemption-from-the-recipient-filter).
- `sandbox` — enable SendGrid sandbox mode; SendGrid validates the send without delivering. Useful for testing the pipeline end to end.

## Auth-flow exemption from the recipient filter

A recipient filter is a non-production safety net, but some notification types are useless when redirected: an invite email that lands in the team inbox instead of the invitee's cannot be actioned, while login emails (sent by the auth provider, outside this pipeline) always reach the real recipient. The `filter_exempt_types` var closes that gap — mail for the listed notification types skips the filter entirely and delivers to the actual recipient, on both transports:

```yaml
modules:
  - id: notifications
    source: ...
    vars:
      sendgrid:
        filter:
          replaceAddress: team-inbox@example.com
      # The default — the pre-auth invite flows (the same set as
      # public_link_types). Set to [] to filter every type.
      filter_exempt_types:
        - invite-user
        - resend-user-invite
        - user-invite
        - user-admin/invite-user
        - user-admin/resend-user-invite
```

How it works: the module's email connections resolve their `filter` property per send against the dispatch payload's `notification_id` — an exempt type folds the filter to null, anything else gets the configured filter. A send with no `notification_id` stays filtered (fail-safe). The record's `email_result.to` makes the outcome visible either way: the real recipient for exempt types, the redirect address for the rest.

Exempting a type means those emails DO reach real users from filtered environments — that is the point, but keep the list to flows that need it. Apps that remap `notifications-email` / `notifications-email-sendgrid` to their own connection own their filter outright, and the exemption does not apply.

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

The SMTP transport supports the same recipient filter as SendGrid via the `email.filter` var (`{ replaceAddress, allowlist, regex }`), with the same `filter_exempt_types` exemption.

## See also

- [Notifications](index.md) — the dispatch pipeline, record convention, and required indexes
- [Vars](reference/vars.md) — the `transport`, `email.*`, and `sendgrid.*` vars and connection remaps
