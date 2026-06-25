---
type: shared
module: shared
title: Slots
concepts:
  - fields
  - components
  - request_stages
  - page extension
---

# Slots

Modules that ship list / detail / edit pages expose **slots** so consumers can extend each page without forking the YAML. Three slot vars are conventional:

- `fields` — input blocks rendered in edit forms and as labelled rows in detail views.
- `components` — block arrays appended to specific page regions (table columns, filters, sidebar tiles, etc.).
- `request_stages` — MongoDB pipeline stages spliced into the module's read or write pipelines.

Used by `companies`, `contacts`, `user-account`, and `user-admin`.

## Why slots

Modules ship working list/edit/view pages straight away. Apps still need to add fields ("trading name plus internal code"), filter on extra columns, append sidebar tiles, or transform reads. Slots let you do that by passing config through `vars`, instead of copying the entire page YAML and editing it (which forks the doc and breaks the next module update).

## Conventions

**`fields`** is an object whose properties are named field groups. Each group is an array of input blocks. Groups vary per module (`attributes`, `profile`, `global_attributes`, `app_attributes`, …). Block ids must be prefixed with the group name (`attributes.industry`, `profile.email`, …) so they bind to the matching state path.

**`components`** is an object whose properties are named regions. Common regions:

- `table_columns` — extra columns on the list page.
- `filters` — extra filter blocks below the search bar on the list page.
- `main_slots` — extra blocks appended to the main column on detail pages.
- `sidebar_slots` — extra blocks appended to the sidebar.
- `download_columns` — extra columns in CSV / spreadsheet exports.

Modules document their full set of regions in their per-module README.

**`request_stages`** is an object whose properties are named pipeline points:

- `filter_match` — `$match` stage applied during list filtering.
- `get_all_*` — stages appended to the list-page read pipeline.
- `selector` — stages appended to the selector dropdown's read pipeline.
- `write` — stages appended to write pipelines (create/update).

## Worked example — companies

Add an "Industry" attribute to the company form and a matching column to the list:

```yaml
- id: companies
  source: "github:lowdefy/modules-mongodb/modules/companies@v0.8.1"
  vars:
    fields:
      attributes:
        - id: attributes.industry
          type: Selector
          properties:
            label: Industry
            options:
              - Manufacturing
              - Services
              - Retail
    components:
      table_columns:
        - field: attributes.industry
          headerName: Industry
          width: 160
```

The `attributes.industry` block binds to `state.attributes.industry`, the form persists it under `attributes.industry` on the company doc, and the list table renders the column directly from the same path.
