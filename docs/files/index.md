---
title: Files
module: files
type: index
---

# Files

File attachments backed by S3 — drag-drop upload with thumbnails, downloads, deletes, and category filters. Every file is stamped onto a parent entity (`{ collection, doc_id }`), so the same component drops onto contact pages, company pages, or any entity page.

The module ships three rendering components (`file-manager`, `file-card`, `file-list`), the five endpoints every file operation goes through, and the supporting connections and audit hooks.

## Dependencies

| Module                       | Why                                                            |
| ---------------------------- | -------------------------------------------------------------- |
| [layout](../layout/index.md) | `file-card` wraps the layout `card` component                  |
| [events](../events/index.md) | `change_stamp` on writes; optional upload/delete event logging |

## When to use

Add `files` when an app needs file attachments on any entity — documents, images, or any binary asset linked to a record. Integrates with `companies`, `contacts`, and `activities` via their `files` dependency and sidebar slot wiring.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: files
    source: "github:lowdefy/modules-mongodb/modules/files@v2.0.0"
    vars:
      s3_region: us-east-1
```

`s3_region` is required. Bucket names and credentials come from secrets. Drop a file card onto any detail page:

```yaml
- _ref:
    module: files
    component: file-card
    vars:
      title: Files
      entity_type: lot
      entity_id:
        _url_query: _id
```

The `file-manager`, `file-card` and `file-list` components list, upload, save, download and delete through the module's endpoints, so a page needs no requests of its own for them. A component lists on mount, and `file-manager` lists again after each save and delete.

## Access check

Listing, uploading, saving, downloading and deleting files each go through a module endpoint (see [Endpoints](reference/endpoints.md)). Every one loads what it acts on through the walled `files-collection` connection, so one organization never reaches another's files, and downloads are signed from the key stored on the record, never from a key the browser sends.

Inside one organization, only the app knows who may see a record. Name an app endpoint in `access_check` to decide:

```yaml
modules:
  - id: files
    source: "github:lowdefy/modules-mongodb/modules/files@v2.0.0"
    vars:
      s3_region: us-east-1
      access_check:
        endpoint_id: files-access-check
```

Before each operation the module calls it with:

```yaml
operation: download # list, upload, save, download or delete
entity_type: lot
entity_id: lot-1
file_id: org-a/files/lot/lot-1/… # null for list and upload
```

It answers `{ allowed: true }` to let the operation go ahead, or `{ allowed: false, message }` to stop it; the module rejects with `message`, and the block shows it. Without `access_check`, every signed-in member of the organization passes. Declare the endpoint as `InternalApi` so browsers cannot call it directly. `apps/tenant-demo/api/files-access-check.yaml` is a worked example.

The check can be asked about a record that is not saved yet. The activities module mints `activity_id` before the activity is saved, so files can be uploaded while it is being written. The endpoint decides what to answer for a record it cannot find, for example by allowing `upload` and `save` for the record type the caller may create.

`max_file_size` (25 MB by default) caps every upload, and `allowed_content_types` limits the types `upload-policy` accepts.

## Reference

- [Endpoints](reference/endpoints.md) — the five file endpoints, their payloads and refusals
- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Secrets](../shared/secrets.md) — `MONGODB_URI`, `FILES_S3_*` connection secrets
