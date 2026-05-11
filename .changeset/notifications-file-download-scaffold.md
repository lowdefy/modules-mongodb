---
"@lowdefy/modules-mongodb-notifications": patch
---

Add scaffold for a public file-download flow on notification attachments — new `file-download` Box page, `notifications-files-bucket-public` AwsS3Bucket connection (backed by `FILES_S3_ACCESS_KEY_ID` / `FILES_S3_SECRET_ACCESS_KEY` / `FILES_S3_BUCKET_PUB` secrets and the `s3_region` var), and `get_notification_file` / `download_notification_file` requests. The page resolves the indexed file from `$files` on a notification, generates a presigned S3 GET, and redirects the browser. Not yet exported via `module.lowdefy.yaml` — scaffolding only, not consumable until the manifest wires up the page and connection.
