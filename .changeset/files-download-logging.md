---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-files": minor
---

Log file downloads for parity with upload/delete auditing. The `FileManager`
block now fires an `onDownload` event (payload `{ fileDoc }`) when a download is
initiated. The `file-manager` / `file-card` components expose a new `on_download`
var (action list, default `[]`) for consumer-supplied handlers, and — when
`log_events` is on — record a `download-file` event via the events module,
matching how uploads and deletes are logged.
