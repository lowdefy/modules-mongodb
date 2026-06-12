---
"@lowdefy/modules-mongodb-files": patch
---

Files: read upload metadata from the file event and set the S3 `Content-Type` field directly.

- `upload-policy` now reads `file_name` / `file_type` from `_event: file.name` / `_event: file.type` instead of reconstructing the upload block's state path via `block_id`. This decouples the request from the consuming block's id and avoids a brittle `_state` lookup.
- The S3 POST policy now sets `Content-Type` as a fixed field (`_payload: file_type`) and drops the equivalent `eq $Content-Type` condition — the value is asserted by the field rather than gated by a policy condition.
- `file-manager` migrates its fetch/refresh Request actions to the `requestIds` array form with `holdValue: true`, matching the current Request action API.
