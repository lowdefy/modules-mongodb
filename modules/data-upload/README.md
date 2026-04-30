# Data Upload

Generic spreadsheet-import staging — upload an Excel file, review the parsed rows, then confirm or discard. Each app instance configures one **tool** (target collection, columns, processing API), and gets a tabbed page with the upload control and a staging table.

This module is intended to be added once **per upload tool** — different tools use different module entry ids and pass different `tool` configs. The processing API is supplied by the consuming app, since it knows how to map staged rows into target documents.

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | Page wrapper |
| [events](../events/README.md) | Audit logging |

## How to Use

```yaml
modules:
  - id: upload-companies
    source: "github:lowdefy/modules-mongodb/modules/data-upload@v0.1.1"
    vars:
      s3_region: us-east-1
      tool:
        id: upload-companies
        label: Upload Companies
        target_collection: companies
        id_column: _id
        columns:
          - field: _id
            type: String
            required: true
          - field: description
            type: String
            required: true
        api:
          process_staged: process-staged-companies
        s3_prefix: tools/load_companies
        view_page:
          _module.pageId:
            module: companies
            id: company-detail
```

The consuming app must define an API endpoint with the id given in `tool.api.process_staged` to process the staged rows into the target collection.

See `apps/demo/modules/data-upload/load_companies.yaml` for the worked example wired to upload companies.

## Exports

### Pages

| ID | Description | Path |
|---|---|---|
| `data-upload` | Tabbed upload + staging review page | `/{entryId}/data-upload` |

### API Endpoints

| ID | Description |
|---|---|
| `set-status-discard` | Bulk-discard the selected staged rows (sets the discard status without touching the target collection) |

### Connections

| ID | Resource |
|---|---|
| `data_upload_stage` | MongoDB collection for staged rows |
| `target_collection` | Read-only MongoDB connection to the tool's target collection (e.g. `companies`) |
| `sync_bucket` | S3 connection for upload staging files |
| `imports` | MongoDB connection for `imports` audit collection |

### Menus

| ID | Contents |
|---|---|
| `default` | Single link to the upload page |

## Vars

### `s3_region` (required)

`string` — AWS region for the upload staging S3 bucket. No default; the build fails if missing.

### `tool` (required)

`object` — Tool config. Required properties:

- **`id`** — Unique tool identifier used in staging records and API calls.
- **`label`** — Display name shown in page title, breadcrumbs, and menu.
- **`target_collection`** — MongoDB collection name for the tool's target data.
- **`id_column`** — Spreadsheet column whose value is treated as the unique row identifier.
- **`columns`** — Array of column definitions for the upload template. Each entry: `{ field, type, required }`. `field` is the spreadsheet header / row key; `type` is the column data type (used in the download template, e.g. `String`); `required` flags columns that must be present on every uploaded row.
- **`api.process_staged`** — Endpoint id for the process-staged API (defined by the consuming app).
- **`s3_prefix`** — S3 key prefix for uploaded files.
- **`view_page`** — Page id for linking staged rows to their detail view. `null` (default) disables links.

## Secrets

| Name | Used for |
|---|---|
| `MONGODB_URI` | MongoDB connection |
| `SYNC_S3_ACCESS_KEY_ID` | AWS access key for the staging bucket |
| `SYNC_S3_SECRET_ACCESS_KEY` | AWS secret access key for the staging bucket |
| `SYNC_S3_BUCKET` | Staging bucket name |

See [Secrets](../../docs/idioms.md#secrets).

## Plugins

- `@lowdefy/community-plugin-mongodb`
- `@lowdefy/community-plugin-xlsx` — spreadsheet parsing and template download

## Notes

The `process_staged` API and the discard logic operate on the `data-upload-stage` collection. The module never writes directly to `tool.target_collection` — that's the consuming app's responsibility, exposed through the `process_staged` endpoint.
