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

| Secret                       | Modules      | Used for                                                                 |
| ---------------------------- | ------------ | ------------------------------------------------------------------------ |
| `MONGODB_URI`                | every module | MongoDB connection string                                                |
| `FILES_S3_ACCESS_KEY_ID`     | `files`      | AWS access key for the file storage bucket                               |
| `FILES_S3_SECRET_ACCESS_KEY` | `files`      | AWS secret access key for the file storage bucket                        |
| `FILES_S3_BUCKET`            | `files`      | Private S3 bucket for file uploads                                       |
| `FILES_S3_BUCKET_PUB`        | `files`      | Public S3 bucket for files served without auth                           |
| `AUTH_SECRET`                | auth engine  | BetterAuth session/token signing secret                                  |
| `AUTH_FROM_ADDRESS`          | auth engine  | From address on auth emails (verify, reset, magic-link, invite)          |
| `SMTP_HOST`                  | auth engine  | SMTP host for auth email delivery                                        |
| `SMTP_PORT`                  | auth engine  | SMTP port                                                                |
| `SMTP_SECURE`                | auth engine  | `"true"` for implicit TLS (e.g. port 465), else `"false"`                |
| `SMTP_USER`                  | auth engine  | SMTP username (SendGrid: `apikey`)                                       |
| `SMTP_PASS`                  | auth engine  | SMTP password / provider API key                                         |
| `GOOGLE_CLIENT_ID`           | auth engine  | Google OAuth client id — only when the Google provider is configured     |
| `GOOGLE_CLIENT_SECRET`       | auth engine  | Google OAuth client secret — only when the Google provider is configured |

"auth engine" secrets are read by the app-level `auth:` config that the `user-account` and `user-admin` modules run on — not declared per module. `notifications.send_routine` is a separate, configurable routine on the consuming app and uses whatever secrets that routine requires.

## By category

**MongoDB.** Every module declares `MONGODB_URI`. A single connection serves the whole app — modules don't need separate URIs.

**File storage (S3).** Used by `files`. Two buckets: a private one (signed URLs, default for new uploads) and a public one (for assets served without auth).

**Auth (BetterAuth engine).** Required by any app deploying `user-account` / `user-admin`. `AUTH_SECRET` signs sessions. The `SMTP_*` set plus `AUTH_FROM_ADDRESS` drive email delivery for every auth flow (verification, password reset, magic-link, invitation) — the transport is fully env-driven, so the same config points at a local catcher in dev (e.g. Mailpit: `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, with `SMTP_USER`/`SMTP_PASS` set to any dummy value — Mailpit accepts any credentials, but they must be non-null or nodemailer throws `EAUTH`) and a real provider in prod (e.g. SendGrid: `smtp.sendgrid.net`, `465`, `SMTP_SECURE=true`, `SMTP_USER=apikey`, `SMTP_PASS=<api key>`). `SMTP_SECURE` is read as the string `"true"`/`"false"` — set `"true"` only for an implicit-TLS server. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are needed only when the Google OAuth provider is enabled.

## Region

`files.s3_region` is a **required** var — set it on the module entry. There's no default; the build will fail if it is missing.
