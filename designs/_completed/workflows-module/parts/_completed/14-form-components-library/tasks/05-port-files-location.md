# Task 5: Port files + location components

## Context

Task 1 settled the per-file shape (`vars: / config:` plain YAML, no Nunjucks, no hardcoded block IDs) and shipped `text_input.yaml` as the canonical worked example. `modules/workflows/components/fields/PORTING.md` carries the replacement table and rules for tasks 2–7.

This task ports three components whose current implementations are the most Nunjucks-heavy in the library — they have build-time branches that conditionally include large sub-trees:

- `file_upload` — `Label` wrapper around an `S3UploadDragger`. The current source uses `{% if required %}` and a nested `{% if singleFile %} / {% else %}` to swap between two `validate` rules (single-file done-status check vs multi-file array-length check).
- `file_download` — `Label` wrapper around an `S3Download`. Hardcoded block ids (`download_label`, `file_download`) that must derive from `{ _var: key }` after porting.
- `location` — `GoogleAPIProvider` (or `Box` if `disableScript: true`) wrapping a `PlacesAutocomplete` and an optional coordinates block. The most complex component in the library. Uses `{% if coordinates_title %}` to conditionally emit the coordinates label and `_build.if` / `_build.eq` / `_build.env` / `_build.object.assign` / `_build.array.concat` for build-time logic.

## Task

Port each component from `modules/workflows/components-current/edit/{name}.yaml.njk` to `modules/workflows/components/fields/{name}.yaml` following `PORTING.md`.

### Per-component notes

**`file_upload`** — Source: `components-current/edit/file_upload.yaml.njk`.

- Vars: `key` (required), `title`, `visible` (default `true`), `required` (default `false`), `singleFile` (default `false`), `accept` (default `null`), `label` (default `Click or drag to add files.`), `label_disabled` (default `true`), `s3PostPolicyRequestId` (default `upload_files`).
- Convert the outer `{% if required %}` into a `validate` that uses `_build.if: { test: { _var: required }, then: ..., else: [] }`.
- Inside the `then` branch, replace the inner `{% if singleFile %}` with `_build.if: { test: { _var: singleFile }, then: [<single-file rule>], else: [<multi-file rule>] }`.
- The single-file rule passes when `_eq: [{ _state: { _string.concat: [{ _var: key }, ".file.status"] } }, done]`. The multi-file rule passes when `_gt: [{ _array.length: { _state: { _string.concat: [{ _var: key }, ".fileList"] } } }, 0]`.
- Wrapper `Label` id is the existing `{{ key }}.uploader_validation_label` pattern — port to `{ _string.concat: [{ _var: key }, ".uploader_validation_label"] }`. Inner `S3UploadDragger` id is `{ _var: key }`.

**`file_download`** — Source: `components-current/edit/file_download.yaml.njk`.

- Vars: `key` (required — drives wrapper id), `title`, `visible` (default `true`), `fileList` (required), `label_disabled` (default `true`), `s3GetPolicyRequestId` (default `file_download_policy`).
- Replace the hardcoded `id: download_label` with `{ _string.concat: [{ _var: key }, "_download_label"] }`. Replace inner `id: file_download` with `{ _var: key }`.
- Note: current source uses `span: 8 / marginTop: 6px` inline literals — keep them.

**`location`** — Source: `components-current/edit/location.yaml.njk`.

- Vars: `key` (required), `title` (required — interpolated inline), `visible` (default `true`), `required` (default `false`), `disabled` (default `false`), `disableScript` (default `false`), `events` (default `{}`), `label_inline` (default `false`), `label_span`, `extra`, `coordinates_title` (default `null` — gates emission of the coordinates label sub-tree).
- The outer block type is `_build.if: { test: { _build.eq: [{ _var: disableScript }, true] }, then: Box, else: GoogleAPIProvider }`. Already in the source — preserve.
- The `{% if coordinates_title %}` branch in the source must become a `_build.if` that emits the coordinates `Label` + two `NumberInput` blocks in the `then` branch and nothing in `else`. Use `_build.array.concat` to splice the conditional sub-tree onto the static `PlacesAutocomplete` block in `blocks:` (one builds: `[<places block>] ++ _build.if(coordinates_title)`).
- Inner block ids:
  - `PlacesAutocomplete` → `{ _var: key }`.
  - Coordinates `Label` → `{ _string.concat: [{ _var: key }, "_label"] }`.
  - Lat input → `{ _string.concat: [{ _var: key }, ".geometry.location.lat"] }`.
  - Lng input → `{ _string.concat: [{ _var: key }, ".geometry.location.lng"] }`.
- `title: {{ title }}` interpolation on the `PlacesAutocomplete` becomes `title: { _var: title }`.
- The commented `{# requestOptions: includedRegionCodes: ['za'] #}` block — **drop entirely** in the port.

## Acceptance Criteria

- `file_upload.yaml`, `file_download.yaml`, `location.yaml` exist under `modules/workflows/components/fields/`.
- Each has top-level `vars:` and `config:`, no Nunjucks syntax, no hardcoded block IDs (block IDs derive from `{ _var: key }` via `_string.concat` where needed).
- Each parses as valid YAML.
- `location.yaml` preserves the `disableScript` → `Box`-vs-`GoogleAPIProvider` build-time branch and the `coordinates_title` → emit-coordinates-block build-time branch.

## Files

- `modules/workflows/components/fields/file_upload.yaml` — create
- `modules/workflows/components/fields/file_download.yaml` — create
- `modules/workflows/components/fields/location.yaml` — create

## Notes

- `location.yaml` is the most complex port in the library — read the full source file before starting, and consider porting it last within this task once `file_upload` and `file_download` have shaken out the build-time-branch patterns.
- `_build.env` is preserved as-is (`_build.env: GOOGLE_MAPS_API_KEY`) — not a Nunjucks construct, an operator that reads the build environment.
- `Lowdefy operator dot-notation composition` (CLAUDE.md) — operator results that evaluate to strings are valid as ids and as `_state` keys. The pattern `{ _state: { _string.concat: [...] } }` is the canonical way to derive a state path from `{ _var: key }`.
