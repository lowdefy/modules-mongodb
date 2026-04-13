# Files — Vars

## Module Vars

- **`collection`** — MongoDB collection name for file metadata. Default: `files`.
- **`s3_region`** — AWS region for S3 buckets. Default: `ca-central-1`.
- **`log_events`** — Log file upload/delete events via the events module. Default: `true`. Set `false` to disable.
- **`components`** — Override for file_list (deprecated — use file-manager instead).

## Secrets

Bucket names and credentials are read from secrets (not vars), so they stay out of version control:

- `FILES_S3_ACCESS_KEY_ID` — AWS access key
- `FILES_S3_SECRET_ACCESS_KEY` — AWS secret key
- `FILES_S3_BUCKET` — Private bucket name
- `FILES_S3_BUCKET_PUB` — Public bucket name

## Components

### file-card

Layout card wrapping `file-manager`. Drop into any detail page:

```yaml
_ref:
  module: files
  component: file-card
  vars:
    entity_type: lot
    entity_id:
      _url_query: _id
```

| Var | Default | Description |
|---|---|---|
| `title` | `Files` | Card title |
| `entity_type` | — | Entity collection name (e.g. `lot`, `contact`) |
| `entity_id` | — | Entity document ID |
| `file_category` | `null` | Filter/tag files by category |
| `view_only` | `false` | Hide upload and delete (display-only) |
| `disabled` | `false` | Disable upload button |
| `allow_delete` | `true` | Show delete buttons |
| `single_file` | `false` | Allow only one file (hides uploader when file exists) |
| `max_count` | `null` | Max number of files (hides uploader at limit) |
| `accept` | `*` | File type filter (e.g. `.pdf,.jpg`, `image/*`) |
| `hint` | `Click or drag file to upload` | Dragger hint text |
| `file_title` | `null` | Optional title saved with every file |
| `block_id` | `file_manager` | Unique block ID (use when multiple on one page) |

### file-manager

Unified component using the FileManager React block. Handles upload (drag-drop, paste), file list display (icons, thumbnails), download, delete confirmation, and optional form modal.

Same vars as file-card (except `title`), plus:

| Var | Default | Description |
|---|---|---|
| `label` | `null` | Ant Design Label wrapper config |
| `modal_title` | `Upload File` | Form modal title |

### file-list

Lightweight read-only file list using standard Lowdefy blocks (S3Download + List). No FileManager plugin required. Shows file name with download link and upload date.

```yaml
_ref:
  module: files
  component: file-list
  vars:
    entity_type: lot
    entity_id:
      _url_query: _id
```

| Var | Default | Description |
|---|---|---|
| `block_id` | `file_list` | Unique block ID (use when multiple on one page) |
| `entity_type` | — | Entity collection name |
| `entity_id` | — | Entity document ID |
| `file_category` | `null` | Filter files by category |

## File Document Schema

Documents in the `files` collection:

```js
{
  _id: "lot/20260402_120530/uuid/report.pdf",  // S3 key
  collection: "lot",                            // entity type
  doc_id: "lot-123",                            // entity ID
  file: {
    name: "report.pdf",
    key: "lot/20260402.../report.pdf",
    bucket: "hydra-files",
    size: 245678,
    type: "application/pdf",
    thumbnail: "data:image/jpeg;base64,..."     // images only
  },
  file_title: "Lab Analysis Q1",               // optional
  file_category: "lab_results",                // optional
  metadata: { valid_date: "2027-01-15" },       // from form fields
  created: { timestamp, user: { name, id } },
  updated: { ... },
  removed: null | true
}
```

## Form Fields (Extra Metadata)

To add custom form fields shown in a modal on upload, nest blocks inside
the FileManager's `form` content area. Form field values are read from
state at `{block_id}.form` and saved to the `metadata` field on the file doc.

Example with a "Valid Until" date field:

```yaml
_ref:
  module: files
  component: file-card
  vars:
    entity_type: lot
    entity_id:
      _url_query: _id
    file_category: certificates
    title: Certificates
    # form_fields would require extending the file-manager component
    # with content area blocks — see FileManager block docs
```
