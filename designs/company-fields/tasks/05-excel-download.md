# Task 5: Strip section-specific Excel columns

## Context

`modules/companies/components/excel_download.yaml:25-70` hard-codes Excel columns for every standard field, including all the keys this design moves into opt-in sections:

```yaml
- column: registered_name
  value: registered_name
- column: registration_number
  value: registration_number
- column: vat_number
  value: vat_number
- column: website
  value: website
- column: email
  value: contact.primary_email
- column: phone
  value: contact.primary_phone
```

After this design those keys all live under section sub-objects (or are gone entirely from the document root in the case of the registration scalars). The fixed-column list collapses to the same universal-core surface as the rest of the design: `id`, `name`, `description`, `updated_at`, `created_at`. Apps that want any registration / contact / address / attribute columns add them through the existing `components.download_columns` slot.

## Task

Edit `modules/companies/components/excel_download.yaml`. Replace the schema's `_build.array.concat` block (lines 25-70) with the trimmed fixed columns + the existing `download_columns` slot + timestamps:

```yaml
schema:
  _build.array.concat:
    - - column: id
        value: _id
        type: String
        width: 12
      - column: name
        value: display_name
        type: String
        width: 25
      - column: description
        value: description
        type: String
        width: 30
    - _module.var: components.download_columns
    - - column: updated_at
        value: updated_at
        type: String
        width: 15
      - column: created_at
        value: created_at
        type: String
        width: 15
```

Leave the rest of the file (button props, `onClick` events, `fetch_excel_data` action, `xlsx_download` filename / dateFormat / data) unchanged.

`name` reads via `display_name`, which is the `$getField` alias added in `requests/get_company_excel_data.yaml:62-66`, driven by `name_field` (defaults to `name` after task 2). No request edits needed.

`updated_at` and `created_at` come from the `$dateToString` projection in `requests/get_company_excel_data.yaml:67-74` — also unchanged.

## Acceptance Criteria

- `excel_download.yaml`'s fixed columns are exactly: `id`, `name`, `description`, `updated_at`, `created_at`.
- No fixed columns for `registered_name`, `registration_number`, `vat_number`, `website`, `email`, `phone`.
- The `components.download_columns` slot still sits between the universal-core columns and the timestamps.
- An export from a freshly seeded demo (after task 6) lands a `.xlsx` with exactly those five default columns plus whatever the consumer wires through `download_columns`.

## Files

- `modules/companies/components/excel_download.yaml` — modify (the `schema` array in the `xlsx_download` action)

## Notes

Verify the demo's `apps/demo/modules/companies/vars.yaml` (after task 6) doesn't pass `download_columns` — leaving it empty exercises the universal-core-only path. If the demo wants to demonstrate the slot, add a few section columns there alongside the wiring of the SA presets.
