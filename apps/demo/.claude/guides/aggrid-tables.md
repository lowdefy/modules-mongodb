# AgGrid Tables

How to configure data tables using AgGridBalham on list pages and dashboards.

## Pattern

Tables use the `AgGridBalham` block type (preferred) with `rowData` bound to an aggregation request. They live inside a `Card` wrapper (often with skeleton loading) and are extracted into their own component file (`components/table_{entities}.yaml`).

**`defaultColDef`** sets consistent styling for all columns — resizable, pointer cursor, word-break, and cell padding. Every table should set this identically:

```yaml
defaultColDef:
  resizable: true
  cellStyle:
    cursor: pointer
    wordBreak: break-word
    lineHeight: 1.25
    paddingBottom: 8px
    paddingTop: 8px
```

**Column definitions** in modules use `_build.array.concat` to create an extensible three-part structure: base columns + `_module.var: components.table_columns` (default `[]`) + trailing timestamp columns. This lets consuming apps inject extra columns without overriding the entire table.

**Cell renderers** use `_function` with one of these approaches, from preferred to escape hatch:

- `__nunjucks` — HTML templates with conditional logic. Best for status badges, complex formatting, conditional display. Access row data via `on: __args: 0.data` or a specific field.
- `__string.concat` — simple wrapping (e.g., `<div class="ellipsis-4">{{ value }}</div>`)
- `__dayjs.format` — date/time formatting with `format: YYYY-MM-DD HH:mm`
- `__if_none` — null fallback display (e.g., `'<span class="secondary">None</span>'`)
- `_js` — raw JavaScript as a last resort. Avoid when Nunjucks can do the job.

**The tag/badge pattern** for enum values (disciplines, statuses) uses Tailwind for layout and derives background/border from a single `color` value via `color-mix()`:

```yaml
cellRenderer:
  _function:
    __nunjucks:
      template: |
        {% if value %}<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" style="color:{{ color }};background:color-mix(in srgb,{{ color }} 12%,transparent);border:1px solid color-mix(in srgb,{{ color }} 30%,transparent)">{{ value }}</span>{% else %}&mdash;{% endif %}
      on:
        __args: 0.data
```

Enums only need a single `color` field — bg and border are derived automatically. When the color comes from a global enum lookup:

```yaml
      on:
        __get:
          key:
            __args: 0.data.{status_field}
          from:
            __global: enums.{enum_type}
```

**Row click** navigates to the detail page. In modules, use `_module.pageId` for portability. Use `onCellClick` instead of `onRowClick` when certain columns need different behavior (e.g., a link to a related entity).

## Data Flow

```
Page onMountAsync → Request fires → aggregation returns results
  → rowData binds to _request: get_all_{entities}
  → AgGrid renders columns with cellRenderers
  → User clicks row → onRowClick → Link to detail page with _id in urlQuery
```

## Variations

**Module table with column injection:**

```yaml
columnDefs:
  _build.array.concat:
    - - { base columns... }
    - _module.var:
        key: components.table_columns
        default: []
    - - { trailing timestamp columns... }
```

**App-level table with flat columns:**
No `_build.array.concat` needed — just a plain `columnDefs` array. Add `filterParams: { buttons: [reset, apply] }` in `defaultColDef` for in-grid column filtering.

**Table with row selection (checkboxes):**

```yaml
properties:
  rowSelection: multiple
  suppressRowClickSelection: true
  columnDefs:
    - field: { id_field }
      checkboxSelection: true
      headerCheckboxSelection: true
      headerCheckboxSelectionFilteredOnly: true
events:
  onRowSelected:
    - id: update_selection
      type: SetState
      params:
        selected_rows:
          _event: selectedRows
```

**Table with no-results empty state:**
Place a `Result` block alongside the table, toggled with `visible`:

```yaml
- id: no_{entities}
  type: Result
  visible:
    _eq:
      - _request: get_all_{entities}.0.results
      - 0
  properties:
    icon:
      name: AiOutlineContainer
      color: "#bfbfbf"
    subTitle: No {entities} found
```

**Date columns — two approaches:**

- Format in the aggregation via `$dateToString` and use a plain field column (cleaner, field is pre-formatted)
- Format in the cellRenderer via `__dayjs.format` (use when you can't control the aggregation)

## Anti-patterns

- **Don't use `_js` when `_function` + `__nunjucks` suffices** — `_js` is harder to read, maintain, and debug. Reserve it for cases that genuinely need JavaScript logic (e.g., `lowdefyGlobal()` calls).
- **Don't hardcode `pageId` in modules** — use `_module.pageId: {entity}-detail` so the page ID is scoped to the module instance.
- **Don't skip `defaultColDef`** — without it, every column needs individual styling. Copy the standard block from the Pattern section.
- **Don't inline tables in the page file** — extract to `components/table_{entities}.yaml` and ref it. This keeps the page file under 80 lines and lets the table be overridden via `_module.var: components.table`.
- **Don't forget `wrapText: true` + `autoHeight: true`** on columns with long content (descriptions, lists) — without these, content truncates silently.

## Reference Files

- `modules/contacts/components/table_contacts.yaml` — module table with `_build.array.concat` column injection, image + name renderer
- `modules/user-admin/components/table_users.yaml` — module table with status badge, roles array join, `_module.var` column injection
- `modules/data-upload/components/staging-table.yaml` — `AgGridBalham` with row selection, conditional columns, `_js` rowData transform

## Template

```yaml
# components/table_{entities}.yaml
id: {entities}_table
type: AgGridBalham
properties:
  height: 70vh
  rowStyle:
    cursor: pointer
  rowData:
    _request: get_all_{entities}
  defaultColDef:
    sortable: true
    resizable: true
    cellStyle:
      cursor: pointer
      wordBreak: break-word
      lineHeight: 1.25
      paddingBottom: 8px
      paddingTop: 8px
  columnDefs:
    _build.array.concat:
      - - headerName: Name
          field: {name_field}
          flex: 1
          minWidth: 240
        - headerName: {Column}
          field: {field_path}
          flex: 1
          minWidth: 150
        - headerName: Status
          field: {status_field}
          width: 200
          cellRenderer:
            _function:
              __nunjucks:
                template: |
                  {% if status %}<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" style="color:{{ status.color }};background:color-mix(in srgb,{{ status.color }} 12%,transparent);border:1px solid color-mix(in srgb,{{ status.color }} 30%,transparent)">{{ status.title }}</span>{% endif %}
                on:
                  status:
                    __get:
                      key:
                        __args: 0.data.{status_field}
                      from:
                        __global: enums.{enum_type}
      - _module.var:
          key: components.table_columns
          default: []
      - - headerName: Updated
          field: updated_at
          width: 120
        - headerName: Created
          field: created_at
          width: 120
events:
  onRowClick:
    - id: link_to_detail
      type: Link
      params:
        pageId:
          _module.pageId: {entity}-detail
        urlQuery:
          _id:
            _event: row._id
```

## Checklist

- [ ] `defaultColDef` includes resizable, cellStyle with cursor/wordBreak/lineHeight/padding
- [ ] Column injection via `_build.array.concat` with `_module.var: components.table_columns` (default `[]`)
- [ ] Trailing columns for timestamps with fixed `width` (not `flex`)
- [ ] `onRowClick` navigates to detail page using `_module.pageId` (not hardcoded)
- [ ] Status/enum columns use `__get` from `__global: enums.{type}` for color/title lookup
- [ ] Null values handled with `__if_none` or Nunjucks `{% if %}` guards
- [ ] Table extracted into `components/table_{entities}.yaml`, not inlined in the page
- [ ] Long-content columns use `wrapText: true` + `autoHeight: true`
- [ ] Table wrapped in a `Card` block on the page (with optional skeleton loading)
