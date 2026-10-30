---
title: Endpoints
module: files
type: reference
concepts: [files, access-check, upload-policy, download, file-link, tenant-wall]
---

# Files — Endpoints

Every file operation goes through one of the module's API endpoints. Each loads what it acts on through the `files-collection` connection, so the tenant wall applies, and calls the app's [access check](../index.md#access-check) before it acts. A refusal rejects the call with a message the block shows.

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

## `file`

A file's stable link, a link endpoint (`link: true`) that answers a `GET`, not a `CallAPI`:

```
/api/endpoints/<files entry>/file/<key>
```

`<key>` is the file record's `_id`, which is its key, so files saved before keys carried the organization have links too. Encode each segment of the key with `encodeURIComponent` and keep its `/` separators. Prefix the app's base path when it sets one (`_location: basePath` in YAML).

The endpoint loads the live record with that key, runs the access check with `operation: download`, and answers `302` to a link signed for the key on the record. The signed link expires after 60 seconds, since the browser follows the redirect at once. The answer carries `Cache-Control: private, no-store`.

The signed link sets the file's content type and its `Content-Disposition`. `image/png`, `image/jpeg`, `image/gif`, `image/webp` and `application/pdf` open in the browser (`inline`); every other type downloads (`attachment`), so an uploaded HTML or SVG file never runs as a page. Both carry the file's name as `filename*=UTF-8''<name>`.

Refusals have no body:

- `401` when the caller is signed out;
- `404` for everything else: a key no live record holds, a deleted record, another organization's record, a record the access check refuses, and an empty key. One status for all of them keeps an outsider from learning which keys exist, and the access check's message is not shown.

The link has no host, so it works on every domain the app is served on, each checked with that domain's session.

## `delete-file`

Payload `{ file_id }`. Loads the live record and soft-deletes it. The `entity_type` and `entity_id` given to the access check and to the `delete-file` event come from the record, not the payload. Returns `{ success: true }`.
