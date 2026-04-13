# Data Upload — Vars

## Required

- **`tool`** — Tool configuration object. Must include:
  - `id` — tool identifier (e.g., load_lots)
  - `label` — display name (e.g., Load Lots)
  - `target_collection` — MongoDB collection for the entity
  - `id_column` — field name used as row identity
  - `discard_column` — field name for discard flag
  - `columns` — array of `{ field, type }` for AgGrid and download
  - `api.process_staged` — endpoint ID for confirm processing
  - `api.discard_staged` — endpoint ID for discard
  - `s3_prefix` — S3 key prefix for uploads
  - `timestamp_column` — spreadsheet column with timestamp
  - `timestamp_field` — MongoDB field path for staleness check

## Optional

- **`change_stamp`** — Change stamp template for audit fields. Defaults to module's internal stamp.
