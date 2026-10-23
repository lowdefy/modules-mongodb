---
"@lowdefy/modules-mongodb-files": major
---

**Breaking: every file operation goes through a files module endpoint, and downloads are signed from the stored record.** Before, any signed-in user who held a file's key could get a download link for it, whatever organization or record it belonged to, and could save a record over another file's key. The page requests that signed or listed by a key the browser sent are removed.

- **New endpoints:** `list-files`, `upload-policy`, `save-file`, `download-file` and `delete-file`. Each loads what it acts on through the walled `files-collection` connection. `download-file` takes `{ file_id }` and returns `{ url }`, signed for the key on the record. `delete-file` takes `{ file_id }` and reads the record type and id from the record.
- **Upload keys are made on the server**, under `{organization_id}/files/{entity_type}/{entity_id}/{timestamp}/{uuid}/{name}`. `upload-policy` refuses a caller with no organization and a `/` in the record type or id. `save-file` takes `{ entity_type, entity_id, key, thumbnail?, file_title?, file_category?, metadata? }` and refuses a key `upload-policy` did not mint for the caller's organization and that record, a key any record already holds (deleted ones included), and a key with nothing uploaded. Size and type now come from S3, and a thumbnail is kept only when it is a `data:image/` URL of 16 KB or less.
- **New vars:** `access_check: { endpoint_id }` names an app endpoint the five endpoints call with `{ operation, entity_type, entity_id, file_id }`; only `{ allowed: true }` lets the operation go ahead, and `{ allowed: false, message }` stops it with that message. `max_file_size` (default 25 MB) caps uploads in the policy. `allowed_content_types` limits the types `upload-policy` accepts.
- **Removed:** the `get-entity-files`, `upload-policy` and `download-policy` page requests and the `download-policy` component export. An app that `_ref`s the `download-policy` export, or calls `save-file` with a `file` object or `delete-file` with `entity_type` and `entity_id`, must move to the endpoints above.

Existing files are not moved. Records keep their keys, and `download-file` signs them because it goes by the record.
