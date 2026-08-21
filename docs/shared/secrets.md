---
type: shared
module: shared
title: Secrets
concepts:
  - secrets
  - environment variables
  - MONGODB_URI
  - S3
  - auth
  - email
  - SMTP
---

# Secrets

Master list of every secret read by modules in this repo. Bucket names, keys, and connection strings live in secrets so they stay out of version control.

| Secret                       | Modules         | Used for                                                                  |
| ---------------------------- | --------------- | ------------------------------------------------------------------------- |
| `MONGODB_URI`                | every module    | MongoDB connection string                                                 |
| `NOTIFICATIONS_SMTP_PASS`    | `notifications` | SMTP password for notification emails                                     |
| `SENDGRID_API_KEY`           | `notifications` | SendGrid API key for notification emails                                  |
| `FILES_S3_ACCESS_KEY_ID`     | `files`         | AWS access key for the file storage bucket                                |
| `FILES_S3_SECRET_ACCESS_KEY` | `files`         | AWS secret access key for the file storage bucket                         |
| `FILES_S3_BUCKET`            | `files`         | Private S3 bucket for file uploads                                        |
| `FILES_S3_BUCKET_PUB`        | `files`         | Public S3 bucket for files served without auth                            |
| `AUTH_SECRET`                | auth engine     | BetterAuth session/token signing secret                                   |
| `AUTH_FROM_ADDRESS`          | auth engine     | From address on auth emails (verify, reset, magic-link, invite)           |
| `SMTP_HOST`                  | auth engine     | SMTP host for auth email delivery                                         |
| `SMTP_PORT`                  | auth engine     | SMTP port                                                                 |
| `SMTP_SECURE`                | auth engine     | `"true"` for implicit TLS (e.g. port 465), else `"false"`                 |
| `SMTP_USER`                  | auth engine     | SMTP username (SendGrid: `apikey`)                                        |
| `SMTP_PASS`                  | auth engine     | SMTP password / provider API key                                          |
| `GOOGLE_CLIENT_ID`           | auth engine     | Google OAuth client id — only when the Google provider is configured      |
| `GOOGLE_CLIENT_SECRET`       | auth engine     | Google OAuth client secret — only when the Google provider is configured  |

"auth engine" secrets are read by the app-level `auth:` config that the `user-account` and `user-admin` modules run on — not declared per module. The notifications module's dispatch pipeline reads `NOTIFICATIONS_SMTP_PASS` / `SENDGRID_API_KEY` (defaults of its `email.pass` / `sendgrid.api_key` vars); any further steps an app adds to `notifications.send_routine` use whatever secrets that routine requires.

## By category

**MongoDB.** Every module declares `MONGODB_URI`. A single connection serves the whole app — modules don't need separate URIs.

**Email.** `NOTIFICATIONS_SMTP_PASS` is the notifications module's SMTP password secret (the default of its `email.pass` var). Set it to your provider key — a SendGrid API key, for example, since the module's SMTP connection works with any relay. `SENDGRID_API_KEY` is the SendGrid API key secret (the default of its `sendgrid.api_key` var), used when `transport: sendgrid` sends over the SendGrid HTTP API. A module can only reference secrets it declares, so to use a credential you already hold under a different name, remap the `notifications-email` (or `notifications-email-sendgrid`) connection to an app connection with its own secrets rather than pointing the var at it.

**File storage (S3).** Used by `files`. Two buckets: a private one (signed URLs, default for new uploads) and a public one (for assets served without auth).

**Auth (BetterAuth engine).** Required by any app deploying `user-account` / `user-admin`. `AUTH_SECRET` signs sessions. The `SMTP_*` set plus `AUTH_FROM_ADDRESS` drive email delivery for every auth flow (verification, password reset, magic-link, invitation) — the transport is fully env-driven, so the same config points at a local catcher in dev (e.g. Mailpit: `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, with `SMTP_USER`/`SMTP_PASS` set to any dummy value — Mailpit accepts any credentials, but they must be non-null or nodemailer throws `EAUTH`) and a real provider in prod (e.g. SendGrid: `smtp.sendgrid.net`, `465`, `SMTP_SECURE=true`, `SMTP_USER=apikey`, `SMTP_PASS=<api key>`). `SMTP_SECURE` is read as the string `"true"`/`"false"` — set `"true"` only for an implicit-TLS server. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are needed only when the Google OAuth provider is enabled.

## Region

`files.s3_region` is a **required** var — set it on the module entry. There's no default; the build will fail if it is missing.
