---
type: shared
module: shared
title: Secrets
concepts:
  - secrets
  - environment variables
  - MONGODB_URI
  - S3
---

# Secrets

Master list of every secret read by modules in this repo. Bucket names, keys, and connection strings live in secrets so they stay out of version control.

| Secret                       | Modules         | Used for                                          |
| ---------------------------- | --------------- | ------------------------------------------------- |
| `MONGODB_URI`                | every module    | MongoDB connection string                         |
| `NOTIFICATIONS_SMTP_PASS`    | `notifications` | SMTP password for notification emails             |
| `SENDGRID_API_KEY`           | `notifications` | SendGrid API key for notification emails          |
| `FILES_S3_ACCESS_KEY_ID`     | `files`         | AWS access key for the file storage bucket        |
| `FILES_S3_SECRET_ACCESS_KEY` | `files`         | AWS secret access key for the file storage bucket |
| `FILES_S3_BUCKET`            | `files`         | Private S3 bucket for file uploads                |
| `FILES_S3_BUCKET_PUB`        | `files`         | Public S3 bucket for files served without auth    |

## By category

**MongoDB.** Every module declares `MONGODB_URI`. A single connection serves the whole app — modules don't need separate URIs.

**Email.** `NOTIFICATIONS_SMTP_PASS` is the notifications module's SMTP password secret (the default of its `email.pass` var). Set it to your provider key — a SendGrid API key, for example, since the module's SMTP connection works with any relay. `SENDGRID_API_KEY` is the SendGrid API key secret (the default of its `sendgrid.api_key` var), used when `transport: sendgrid` sends over the SendGrid HTTP API. A module can only reference secrets it declares, so to use a credential you already hold under a different name, remap the `notifications-email` (or `notifications-email-sendgrid`) connection to an app connection with its own secrets rather than pointing the var at it.

**File storage (S3).** Used by `files`. Two buckets: a private one (signed URLs, default for new uploads) and a public one (for assets served without auth).

## Region

`files.s3_region` is a **required** var — set it on the module entry. There's no default; the build will fail if it is missing.
