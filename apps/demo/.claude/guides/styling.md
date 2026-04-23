# Styling

How to style Lowdefy blocks using Tailwind classes, inline CSS, Ant Design theme tokens, and the layout system.

## Pattern

Lowdefy has three styling mechanisms, layered in a strict CSS cascade:

1. **`class`** — Tailwind utility classes (highest CSS priority). Applied to blocks as a string, array, or slot-targeted object. Tailwind is fully integrated: the build extracts all strings from YAML and feeds them to Tailwind JIT. An automatic bridge maps Ant Design tokens to Tailwind theme variables, so `text-primary` and `bg-bg-container` follow the current theme.

2. **`style`** — inline CSS objects. Applied as camelCase properties directly on a block. Use for one-off overrides that don't warrant a utility class. Slot-targeted with `.` prefix keys.

3. **`layout`** — the 24-column responsive grid. Controls `span`, `flex`, `gap`, `justify`, `align` at the parent level. Uses CSS custom properties with responsive breakpoints (`xs`, `sm`, `md`, `lg`, `xl`, `2xl`).

**Slot targeting** — both `class` and `style` can target named sub-elements of a block using `.` prefix keys:

```yaml
class:
  .block: "p-4 rounded-lg" # layout wrapper
  .element: "text-primary" # block component root
  .label: "font-bold text-sm" # label element (input blocks)

style:
  padding: 16 # plain key → layout wrapper (block slot)
  .element: # → block component root
    border: "2px solid blue"
```

**Theme bridge** — Ant Design CSS variables (`--ant-*`) are bridged to Tailwind automatically. Key mappings:

| Tailwind class                                            | Resolves to                       |
| --------------------------------------------------------- | --------------------------------- | ------ |
| `text-primary`                                            | `var(--ant-color-primary)`        |
| `bg-bg-container`                                         | `var(--ant-color-bg-container)`   |
| `bg-bg-layout`                                            | `var(--ant-color-bg-layout)`      |
| `text-text-secondary`                                     | `var(--ant-color-text-secondary)` |
| `border-border`                                           | `var(--ant-color-border)`         |
| `text-success`, `text-error`, `text-warning`, `text-info` | Semantic colors                   |
| `bg-primary-bg`                                           | `var(--ant-color-primary-bg)`     |
| `rounded` / `rounded-sm` / `rounded-lg`                   | `var(--ant-border-radius[-sm      | -lg])` |
| `text-sm` / `text-lg` (font-size)                         | `var(--ant-font-size[-sm          | -lg])` |

All bridge colors auto-update on dark mode toggle — no CSS recompilation needed.

## Data Flow

```
YAML class/style
  → Build: normalizeClassAndStyles strips . prefixes, partitions into slot keys
  → Build: collectPageContent extracts all strings → lowdefy-build/tailwind/{pageId}.html
  → Build: Tailwind JIT scans @source, generates CSS with antd bridge vars
  → Runtime: block receives classNames (via cn/twMerge) and styles objects
  → Render: classNames.element → className, styles.element → style prop
```

## Variations

**Tailwind classes on a block** — the most common approach:

```yaml
- id: hero_box
  type: Box
  class: "bg-bg-container p-6 rounded-lg shadow-md"
```

**Slot-targeted class on an Ant Design block** — style the inner element, not the wrapper:

```yaml
- id: page_title
  type: Title
  class:
    .element: "text-primary font-semibold"
  properties:
    content: Dashboard
```

**Inline style for one-off CSS** — when no Tailwind class exists:

```yaml
- id: sidebar
  type: Box
  style:
    maxHeight: 70vh
    overflowY: auto
```

**Responsive layout with Tailwind** — use Tailwind responsive prefixes:

```yaml
- id: content
  type: Box
  class: "p-2 sm:p-4 md:p-8"
```

**Responsive layout with the grid system** — for column sizing:

```yaml
- id: main
  type: Box
  layout:
    span: 16
    sm:
      span: 24
- id: sidebar
  type: Box
  layout:
    span: 8
    sm:
      span: 24
```

**AG Grid cellStyle** — inline CSS on table cells (Tailwind doesn't apply here):

```yaml
defaultColDef:
  cellStyle:
    display: flex
    alignItems: center
```

**Ant Design CSS variables in inline HTML** — for cell renderers and Html blocks:

```yaml
html: '<span style="color:var(--ant-color-primary);font-weight:600">{{ value }}</span>'
```

**Tailwind in Nunjucks cell renderers** — classes work inside `cellRenderer` HTML:

```yaml
cellRenderer:
  _function:
    __nunjucks:
      template: |
        <span class="inline-block px-2 py-0.5 rounded text-[11px] font-semibold"
              style="background:{{ bg }};color:{{ fg }};border:1px solid {{ border }}">
          {{ text }}
        </span>
      on:
        __args: 0.data
```

**`_theme` operator** — read antd token values at runtime:

```yaml
style:
  borderColor:
    _theme: colorBorder
  borderRadius:
    _theme: borderRadius
```

## Anti-patterns

- **Don't use responsive breakpoints in `style`** — `style: { xs: { padding: 8 } }` throws a `ConfigError`. Use Tailwind responsive prefixes (`class: 'p-2 md:p-4'`) or `layout` breakpoints for grid sizing.
- **Don't use `var(--ant-color-bg-base)` or `var(--ant-color-text-base)`** — seed tokens are not emitted as CSS variables. Use derived tokens: `--ant-color-bg-layout`, `--ant-color-bg-container`, `--ant-color-text`.
- **Don't mix `properties.style` and `style`** — `properties.style` is deprecated and auto-migrated to `style.element` at build time. Use the top-level `style` property with `.element` targeting instead.
- **Don't use `global('key')` in `_js` for theme** — there is no `global` helper. Use `_theme: tokenName` or `var(--ant-color-*)` in CSS strings.
- **Don't add `!important`** — the CSS layer system (`theme < base < antd < components < utilities`) ensures Tailwind utilities always override antd. If a style isn't applying, target the correct slot (`.element` vs `.block`).
- **Don't use inline styles when Tailwind can do it** — `style: { marginBottom: 16 }` is better as `class: 'mb-4'`. Tailwind classes are responsive, theme-aware, and reusable.

## Reference Files

- `modules/layout/components/page.yaml` — `style` on PageSiderMenu for header/sider borders
- `apps/hydra/pages/lot-list/components/table_lots.yaml` — `cellStyle` with flexbox centering and theme vars
- `apps/hydra/pages/home/components/packages_table.yaml` — cell renderer with inline Ant Design color vars
- `modules/shared/layout/card.yaml` — `style` with slot targeting for card component
- `apps/hydra/pages/lot-view/components/overview_tab.yaml` — mixed `style` and `layout` for detail pages

## Template

```yaml
# Styling a page section with Tailwind + layout
- id: {section_id}
  type: Box
  class: 'bg-bg-container rounded-lg shadow-sm'
  layout:
    span: 16
    sm:
      span: 24
    gap: 12
  blocks:
    - id: {section_id}_title
      type: Title
      class:
        .element: 'text-primary'
      properties:
        content: {Section Title}
        level: 4
    - id: {section_id}_content
      type: Box
      class: 'p-4'
      blocks:
        - id: {field_id}
          type: TextInput
          class:
            .label: 'font-semibold text-sm text-text-secondary'
          properties:
            label:
              title: {Field Label}
```

## Checklist

- [ ] Using `class` for reusable styling, `style` only for one-offs with no utility equivalent
- [ ] Responsive sizing uses `layout.span` with breakpoints; responsive spacing uses Tailwind prefixes (`md:p-4`)
- [ ] No breakpoint keys (`xs`, `sm`) in `style` — only in `layout` or Tailwind `class`
- [ ] Ant Design colors referenced via Tailwind bridge (`text-primary`) or CSS vars (`var(--ant-color-primary)`) — never hardcoded hex for theme colors
- [ ] Slot targeting uses `.element` for block content, `.block` for layout wrapper — verify with block's `cssKeys`
- [ ] No `var(--ant-color-bg-base)` or `var(--ant-color-text-base)` — use derived tokens only
- [ ] AG Grid `cellStyle` uses camelCase CSS properties (not Tailwind) — `alignItems` not `items-center`
