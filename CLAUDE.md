# Lowdefy Modules MongoDB

Monorepo of reusable Lowdefy modules backed by MongoDB.

## Project Structure

```
apps/demo/          — Demo app that imports all modules
modules/            — Reusable Lowdefy modules
  layout-header-menu/ — Page layout with header menu, title bar, content area
  user-account/     — Login, email verification, profile view/edit/create
  user-admin/       — User administration — list, edit, invite
  contacts/         — Contact management
  companies/        — Company management
  events/           — Audit event logging and change stamps
  notifications/    — In-app notifications
  files/            — File uploads (S3)
  shared/           — Shared config (layout templates, enums) — not a module
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

## Layout & Styling

### Block Rendering Pipeline

Every block renders two DOM elements:

```
<div id="bl-{blockId}" style="{style.block}">   ← BlockLayout wrapper
  <div id="{blockId}" style="{style.element}">   ← Block element
    <Area style="{slots.content.style}">          ← Content slot
      {child blocks}
    </Area>
  </div>
</div>
```

### Style Property

Flat keys go to the BlockLayout wrapper. `.`-prefixed keys target CSS slots:

```yaml
style:
  maxWidth: 400 # → BlockLayout wrapper
  .element: # → Block element
    borderRadius: 12
  .header: # → Block-specific sub-element
    backgroundColor: grey
```

**Migration note:** `.` prefix replaces the previous `/` prefix (e.g. `/element` → `.element`).

### Layout Property

Controls block positioning (on wrapper) and content area layout (on children):

```yaml
layout:
  flex: 0 1 auto # Block positioning
  span: 12 # 24-column grid width
  direction: column # Content flex-direction (default: row)
  wrap: wrap # Content flex-wrap (default: wrap)
  justify: center # Content justify-content
  align: middle # Content align-items
  gap: 16 # Gap between children
```

**Responsive breakpoints** — only `span`-based properties support responsive breakpoints:

```yaml
layout:
  span: 24 # Mobile: full width
  md:
    span: 12 # Desktop: half width
```

Breakpoints: `xs` (<640), `sm` (>640), `md` (>768), `lg` (>1024), `xl` (>1280), `2xl` (>1536).

`span: 0` sets `display: none` — the reliable way to responsively hide blocks.

**`flex` is NOT responsive** — `layout.md.flex` does NOT apply at the md breakpoint. Use `span` for responsive sizing.

### Slots

Style the content area slot directly:

```yaml
slots:
  content:
    style:
      minHeight: 100vh
      alignItems: center
```

`slots.content.style` overrides layout-derived styles. Use `slots.content.style.alignItems: center` when `layout.align: middle` doesn't work.

### Theming

App-level theme in `lowdefy.yaml`:

```yaml
theme:
  antd:
    token:
      colorPrimary: "#6366f1"
    algorithm: dark
    components:
      Card:
        bodyPadding: 24
```

Per-block theme override via `properties.theme`:

```yaml
properties:
  theme:
    borderRadiusLG: 12
```

CSS variables: all Ant Design tokens available as `--ant-{kebab-case}` (e.g. `colorPrimary` → `var(--ant-color-primary)`).

Tailwind bridge: `bg-primary`, `text-text-secondary`, `bg-bg-layout`, etc. adapt to dark mode automatically.

### Dark Mode

`theme.darkMode`: `system` (default), `light`, or `dark`. Toggle with `SetDarkMode` action or `properties.darkModeToggle: true` on page types.

Use `_media: darkMode` for boolean state, `_media: darkModePreference` for stored preference.

**Avoid hardcoded hex in styles** — use CSS variables (`var(--ant-color-primary)`) or Tailwind bridge classes for dark mode compatibility.

### Key Gotchas

- Ant Design Layout/Content/Footer paint their own backgrounds from `colorBgLayout`. Override with `.element` style, not flat style.
- Don't put `boxShadow` on flat style for Cards — use `.element` style or `properties.theme`.
- `auth.theme.brandColor` and `theme.antd.token.colorPrimary` are separate — brandColor is for NextAuth, colorPrimary is for Ant Design.
