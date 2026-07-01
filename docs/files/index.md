---
title: Files
module: files
type: index
---

# Files

File attachments backed by S3 — drag-drop upload with thumbnails, downloads, deletes, and category filters. Every file is stamped onto a parent entity (`{ collection, doc_id }`), so the same component drops onto contact pages, company pages, or any entity page.

The module ships three rendering components (`file-manager`, `file-card`, `file-list`) and the supporting connections, APIs, and audit hooks.

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
    source: "github:lowdefy/modules-mongodb/modules/files@v0.8.1"
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

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Secrets](../shared/secrets.md) — `MONGODB_URI`, `FILES_S3_*` connection secrets
