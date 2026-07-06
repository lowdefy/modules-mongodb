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
| `FILES_S3_ACCESS_KEY_ID`     | `files`         | AWS access key for the file storage bucket        |
| `FILES_S3_SECRET_ACCESS_KEY` | `files`         | AWS secret access key for the file storage bucket |
| `FILES_S3_BUCKET`            | `files`         | Private S3 bucket for file uploads                |
| `FILES_S3_BUCKET_PUB`        | `files`         | Public S3 bucket for files served without auth    |

## By category

**MongoDB.** Every module declares `MONGODB_URI`. A single connection serves the whole app — modules don't need separate URIs.

**Email (SMTP).** `NOTIFICATIONS_SMTP_PASS` is the default of the notifications module's `email.pass` var. The var accepts any secret operator, so apps reusing an existing credential (e.g. `_secret: SENDGRID_API_KEY` for SendGrid's SMTP relay) don't need to define it. Apps that remap the `notifications-email` connection to their own email connection skip it entirely.

**File storage (S3).** Used by `files`. Two buckets: a private one (signed URLs, default for new uploads) and a public one (for assets served without auth).

## Region

`files.s3_region` is a **required** var — set it on the module entry. There's no default; the build will fail if it is missing.
