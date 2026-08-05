---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-files": minor
---

Files: file rows can now show read-only tags from a file's metadata.

The files module's `file-manager` and `file-card` gain a `metadata_tags` var — a list of `{ key, label, when, color }` entries. Each renders a small tag under a file row when that file's metadata field matches (any truthy value, or an exact match when `when` is set), in both editable and read-only views. This lets a surface flag files inline — for example an "Available to client" tag — without a bespoke file list. Tags are display-only and never affect upload, save, or delete.
