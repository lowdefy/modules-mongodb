---
"@lowdefy/modules-mongodb-notifications": minor
---

Export the `file-download` page and `notifications-files-bucket-public` connection from the notifications module. Previously shipped as scaffolding in `0.4.2` but not consumable; the manifest now wires the page, the public S3 connection, and the supporting secrets so notification templates can link to `/{entryId}/file-download?_id={notification._id}&index={file_index}` to redirect recipients to a presigned S3 URL for an attachment without requiring them to be logged in.

**Secrets to add:** `FILES_S3_ACCESS_KEY_ID`, `FILES_S3_SECRET_ACCESS_KEY`, `FILES_S3_REGION`, `FILES_S3_BUCKET_PUB` — share with the `files` module by convention when both are installed.

No new vars are required on the module entry.
