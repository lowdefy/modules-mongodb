# Lowdefy Modules MongoDB

Monorepo of reusable Lowdefy modules backed by MongoDB.

## Client Names

Never use client names in design documents, commits, or any content tracked in git. Use generic terms — "an existing app", "existing solutions", "production apps". If a design requires app-specific configuration details (e.g., extracting code from a specific app), add a single anonymous reference at the top of the design file and use that name throughout. Designs that don't need app-specific config (e.g., performance improvements) should not reference specific apps at all.

## Project Structure

```
apps/demo/          — Demo app that imports all modules
modules/            — Reusable Lowdefy modules
plugins/            — Custom Lowdefy plugins
```

## Lowdefy Module System

### Using Modules

Modules are added to the `modules` array in `lowdefy.yaml`:

```yaml
modules:
  - id: user-admin
    source: "github:lowdefy/modules-mongodb/modules/user-admin@v1.0.0"
    dependencies:
      layout: layout
    vars:
      collection: users
```

Module entry fields:

- `id` — Unique identifier, controls namespace for scoped IDs and page paths
- `source` — GitHub repo (`github:owner/repo@ref`) or local path (`file:./path`)
- `vars` — Values passed to module, accessible via `_module.var`
- `connections` — Remap module connection names to app connection IDs
- `dependencies` — Map abstract dependency names to concrete module entry IDs

### Module Manifest (module.lowdefy.yaml)

Each module has a manifest declaring its interface:

```yaml
name: User Admin
description: User administration

vars:
  collection:
    type: string
    default: users

dependencies:
  - id: layout
  - id: events

exports:
  pages:
    - id: users-list
  components:
    - id: user-avatar
  menus:
    - id: default

components:
  - id: user-avatar
    component:
      _ref: components/user-avatar.yaml

pages:
  - _ref: pages/users-list.yaml

menus:
  - _ref: menus.yaml

plugins:
  - name: "@lowdefy/blocks-aggrid"
    version: "^4"

secrets:
  - name: MONGODB_URI
```

### Cross-Module Dependencies

Modules reference each other via dependencies declared in the manifest.

**Auto-wiring:** If a module declares a dependency and a module entry with the same `id` exists, the build wires them automatically. No `dependencies:` mapping needed in the app config.

**Explicit wiring:** Only needed when entry IDs don't match dependency names:

```yaml
- id: contacts
  source: "github:my-org/crm/contacts@v1"
  dependencies:
    layout: app-layout # declared "layout", entry is "app-layout"
```

### Consuming Module Resources

**Pages and APIs** — auto-included, auto-scoped with entry ID prefix. URLs: `/{entryId}/{pageId}`.

**Components** — reusable config fragments via `_ref`:

```yaml
- _ref:
    module: layout
    component: page
    vars:
      id: contacts
      title: Contacts
      blocks: [...]
```

Components can export any config — blocks, enum maps, config templates. Use `key` to extract nested values:

```yaml
icon:
  _ref:
    module: events
    component: event_types
    key: login.icon
```

**Menus** — included via `_ref` with `module` and `menu`:

```yaml
links:
  _ref:
    module: user-admin
    menu: default
```

### ID Scoping

The build auto-scopes page IDs, connection IDs, API endpoint IDs, and menu item IDs with the module entry ID prefix. Block IDs and request IDs are NOT scoped.

### Module Var Operators

- `_module.var: key` — access module entry vars (from app config)
- `_var: key` — access `_ref`-level vars (local composition between files)
- `_module.pageId: page-name` — resolve to scoped page ID
- `_module.connectionId: conn-name` — resolve to scoped connection ID
- `_module.endpointId: endpoint-name` — resolve to scoped endpoint ID
- Cross-module page reference: `_module.pageId: { id: page, module: dep-name }`

## Lowdefy Project Rules

Rules and patterns for working with Lowdefy projects. These are practical conventions learned from development — not documentation.

- **Snake case request IDs** — Use snake_case for all Lowdefy request IDs (e.g., `get_lot` not `get-lot`). This applies to the `id` field in request YAML files and all references to request IDs.
- **Enum files for config maps** — Extract hard-coded maps keyed by a pre-defined set (e.g. gate colors, discipline labels, status config) into enum files (e.g. `enums/gates.yaml`, `enums/disciplines.yaml`). Load these into global state nested under the `enums` key (e.g., `_global: enums.gates`, `_global: enums.disciplines`) instead of duplicating the maps inline in `_js` blocks. Do NOT extract plain selector `options` (label/value arrays) into enum files — the label/value schema is exclusive to selectors. Only create an enum for selector options when there are styling values (colors, icons) associated with the value, or the value needs to be prettified on a view page or filter.
- **JS operator globals** — In `_js` blocks, access global state with `lowdefyGlobal('key')` (not `global('key')`). Access page state with `state('key')` (not `state.key`). Outside `_js`, use the standard `_global` and `_state` operators.
- **File naming conventions** — Use kebab-case for page files, API files, and directory names (e.g., `lot-view.yaml`, `save-linked-document.yaml`). Use snake_case for component files, request files, action files, and enum files (e.g., `gate_modal_s0.yaml`, `get_lot.yaml`, `options_enum.yaml`).
- **Kebab-case page IDs** — Use kebab-case for page IDs since they become URL paths (e.g., `my-tickets`, `ticket-view`, `companies-new`).
- **Request ID verb prefixes** — Prefix request IDs with the operation verb: `get_`, `insert_`, `update_`, `set_`, `event_`, `selector_` (e.g., `get_company`, `insert_company`, `event_insert_company`).
- **Change stamp on writes** — Include a change stamp (`_ref: change_stamp.yaml`) on all database write operations to track timestamp, user, and app context.
- **Extract deep blocks via \_ref** — Extract blocks into separate component files via `_ref` when nesting exceeds ~3-4 levels or when a block is reused across pages. Pass data via `vars`.
- **Conditional skip on actions** — Use the `skip` property with operators (`_eq`, `_ne`) to conditionally execute actions rather than wrapping in complex `_if` blocks.
- **Format dates with `_dayjs`** — Use `_dayjs.format` or `_dayjs` chain mode to format dates, not `_date.format`. The `_date` operator is only for creating date objects (e.g., `_date: now`), not for formatting display strings.
- **Kebab-case API IDs** — Use kebab-case for API endpoint IDs (e.g., `save-linked-document`, `remove-linked-document`). This matches the kebab-case file naming convention and applies to the `id` field in API YAML files.
- **AgGridBalham for all tables** — Always use `AgGridBalham` as the table block type, never `AgGridMaterial` or other AG Grid themes.
- **Prefer Lowdefy blocks over Html** — When adding a new UI element, first search Lowdefy's built-in blocks for an equivalent that can be styled to match the design. Only fall back to `Html` blocks when no suitable Lowdefy block exists.
- **Operators before `_js`** — Prefer Lowdefy operators (`_if`, `_eq`, `_array`, etc.) for data transformations. Only use `_js` when operator chaining becomes deeply nested or hard to read, and keep the embedded JS as simple as possible.
- **Input block IDs match data paths** — Set input block IDs to the exact state path where the data is stored (e.g., `id: lot.gates.s5.contractor` not `id: s5_contractor`). This ensures auto-binding reads and writes to the correct location, so form data can be sent as a subtree (e.g., `_state: lot.gates.s5`) without manual field mapping.
- **Register new APIs in lowdefy.yaml** — When adding a new API endpoint file, always add a corresponding `_ref` entry in the `apis` section of `lowdefy.yaml`. An API file that isn't referenced in `lowdefy.yaml` won't be loaded by the framework.
- **Snake_case block IDs** — Use snake_case for all block IDs (e.g., `gate_s0_title_row`, `s1_link_doc_btn`). Do not use kebab-case for block IDs; kebab-case is reserved for page IDs and API endpoint IDs.
- **Snake_case action IDs** — Use snake_case for action IDs in event handlers (`onOk`, `onClose`, etc.), e.g., `save_gate`, `reset_lot_state`, `refetch_lot`. The same snake_case convention that applies to block IDs and request IDs also applies to action IDs.
- **Operator dot notation and composition** — Most Lowdefy operators (`_state`, `_global`, `_request`, `_step`, `_payload`, etc.) support dot notation for nested access (e.g., `_step: get_lot.gates.s0`). Operator values can also be composed — any operator that evaluates to a string is valid as the value (e.g., `_request: { _string.concat: ['get_', 'lot'] }`). Prefer dot notation over `_get` with `from`/`key` for simple nested access.
- **Domain-driven page directories** — Organize pages into domain subdirectories with each page in its own directory containing `components/`, `requests/`, and `actions/` subdirs (e.g., `pages/tickets/ticket-view/ticket-view.yaml` with `components/`, `requests/`, `actions/` alongside). Do not place page files flat in the `pages/` directory.
- **Co-located API directories** — Place API endpoint files under the domain directory that owns them (e.g., `pages/tickets/api/tickets-close-ticket/tickets-close-ticket.yaml`), not in a top-level `api/` directory. Each API gets its own directory matching its ID.
- **Entity-prefixed API IDs** — Prefix API endpoint IDs with the entity name followed by the action (e.g., `tickets-close-ticket`, `companies-update-billing-config`, `tasks-update-priority`). This scopes the endpoint to its domain and avoids naming collisions.
- **Extract request pipeline stages** — Extract reusable or complex MongoDB pipeline stages (`$match`, `$lookup`, `$project`, etc.) into a `requests/stages/` subdirectory and reference them with `_ref` in the main request pipeline.
- **Extract action sequences to files** — Extract multi-step event action sequences into separate files under an `actions/` subdirectory within the page directory (e.g., `actions/filter_refetch.yaml`). Reference them with `_ref` in event handlers.
- **Shared domain directories** — Place cross-app resources (requests, components, enums, APIs) under `/apps/shared/{domain}/` organized by domain (e.g., `shared/tickets/`, `shared/contacts/`, `shared/enums/`). Reference from apps with `../shared/` paths.
- **YAML block sequences for operators** — Use YAML block sequences (one item per line) for logical/comparison operators like `_eq`, `_ne`, `_or`, etc. Do not use inline flow sequences like `_eq: [val1, val2]`.
- **Static branches over dynamic keys** — Prefer static per-case branches with hardcoded paths (e.g., `_if`/`_then` with `gates.s0.checklist`) over dynamically constructing MongoDB dot-notation keys at runtime via `_object.fromEntries` + `_string.concat`. Static branches are easier to read and debug.
- **No underscore-prefixed aggregation fields** — Do not prefix temporary field names or state keys in MongoDB aggregation pipelines with underscores (e.g., use `totalCount` not `_totalCount`). Lowdefy interprets underscore-prefixed strings as operators, which causes parsing errors.
- **Audit state refs when changing input blocks** — When adding, removing, or renaming an input block, audit all references to its `id` across the page (operators like `_state`, `_if`, `_eq`, requests, actions, and API payloads) since input block IDs are auto-bound state paths and any change silently breaks code that reads from or writes to that path.
- **Gap before margins** — When adjusting spacing between sibling components, first use the parent's `layout.gap` property to set uniform spacing between all direct children. Only add individual `margin` styles when the spacing needs to be non-uniform or when extra spacing is needed beyond the gap.
- **Modular component extraction** — Extract repeated block patterns into reusable component files and reference them via `_ref` with `vars`. Place cross-page components under `apps/shared/components/`. Use `.yaml.njk` when vars need string interpolation in IDs or inline values; use plain `.yaml` with `_var` when vars only appear in operator positions.
- **Nunjucks over Html+\_js** — Prefer the `_nunjucks` operator over `Html` blocks with `_js`-constructed HTML strings. Nunjucks templates are more readable and keep markup declarative.
- **Payload, not state**: requests receive state via `payload:` mapping, never inline `_state` in pipeline properties.
- **`_build.*`** operators for build-time logic; `_if`/`_eq`/etc. for runtime.

## Guides

Read the relevant guide **before** writing code for that topic.

| When you are...                                              | Read                               |
| ------------------------------------------------------------ | ---------------------------------- |
| Building a list page with table and pagination               | `.claude/guides/list-pages.md`     |
| Configuring an AgGrid table                                  | `.claude/guides/aggrid-tables.md`  |
| Writing MongoDB aggregation pipelines                        | `.claude/guides/aggregations.md`   |
| Adding search/filter controls to a page                      | `.claude/guides/filters.md`        |
| Adding pagination to a list                                  | `.claude/guides/pagination.md`     |
| Building a detail/view page                                  | `.claude/guides/detail-pages.md`   |
| Building an edit/create form page                            | `.claude/guides/edit-pages.md`     |
| Defining enums (colors, titles, options helpers)             | `.claude/guides/enums.md`          |
| Working with status arrays, transitions, and history         | `.claude/guides/status-fields.md`  |
| Adding created/updated audit stamps                          | `.claude/guides/change-stamps.md`  |
| Wrapping content in page layout or cards                     | `.claude/guides/page-layouts.md`   |
| Adding sidebar tiles (events, files, related)                | `.claude/guides/sidebar-tiles.md`  |
| Logging audit events and displaying timelines                | `.claude/guides/events.md`         |
| Building charts, reports, and KPI dashboards                 | `.claude/guides/charts.md`         |
| Writing API routines (create/update endpoints)               | `.claude/guides/api-routines.md`   |
| Working with contact fields or the user_contacts schema      | `.claude/guides/contact-fields.md` |
| Designing data schemas, naming fields, or adding collections | `.claude/guides/data-schema.md`    |
| Adding notifications (inbox, bell, emails, Lambda pipeline)  | `.claude/guides/notifications.md`  |
| Using Lowdefy operators (build-time, runtime, functions)     | `.claude/guides/operators.md`      |
| Writing inline JavaScript with the `_js` operator            | `.claude/guides/js-operator.md`    |
| Rendering dynamic arrays with List or ControlledList         | `.claude/guides/lists.md`          |
| Styling blocks with Tailwind, inline CSS, and theme tokens   | `.claude/guides/styling.md`        |
| Deciding where new files go and naming them                  | `.claude/guides/file-structure.md` |
| Authoring, wiring, or extending a Lowdefy module             | `.claude/guides/modules.md`        |

## Skills

- `/lowdefy-modules` — Module structure, manifests, operators, cross-module refs.
- `/add-guide` — Discover a pattern in the codebase and create a new guide.
