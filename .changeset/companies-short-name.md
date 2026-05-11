---
"@lowdefy/modules-mongodb-companies": minor
---

Add a `short_name` top-level field to the companies module for narrow display contexts (reports, chart axes, dense tables). The field is **required** on the create/edit form and is surfaced on the view-page core descriptions, the list table (between Name and Description), the Excel export, and the create/update API payloads.

Toggled by a new `short_name.enabled` var (default `true`, opt-out). When set to `false`, every surface referencing `short_name` — form input, view row, table column, Excel column, API payload — is omitted at build time and the field is absent from new documents. Existing documents that already carry `short_name` keep the value on disk but won't render or be written until re-enabled.

Apps that want `short_name` to drive selectors, table titles, and event templates can additionally set `name_field: short_name` on the module entry — the existing escape hatch already supports it.
