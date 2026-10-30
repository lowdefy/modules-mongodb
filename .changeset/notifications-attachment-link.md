---
"@lowdefy/modules-mongodb-notifications": major
---

**Notification attachments need sign-in, and open only for the notification's recipient.** The `file-download` page is no longer public, so a signed-out recipient who opens an emailed attachment link goes through the app's sign-in and lands back on it. The page now forwards to a new `file` link endpoint, `/api/endpoints/<notifications entry>/file/<notification_id>/<index>`, which answers `302` to a 60-second link on `notifications-files-bucket-public` only when the caller is the notification's recipient (`contact_id` or `user_id` equal to their user id, the inbox's rule). Anything else gets a bare `404`. Images and PDFs open in the browser; other types download under the file's `name`. Needs Lowdefy 7.2.0 or later.

Emailed links keep their `file-download?_id=&index=` shape, so templates don't change. A forwarded email no longer opens the attachment for anyone else. A recipient who cannot sign in, or whose notification names their user id as neither `contact_id` nor `user_id`, can no longer open its attachments.
