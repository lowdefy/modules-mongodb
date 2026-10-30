---
"@lowdefy/modules-mongodb-files": minor
---

**New `file` link endpoint: every file has a stable link on the app's own domain.** A `GET` on `/api/endpoints/<files entry>/file/<key>` loads the live file record with that key, runs the app's `access_check` with `operation: download`, and answers `302` to an S3 link signed for 60 seconds. The link can be opened in a new tab, copied or kept, because each open checks the caller's session and access again. Images (`png`, `jpeg`, `gif`, `webp`) and PDFs open in the browser; every other type downloads under its file name, so an uploaded HTML or SVG file never runs as a page. A signed-out caller gets `401`, and every other refusal (not found, deleted, another organization's, refused by `access_check`) a `404` with no body. Needs Lowdefy 7.2.0 or later. `download-file` is unchanged.
