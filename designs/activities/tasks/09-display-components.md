# Task 9: Internal Display Components

## Context

After Tasks 1 + 7, the module skeleton and request files exist. This task builds four internal display components consumed by the module's own pages (Task 14):

- `view_activity` — SmartDescriptions block for the detail page.
- `table_activities` — AgGridBalham table for the list page.
- `filter_activities` — filter panel block for the list page.
- `excel_download` — Excel export trigger button.

Reference shapes:
- `modules/companies/components/view_company.yaml` — SmartDescriptions detail. Template for `view_activity.yaml`.
- `modules/companies/components/table_companies.yaml` — AgGrid table. Template for `table_activities.yaml`.
- `modules/companies/components/filter_companies.yaml` — filter panel. Template for `filter_activities.yaml`.
- `modules/companies/components/excel_download.yaml` — Excel button. Template for `excel_download.yaml`.

## Task

### `modules/activities/components/view_activity.yaml`

SmartDescriptions block showing the activity's fields read-only. Consumed by `pages/view.yaml` (Task 14).

Sections:
- **Type** — typed chip with color + icon (looked up from the merged `activity_types` enum at render time via `_get` against `state.<doc>.type`).
- **Title** — plain text.
- **Description** — rendered Tiptap HTML (the description block in display mode, or a Raw HTML block).
- **Current stage** — badge showing `current_stage` (from the derived field). Use color from the enum entry for the stage (e.g. green for done, grey for cancelled).
- **Linked contacts** — chips via `contact_list_items` (Task 10). Pulls from the looked-up `contacts` array.
- **Linked companies** — chips via `company_list_items` (Task 10). Pulls from `companies`.
- **Status history timeline** — small timeline block reading `status` array, showing each entry's stage + timestamp + user (most recent first).
- **Created / Updated** — change-stamp footer rows.

### `modules/activities/components/table_activities.yaml`

AgGridBalham table for the list page. Mirrors `table_companies.yaml`'s shape:

```yaml
id: activities_table
type: AgGridBalham
events:
  onRowClick:
    - id: go_view
      type: Link
      params:
        pageId: { _module.pageId: view }
        urlQuery:
          _id:
            _state: __raw_event.data._id
properties:
  rowData:
    _request: get_activities.0.results   # depends on actual envelope shape
  columnDefs:
    _array.concat:
      - - field: type
          headerName: Type
          # cellRenderer that resolves type → label/color/icon via the merged enum
        - field: title
          headerName: Title
          flex: 2
        - field: current_stage
          headerName: Stage
          # cellRenderer for the stage badge
        - field: contacts
          headerName: Contacts
          # cellRenderer rendering contact chips
        - field: companies
          headerName: Companies
          # cellRenderer rendering company chips
        - field: updated_at
          headerName: Updated
      - _module.var: components.table_columns   # consumer extension
```

Row actions: include a "Mark done / Reopen / Cancel" action menu using the action wrappers from Task 4 (`complete_activity`, `cancel_activity`, `reopen_activity`). Conditional rendering — show "Mark done" if `current_stage === 'open'`, "Reopen" if it's `done`/`cancelled`, etc.

### `modules/activities/components/filter_activities.yaml`

Filter panel rendered above (or beside) the table. Mirrors `filter_companies.yaml`. Filter blocks:

- **Search** — TextInput bound to `state.filter.search` (drives Atlas Search).
- **Type** — Selector with options from the merged enum, bound to `state.filter.type`.
- **Stage** — Selector with three options (open, done, cancelled), bound to `state.filter.stage`.
- **Date range** — DateRange picker bound to `state.filter.date_from` / `state.filter.date_to`.
- **Linked contact** — `contacts.contact-selector` (single-select), bound to `state.filter.contact_id`.
- **Linked company** — `companies.company-selector` (single-select), bound to `state.filter.company_id`.

Plus the consumer hook: `_module.var: components.filters` appended for app-level extensions.

Filter changes trigger a `Request` action with id `get_activities` — refetches the list.

### `modules/activities/components/excel_download.yaml`

Excel export button. Mirrors `companies/components/excel_download.yaml` — button that triggers a `Request` to `get_activities_excel_data`, then a Lowdefy XLSX export action with the result.

The columns exported come from the request's projection plus `_module.var: components.download_columns` (consumer extension).

## Acceptance Criteria

- All four components exist under `modules/activities/components/`.
- `view_activity` renders correctly given a single activity doc — type chip with right color, title, description HTML, stage badge, linked entity chips, status history.
- `table_activities` renders the list with the expected columns. Row click navigates to `pageId: view` with `?_id=<uuid>`. Row actions trigger the right action wrapper based on current stage.
- `filter_activities` triggers a list refetch on any filter change. URL hydration (Task 14) pre-populates filter state for `contact_id` / `company_id` URL params.
- `excel_download` exports a `.xlsx` file when clicked.
- Build is clean.

## Files

- `modules/activities/components/view_activity.yaml` — create — detail SmartDescriptions.
- `modules/activities/components/table_activities.yaml` — create — list AgGrid.
- `modules/activities/components/filter_activities.yaml` — create — filter panel.
- `modules/activities/components/excel_download.yaml` — create — Excel export button.

## Notes

- **Type/stage display logic.** The `type` and `current_stage` cells (and the view's chip blocks) need to look up the human label / color / icon from the merged `activity_types` enum and the (smaller) stage palette. Use `_get` for runtime lookup: `_get: { from: { _build.object.assign: [...] }, key: { _string.concat: [<state value>, '.title'] } }`.
- **Status history timeline.** Read `state.<doc>.status` and render each entry's stage/timestamp/user. Status array is newest-first — render in array order, not reversed.
- **Row-action conditional rendering.** Use `state.row.current_stage` (from the AgGrid row's data, populated by the request's derived field) to show the right action button. If `open` → "Mark done" + "Cancel". If `done` → "Reopen". If `cancelled` → "Reopen".
- **Filter hydration on URL params** is the responsibility of `pages/all.yaml` (Task 14), not this filter component. The filter just binds to `state.filter.*` — page sets initial state from `_url_query` on `onInit`.
- **Tiptap rendering in `view_activity`.** Render the `description` HTML safely (not as plain text). The Tiptap block likely has a display variant, or use a Raw HTML block fed by `state.<doc>.description`. Verify against how `view_company.yaml` renders any HTML fields.
