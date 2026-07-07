---
title: Email transport (why SMTP)
module: notifications
type: reference
---

# Email transport — why SMTP, and using SendGrid

The dispatch pipeline sends email with a single, fixed step — the `SMTPMailSend` request over the module's `notifications-email` connection. That connection must be an **`SMTP`-type** connection. This page explains why, and how to use a provider like SendGrid within that constraint.

## Requests are bound to a connection type

In Lowdefy a request type belongs to a specific connection type — the connection plugin declares which requests it provides, and a request's resolver is looked up from that connection's own request set:

- `@lowdefy/connection-smtp` → connection `SMTP`, request `SMTPMailSend`
- `@lowdefy/connection-sendgrid` → connection `SendGridMail`, request `SendGridMailSend`

`SMTPMailSend` exists only on an `SMTP` connection. `SendGridMailSend` exists only on a `SendGridMail` connection. Their request schemas differ too — `SMTPMailSend` takes a plain mail object (`to`/`cc`/`bcc`/`subject`/`text`/`html`), while `SendGridMailSend` takes SendGrid-specific fields (`dynamicTemplateData`, `templateId`, `sendAt`). They are not interchangeable.

## The pipeline hardcodes `SMTPMailSend`

The module's `dispatch-notification-item` routine has a fixed send step:

```yaml
- id: send_mail
  type: SMTPMailSend                      # the request type is baked into the routine
  connectionId:
    _module.connectionId: notifications-email
```

Because the step issues `SMTPMailSend`, the `notifications-email` connection it targets **must be an `SMTP` connection** — that is the only connection type that provides that request.

## Why remapping to a SendGrid connection does not work

Remapping the module connection (`connections: { notifications-email: my-app-conn }`) only changes **which connection instance** the step uses. It does **not** change the request **type** the step issues — the routine still says `type: SMTPMailSend`. Point it at a `SendGridMail` connection and you would be asking a SendGrid connection to run a request it does not have, which fails. The request type and the connection type are two ends of one binding; only the module's YAML controls the request type, so an app cannot swap it from config.

## SendGrid still works — over its SMTP relay

This constraint is about the SendGrid **connection type**, not about SendGrid. SendGrid (like SES, Postmark, Mailgun, Resend, and self-hosted servers) offers an **SMTP relay**, so you keep your SendGrid account, authenticated domain, and deliverability — you just reach it through an `SMTP` connection instead of the `SendGridMail` connection:

```yaml
# An app SMTP connection pointed at SendGrid's relay, remapped onto the module.
connections:
  - id: app-smtp
    type: SMTP
    properties:
      host: smtp.sendgrid.net
      port: 465
      secure: true
      auth:
        user: apikey
        pass:
          _secret: SENDGRID_API_KEY
      from: My App <notify@example.com>

modules:
  - id: notifications
    source: ...
    connections:
      notifications-email: app-smtp        # must be an SMTP-type connection
```

Or, without a remap, set the module's `email.*` vars to the same relay values (`host: smtp.sendgrid.net`, `user: apikey`) and put your SendGrid key in the `NOTIFICATIONS_SMTP_PASS` secret.

## What you give up, and when it matters

Reaching SendGrid over SMTP forgoes the HTTP-API-only features — server-side dynamic templates, and event/analytics that tie to API sends. In practice that rarely matters here: the framework's `RenderNotification` step already produces the final HTML and text, so SendGrid's server-side templating is redundant — the pipeline just needs a transport for the rendered message, and SMTP is that transport.

## Why the pipeline is SMTP-only (and how to change it)

One neutral transport — SMTP — reaches every provider, so a single send step serves everyone. Choosing `SendGridMailSend` instead would have made the pipeline SendGrid-only. The cost is exactly this page's topic: you cannot route sending through a provider's HTTP API from app config.

If a provider's HTTP API is genuinely required, the fix is a module change, not an app one: make the send step a configurable slot (a module var, like `send_routine` already is) so the app injects `SendGridMailSend` — or any send request — and the module orchestrates around it. The framework already ships both request types; only the module's hardcoded `SMTPMailSend` is the limiter.

## See also

- [Notifications](index.md) — the dispatch pipeline, record convention, and required indexes
- [Vars](reference/vars.md) — the `email` SMTP vars and connection remap
