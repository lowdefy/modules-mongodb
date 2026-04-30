# Files

File attachments backed by S3 — drag-drop upload with thumbnails, downloads, deletes, and category filters. Every file is stamped onto a parent entity (`{ collection, doc_id }`), so the same component drops onto contact pages, company pages, lot pages, etc.

The module ships three rendering components (`file-manager`, `file-card`, `file-list`) and the supporting connections, APIs, and audit hooks.

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | `file-card` wraps the layout `card` component |
| [events](../events/README.md) | `change_stamp` on writes; optional upload/delete event logging |

## How to Use

```yaml
modules:
  - id: files
    source: "github:lowdefy/modules-mongodb/modules/files@v0.2.0"
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

## Exports

### Components

- **`file-manager`** — `FileManager` block. Drag-drop upload, file-type icons, thumbnails, clipboard paste, progress bar, download, delete confirmation, optional form-fields modal, single-file and max-count modes.
- **`file-card`** — Layout card wrapper around `file-manager` for easy embedding on detail pages. See vars table below.
- **`file-list`** — Lightweight read-only file list using standard Lowdefy blocks (`S3Download` + `List`). No FileManager plugin required. Shows file name with download link and upload date.

#### `file-card` vars

| Var | Default | Description |
|---|---|---|
| `title` | `Files` | Card title |
| `entity_type` | — | Entity collection name (e.g. `lot`, `contact`) |
| `entity_id` | — | Entity document id |
| `file_category` | `null` | Filter / tag files by category |
| `view_only` | `false` | Hide upload and delete (display-only) |
| `disabled` | `false` | Disable upload button |
| `allow_delete` | `true` | Show delete buttons |
| `single_file` | `false` | Allow only one file (hides uploader when file exists) |
| `max_count` | `null` | Max number of files (hides uploader at limit) |
| `accept` | `*` | File-type filter (e.g. `.pdf,.jpg`, `image/*`) |
| `hint` | `Click or drag file to upload` | Dragger hint text |
| `file_title` | `null` | Optional title saved with every file |
| `block_id` | `file_manager` | Unique block id (when multiple on one page) |

`file-manager` accepts the same vars except `title`, plus `label` (Ant Design label wrapper config) and `modal_title` (form modal title, default `Upload File`).

`file-list` accepts `entity_type`, `entity_id`, `file_category`, and `block_id`.

### API Endpoints

| ID | Description |
|---|---|
| `save-file` | Upsert file metadata (with optional `metadata` object from form fields) after the S3 upload completes |
| `delete-file` | Soft-delete file metadata (sets `removed: true`) |

### Connections

| ID | Resource |
|---|---|
| `files-collection` | MongoDB collection `files` for file metadata |
| `files-bucket` | Private S3 bucket (signed URLs) |
| `files-bucket-public` | Public S3 bucket (assets served without auth) |

## Vars

### `s3_region` (required)

`string` — AWS region for both file buckets. No default; the build fails if missing.

### `log_events`

`boolean` — Default `true`. Log file upload / delete events through the `events` module. Set `false` to skip event logging.

### `components`

`object`

- **`file_list`** — *Deprecated.* Override block list rendered by the `file-list` component. Prefer `file-manager` or `file-card` going forward.

## Secrets

| Name | Used for |
|---|---|
| `MONGODB_URI` | MongoDB connection |
| `FILES_S3_ACCESS_KEY_ID` | AWS access key for both file buckets |
| `FILES_S3_SECRET_ACCESS_KEY` | AWS secret access key for both file buckets |
| `FILES_S3_BUCKET` | Private S3 bucket name |
| `FILES_S3_BUCKET_PUB` | Public S3 bucket name |

See [Secrets](../../docs/idioms.md#secrets).

## Plugins

- `@lowdefy/modules-mongodb-plugins` — `FileManager` block

## Notes

### File document schema

Documents in the `files` collection:

```js
{
  _id: "lot/20260402_120530/uuid/report.pdf",   // S3 key
  collection: "lot",                             // entity type
  doc_id: "lot-123",                             // entity id
  file: {
    name: "report.pdf",
    key: "lot/20260402.../report.pdf",
    bucket: "example-app-files",
    size: 245678,
    type: "application/pdf",
    thumbnail: "data:image/jpeg;base64,..."     // images only
  },
  file_title: "Lab Analysis Q1",                // optional
  file_category: "lab_results",                 // optional
  metadata: { valid_date: "2027-01-15" },        // from form fields
  created: { timestamp, user: { name, id } },
  updated: { ... },
  removed: null | true
}
```

### Form fields (extra metadata)

To capture extra metadata at upload time, nest blocks inside the `FileManager`'s form content area. Form-field values are read from state at `{block_id}.form` and saved to `metadata` on the file doc. See the [`FileManager` block README](../../plugins/modules-mongodb-plugins/src/blocks/FileManager/README.md) for the supported block types.
