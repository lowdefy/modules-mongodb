# Modules

How to author, wire, and extend Lowdefy modules — the primary unit of feature encapsulation.

## Pattern

A module is a self-contained feature package under `modules/{name}/` with a `module.lowdefy.yaml` manifest. The manifest declares the module's **interface** (vars, dependencies, exports) and **contents** (pages, connections, API endpoints, components, menus). Apps compose modules by adding entries to `modules.yaml`, passing vars to customize behavior.

**Var system**: modules receive configuration through `_module.var` — values set by the app in the module entry's `vars:`. Inside module files, `_module.var` works at any nesting depth without threading through `_ref` chains. For local composition between files within a module, use `_var` (ref-level vars). Always declare vars with `default:` values so the module works standalone. Object vars with `properties:` merge recursively — the app overrides only the keys it provides.

**ID scoping**: the build auto-scopes page, connection, API, and menu IDs using the entry's `id`. Module authors write bare IDs (`all`, `view`, `edit`, `new` — not `user-admin/all`). Use `_module.pageId`, `_module.connectionId`, `_module.endpointId` for sibling references within the module. For cross-module references (linking to another module's pages, calling its APIs, embedding its components), use the object form with `module:` key — where `module` is the abstract dependency name declared in the manifest.

**Extension points**: modules expose two categories of injection points via vars. **Component overrides** (`components.*`) let apps inject UI blocks — extra table columns, form fields, sidebar tiles. **Request stage overrides** (`request_stages.*`) let apps inject MongoDB pipeline stages — extra `$set` fields, extra `$match` filters, extra `$addFields`. Both use `_module.var` with `key:` + `default:` syntax so they resolve to safe defaults when not overridden.

**Data-like exports**: components aren't limited to UI blocks. Enum maps, config templates (like `change_stamp`), and schema fragments all work through the same `components:` mechanism. Consumers use `_ref: { module, component }` with optional `key:` to extract nested values.

## Data Flow

`App lowdefy.yaml → _ref: modules.yaml → module entries with source + vars → build resolves _module.var, scopes IDs, validates exports/dependencies → pages served at /{entryId}/{pageId} → components embedded via _ref: { module, component } → APIs called via _module.endpointId`

## Variations

**Simple module wiring** (inline vars):

```yaml
- id: files
  source: "file:../../modules/files"
  vars:
    collection: files
```

**Complex module wiring** (vars from file):

```yaml
- id: user-admin
  source: "file:../../modules/user-admin"
  vars:
    _ref: modules/user-admin/vars.yaml
```

**Cross-module reference** (object form with module key):

```yaml
# Link to another module's page
pageId:
  _module.pageId:
    id: view
    module: contacts

# Call another module's API
endpointId:
  _module.endpointId:
    id: new-event
    module: events

# Embed another module's component
- _ref:
    module: events
    component: change_stamp
```

**Menu export and consumption** (flat links, app wraps in group):

```yaml
# Module menus.yaml — flat MenuLink items only
id: default
links:
  - id: contacts
    type: MenuLink
    pageId:
      _module.pageId: all
    properties:
      title:
        _module.var: label_plural
      icon: AiOutlineContacts

# App menus.yaml — wraps in MenuGroup
- id: user-admin-group
  type: MenuGroup
  properties:
    title: User Admin
  links:
    _ref:
      module: user-admin
      menu: default
```

## Anti-patterns

- **Don't use `_var` for module-entry vars** — use `_module.var`. `_var` is for ref-level local composition; `_module.var` reads from the app's module entry config and works at any depth without threading.
- **Don't hardcode scoped IDs** — never write `user-admin/all` in module code. Use `_module.pageId: all` and let the build resolve the scope. Hardcoding breaks multi-instance.
- **Don't omit defaults on vars** — if a var has no `default:` and the app doesn't provide it, the module breaks silently. Always provide sensible defaults (empty array `[]`, empty object `{}`, or a meaningful value).
- **Don't nest MenuGroups in module menus** — export flat MenuLink items. The app controls grouping. Nested groups are not composable.
- **Don't forget to declare `exports`** — the build validates cross-module references against declared exports. Missing exports cause build errors in consuming modules.
- **Don't forget to declare `dependencies`** — undeclared cross-module references will fail validation. Every `_ref: { module: X }` or `_module.pageId: { module: X }` requires a dependency on `X`.

## Reference Files

- `modules/contacts/module.lowdefy.yaml` — full-featured manifest: dependencies, nested var properties, component + request_stages injection points, all export types
- `modules/events/module.lowdefy.yaml` — data-like component exports (change_stamp, event_types), var-driven component resolution
- `modules/layout/module.lowdefy.yaml` — component-only module (no pages): page wrapper, card, floating-actions, auth-page
- `modules/files/module.lowdefy.yaml` — infrastructure module: S3 connections, API-only exports, component exports
- `modules/notifications/module.lowdefy.yaml` — send_routine injection: the API routine body is provided by the app
- `apps/example-app/modules.yaml` — app wiring: all module entries with vars, including multi-instance (upload-lots)
- `apps/example-app/menus.yaml` — menu composition: module menu refs wrapped in MenuGroups

## Template

```yaml
# modules/{MODULE_NAME}/module.lowdefy.yaml
name: {Module Name}
description: {One-line description}

dependencies:
  - id: layout
    description: Page layout wrapper
  - id: events
    description: Audit event logging and change stamp

vars:
  {simple_var}:
    type: string
    default: {default_value}
    description: {What this var controls}
  components:
    description: "Overrides: {list of injection points}"
    properties:
      {injection_point}:
        default: []
  request_stages:
    description: "Pipeline overrides: {list of operations}"
    properties:
      {operation}:
        default: []

exports:
  pages:
    - id: {page-id}
      description: {Page description}
  connections:
    - id: {collection}-collection
      description: {Connection description}
  api:
    - id: {action-entity}
      description: {API description}
  components:
    - id: {component-id}
      description: {Component description}
  menus:
    - id: default
      description: {Module} navigation link

connections:
  - _ref: connections/{collection}-collection.yaml

api:
  - _ref: api/{action-entity}.yaml

pages:
  - _ref: pages/{page-id}.yaml

components:
  - id: {component-id}
    component:
      _ref: components/{component-id}.yaml

menus:
  - _ref: menus.yaml

secrets:
  - name: MONGODB_URI
    description: MongoDB connection URI

plugins:
  - name: "{plugin-name}"
    version: "^{major}"
```

## Checklist

- [ ] `module.lowdefy.yaml` has `name`, `description`, and all sections that apply
- [ ] Every var has a `default:` (or is marked `required: true` with validation)
- [ ] Object vars use `properties:` with per-key defaults for recursive merge
- [ ] All cross-module references have matching `dependencies` entries
- [ ] All externally-consumable resources listed in `exports` (pages, api, components, menus, connections)
- [ ] Module code uses `_module.var` (not `_var`) for module-entry vars
- [ ] Module code uses `_module.pageId`/`connectionId`/`endpointId` (not hardcoded scoped IDs)
- [ ] Cross-module refs use object form: `_module.pageId: { id: X, module: Y }`
- [ ] Menus export flat MenuLink items (no MenuGroups)
- [ ] Non-default plugins declared in `plugins:` with semver range
- [ ] All accessed secrets declared in `secrets:` array
