---
"@lowdefy/modules-mongodb-companies": minor
---

Add an optional top-level `short_name` field to the companies module for narrow display contexts (reports, chart axes, dense tables). The field appears on the create/edit form, the view-page core descriptions, the list table (between Name and Description), and the Excel export. Existing documents without `short_name` render blank in those surfaces — no migration needed; the field is `undefined` on omitted submits and is simply absent from the stored doc.

Apps that want `short_name` to drive selectors, table titles, and event templates can set `name_field: short_name` on the module entry — the existing escape hatch already supports it.
