---
title: Endpoints
module: files
type: reference
concepts: [files, access-check, upload-policy, download, tenant-wall]
---

# Files — Endpoints

Every file operation goes through one of the module's five API endpoints. Each loads what it acts on through the `files-collection` connection, so the tenant wall applies, and calls the app's [access check](../index.md#access-check) before it acts. A refusal rejects the call with a message the block shows.

Call them with `CallAPI` and `_module.endpointId`, for example `{ id: download-file, module: files }`.

## `list-files`

Payload `{ entity_type, entity_id, file_category? }`. Returns the record's live file records, newest first, as stored, with `file.bucket` included. With `file_category`, only that category.

## `upload-policy`

Payload `{ entity_type, entity_id, file: { name, type, size } }`. Returns the presigned POST policy (`url`, `fields`, `key`, `bucket`, `method`) for one upload.

The key is made on the server:

```
{organization_id}/files/{entity_type}/{entity_id}/{YYYYMMDD_HHmmssSSS}/{uuid}/{name}
```

`/` in the name becomes `-`. The policy limits the upload to `max_file_size` bytes and fixes `Content-Type` to the declared type (`application/octet-stream` when the browser gives none), so S3 refuses anything else. The policy stamps `x-amz-meta-uploaded-by-id` and `x-amz-meta-uploaded-by-name` from the session.

Refuses when:

- the caller has no organization;
- `entity_type` or `entity_id` is empty or contains `/`;
- `file.size` is over `max_file_size`;
- `allowed_content_types` is set and `file.type` is not in it.

## `save-file`

Payload `{ entity_type, entity_id, key, thumbnail?, file_title?, file_category?, metadata? }`. Records the uploaded file and returns `{ fileId }`, the key.

Refuses when:

- the key is not in the exact shape `upload-policy` mints, under the caller's organization and this `entity_type` and `entity_id`;
- a record with that key exists, deleted ones included;
- no object is stored at the key.

The record's `_id` is the key. Its `file` holds `name` (the key's last segment), `key`, `bucket`, `size` and `type` (from S3, not the payload) and `thumbnail`. The thumbnail is kept only when it is a `data:image/` URL of 16 KB or less. `file_category` is `metadata.file_category` when set, else `file_category`. With `log_events`, it logs an `upload-file` event.

## `download-file`

Payload `{ file_id }`. Loads the live record with that `_id` and returns `{ url }`, a link signed for the key stored on the record. A deleted record, or one in another organization, is refused as not found. Records saved before keys carried the organization download the same way.

## `delete-file`

Payload `{ file_id }`. Loads the live record and soft-deletes it. The `entity_type` and `entity_id` given to the access check and to the `delete-file` event come from the record, not the payload. Returns `{ success: true }`.
