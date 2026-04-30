# Enums

How to define, load, and consume enum YAML files that map slugs to display properties.

## Pattern

Enums are YAML maps where each key is a slug (kebab-case) and each value is an object with display properties. They provide a single source of truth for labels, colors, icons, and metadata across tables, filters, badges, and reports.

**Enum files** live in `shared/enums/` (app-level) or `modules/{name}/enums/` (module-level). Each file defines one enum type as a flat YAML map:

```yaml
create-contact:
  color: "#1890ff"
  title: Contact Created
  icon: AiOutlineUserAdd
```

Common properties: `color` (hex), `title` (display label), `icon` (React Icons name). Optional: `description` (tooltip text), `order` (sort weight for kanban/reports), `final` (terminal state flag), `clientTitle` (different label for external-facing apps), `path` (`_ref` to SVG icon), `disabled` (exclude from selectors).

**Loading into `_global`**: Enums must be accessible everywhere at runtime. In app-level lowdefy.yaml, load them under `global.enums`:

```yaml
global:
  enums:
    ticket_statuses:
      _ref: ../shared/enums/ticket_statuses.yaml
    event_types:
      _ref: ../shared/enums/event_types.yaml
```

In module-based projects, enums can be exported as module components and composed with `_build.object.assign` to merge module-level and app-level additions.

**Options helpers** transform enum maps into selector-compatible `{ label, value, style, tag }` arrays. The `options_enum.yaml` pattern uses `_mql.aggregate` to convert the map:

```yaml
# shared/enums/options_enum.yaml
_mql.aggregate:
  - - _var: enum
  - - $project:
        items: { $objectToArray: $$ROOT }
    - $unwind: { path: $items }
    - $project:
        label: { $concat: ["<span>", "$items.v.title", "</span>"] }
        value: $items.k
        style: { color: $items.v.color }
        tag: { color: $items.v.color, icon: $items.v.icon, title: $items.v.title }
```

Usage: `_ref: { path: ../shared/enums/options_enum.yaml, vars: { enum: { _global: enums.ticket_statuses } } }`

**Displaying enums** at runtime: look up the slug against the global map via `_global` with a dynamic key:

```yaml
_global:
  _string.concat:
    - enums.ticket_statuses.
    - _state: ticket.status.0.stage
```

This returns the full enum entry (`{ color, title, icon, ... }`) for rendering in Nunjucks templates, badges, or cell renderers.

## Data Flow

```
Enum YAML file (shared/enums/{type}.yaml)
  → Loaded into _global via lowdefy.yaml global config (or module component export)
  → Consumed at runtime:
      → Filters: options_enum.yaml transforms map into [{ label, value, style, tag }] for Selector/MultipleSelector
      → Badges: _global + _string.concat to look up slug → Nunjucks renders colored badge
      → Tables: cellRenderer uses __global / __get for colored status badges in AgGrid
      → JS actions: lowdefyGlobal('enums.{type}') for computed logic (transitions, available options)
```

## Variations

**Simple display enum** — color + title + icon only. Used for event types, categories:

```yaml
create-contact:
  color: "#1890ff"
  title: Contact Created
  icon: AiOutlineUserAdd
```

**Rich status enum** — adds workflow metadata (`final`, `order`, `clientTitle`):

```yaml
await-client:
  color: '#EE6666'
  title: Awaiting Client
  clientTitle: Feedback Required
  final: false
  order: 2
  icon: AiOutlineUserSwitch
  path:
    _ref: public/icons/user-switch.svg
```

**Typed entity enum** — title + description, no color (for entity types like devices):

```yaml
b_series:
  color: '#000000'
  title: B Series
  description: Black Touch Screen Device
```

**Priority enum** — color + icon + order for sortable priority levels:

```yaml
urgent:
  color: '#ff7875'
  title: Urgent
  icon: AiFillFire
  order: 1
```

**Composed module enum** — merges built-in types with app additions at build time:

```yaml
# modules/shared/enums/event_types.yaml
_build.object.assign:
  - _ref: ../user-admin/enums/event_types.yaml
  - _ref: ../contacts/enums/event_types.yaml
```

**Options helper without color** — for cases where the selector shouldn't show colored badges:

```yaml
# options_enum_without_color.yaml — same transform but omits style/tag.color
$project:
  label: { $concat: ["<span>", "$items.v.title", "</span>"] }
  value: $items.k
  tag: { icon: $items.v.ant-icon, title: $items.v.title }
```

## Anti-patterns

- **Don't duplicate enum values in code** — always `_ref` the enum file. If a color or title appears inline, it will drift from the source of truth.
- **Don't use color alone** — per accessibility, always pair color with a text label. Badges use `<span style="color/background: ...">{{ title }}</span>`.
- **Don't put enums in `_state`** — enums are static reference data. Load into `_global` once at app startup, not into page state on every mount.
- **Don't create separate label arrays** — use `options_enum.yaml` to transform the enum map. Maintaining a parallel `[{ label, value }]` array will drift.

## Reference Files

- `modules/contacts/enums/event_types.yaml` — simple display enum (color, title, icon)
- `modules/shared/enums/event_types.yaml` — composed enum using `_build.object.assign` to merge module enums
- `shared/enums/event_types.yaml` — app-level event types for non-module features
- `modules/notifications/actions/set-types.yaml` — JS action using `lowdefyGlobal('enums.event_types')` to filter and map enum entries
- `modules/notifications/components/list-notifications.yaml` — dynamic `_global` lookup for badge rendering

## Template

```yaml
# shared/enums/{entity}_{type_plural}.yaml
{slug}:
  color: '{hex_color}'
  title: {Display Title}
  icon: {AiOutlineIcon}

{another-slug}:
  color: '{hex_color}'
  title: {Display Title}
  icon: {AiOutlineIcon}
```

## Checklist

- [ ] Enum file is a flat YAML map — keys are kebab-case slugs, values have at least `color` and `title`
- [ ] Enum loaded into `_global.enums.{type}` via lowdefy.yaml `global:` config or module component export
- [ ] Options helper (`options_enum.yaml`) used for selector/filter options — not a hand-maintained array
- [ ] Runtime lookup uses `_global` + `_string.concat` to build the dynamic key path
- [ ] Badge rendering pairs color with text label (not color alone)
- [ ] Module enums composed with `_build.object.assign` for extensibility
