# File Structure

How to reason about where new files go — monorepo layout, module directories, app-level pages, and the naming conventions that keep things findable.

## Pattern

The monorepo has three layers, each with its own file organization rules:

**Layer 1: Modules** (`modules/{name}/`) — reusable, self-contained features. Flat directory structure with fixed folder names. Every module follows the same layout:

```
modules/{name}/
├── module.lowdefy.yaml       # manifest — pages, api, connections, exports, vars
├── pages/
│   ├── {entities}.yaml        # list page
│   ├── {entity}-detail.yaml   # detail/view page
│   ├── {entity}-edit.yaml     # edit page
│   └── {entity}-new.yaml      # create page
├── requests/
│   ├── get_all_{entities}.yaml
│   ├── get_{entity}.yaml
│   └── get_{entities}_for_selector.yaml
├── components/
│   ├── table_{entities}.yaml
│   ├── filter_{entities}.yaml
│   ├── pagination.yaml
│   ├── form_{entity}.yaml
│   ├── view_{entity}.yaml
│   ├── tile_{related}.yaml
│   └── {entity}-selector.yaml
├── api/
│   ├── create-{entity}.yaml
│   └── update-{entity}.yaml
├── actions/
│   └── search.yaml
├── connections/
│   └── {entities}-collection.yaml
├── enums/
│   └── event_types.yaml
├── defaults/
│   └── event_display.yaml
├── validate/
│   └── email.yaml
└── menus.yaml
```

Module files are **flat within each folder** — no nesting. File names use the entity name consistently. This is critical: Claude and humans both rely on naming conventions to find files.

**Layer 2: App pages** (`apps/{app}/pages/`) — domain-specific pages that compose modules or add custom functionality. Each page gets its **own directory** with nested subdirectories:

```
apps/{app}/pages/{page-name}/
├── {page-name}.yaml           # page definition (the entry point)
├── components/
│   ├── filters.yaml
│   ├── search_results.yaml
│   ├── main.yaml
│   ├── sidebar.yaml
│   └── {modal_name}_modal.yaml
├── requests/
│   ├── get_{data}.yaml
│   ├── selector_filter_options.yaml
│   └── stages/
│       └── match_filter.yaml   # extracted pipeline stages
├── actions/
│   └── search.yaml
└── tiles/                      # for report pages
    └── {tile_name}/
        ├── {tile_name}.yaml    # chart/stat component
        └── get_{tile_data}.yaml  # tile-specific request
```

App pages can nest deeper because they're domain-specific and not reused. Complex pages (views, reports) benefit from the `tiles/` pattern: each visualization is self-contained with its own component + request in a named subfolder.

**Layer 3: Shared** — cross-cutting resources at the app level:

```
apps/shared/                    # shared across apps in the same project
├── change_stamp.yaml
├── app_config.yaml
├── version.yaml
├── enums/
│   ├── {entity}_statuses.yaml
│   ├── event_types.yaml
│   └── options_enum.yaml       # enum-to-selector transform
├── filters/actions/
│   ├── filter_url_query.yaml
│   └── set_url_with_filter.yaml
├── reporting/components/
│   └── reporting_card.yaml
└── files/requests/
    ├── file_upload_policy.yaml
    └── file_download_policy.yaml

shared/                         # shared across the entire monorepo
├── enums/
│   └── event_types.yaml
```

And `modules/shared/` for shared module-level layout and enum resources:
```
modules/shared/
├── layout/
│   ├── title-block.yaml
│   ├── card.yaml
│   ├── floating-actions.yaml
│   └── auth-page.yaml
└── enums/
    └── event_types.yaml
```

## Decision Framework

When adding a new file, ask these questions in order:

**1. Is this reusable across apps?** → **Module** (`modules/{name}/`). Modules export pages, API, connections, and components. They use `_module.var` for customization.

**2. Is it shared across pages in the same app?** → **App shared** (`apps/shared/` or `apps/{app}/modules/`). For: change stamps, enums, reporting card wrapper, filter actions, file policies.

**3. Is it specific to one page?** → **Page directory** (`apps/{app}/pages/{page}/`). Keep the page YAML and its components, requests, and actions together.

**4. Is it a pipeline stage or partial?** → **`stages/` subfolder** inside the request's directory. Extract when `$match` or other stages exceed ~20 lines.

**5. Is it a self-contained report tile?** → **`tiles/{name}/` subfolder** inside the report page. Each tile bundles its component + request.

## Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Pages | `kebab-case` | `contact-detail.yaml`, `ticket-data.yaml` |
| Page directories | same as page | `pages/contact-detail/`, `pages/ticket-data/` |
| Requests | `snake_case` | `get_all_contacts.yaml`, `selector_filter_options.yaml` |
| Components | `snake_case` | `table_contacts.yaml`, `filter_contacts.yaml` |
| API routines | `kebab-case` | `create-contact.yaml`, `advance-gate.yaml` |
| Actions | `snake_case` or `kebab-case` | `search.yaml`, `filter-onchange.yaml` |
| Connections | `kebab-case` | `contacts-collection.yaml` |
| Enums | `snake_case` | `event_types.yaml`, `ticket_statuses.yaml` |

**Request prefixes**: `get_` (read), `insert_` (create), `update_` (modify), `event_` (event log entry), `selector_` (dropdown options), `search_` (search), `socket_` (websocket).

**Component prefixes**: `table_` (AgGrid), `filter_` (filter bar), `form_` (edit/create form), `view_` (detail display), `tile_` (sidebar tile), `pagination` (pagination), `excel_download` (export).

## Anti-patterns

- **Don't put page-specific files in `shared/`** — if only one page uses it, it belongs in that page's directory. `shared/` is for resources used by 3+ pages.
- **Don't nest inside modules** — module directories are flat by convention. `modules/contacts/components/table_contacts.yaml`, never `modules/contacts/components/table/contacts.yaml`.
- **Don't create files that duplicate module functionality** — if a module already has `create-contact.yaml`, don't create an app-level version. Use `_module.var` injection to customize the existing routine.
- **Don't put requests at the domain level when they're page-specific** — `pages/devices/requests/` is for requests shared across all device pages. A request used only by `devices-view` goes in `pages/devices/devices-view/requests/`.
- **Don't exceed 80 lines per file** — if a file is getting long, extract sub-components via `_ref`. A page with 200 lines of blocks should be split into `components/` files.
- **Don't create a directory for a single file** — if a new "feature" only needs one YAML file, put it directly in the appropriate existing folder. Directories are for groups of related files.

## Reference Files

- `modules/contacts/` — canonical module structure with all standard subdirectories
- `modules/shared/layout/` — shared layout components (card, title-block, floating-actions)
- `apps/hydra/pages/lot-view.yaml` — app-level page entry point referencing components/ subdirectory

## Checklist

- [ ] New module follows the standard flat directory layout (pages/, requests/, components/, api/, actions/, connections/)
- [ ] File name uses the correct naming convention (kebab-case for pages/api, snake_case for requests/components)
- [ ] Page-specific files live in the page's own directory, not in shared/
- [ ] Request prefix matches its purpose (get_, insert_, update_, selector_, event_)
- [ ] No file exceeds ~80 lines — extract to _ref'd sub-files when needed
- [ ] Complex pipeline stages extracted to `stages/` subfolder
- [ ] Report tiles are self-contained in `tiles/{name}/` with component + request
- [ ] Module manifest (`module.lowdefy.yaml`) updated when adding pages, api, or connections
