# Lowdefy Layout, Styling & Theming Guide

Practical reference for building styled Lowdefy components. Covers the rendering pipeline, what works where, and the pitfalls discovered while building the auth-page split-panel layout.

## Docs Reference

All docs are YAML files with embedded markdown at:
`/Users/sam/Developer/lowdefy/lowdefy/packages/docs/`

- **Layout**: `concepts/layout-overview.yaml` — span grid, flex layout, responsive breakpoints, content slots
- **Custom Styling**: `concepts/custom-styling.yaml` — `class`, `style`, CSS slot keys, `public/styles.css`, CSS variables
- **Theming**: `concepts/theming.yaml` — Ant Design tokens, algorithms, `_theme` operator, ConfigProvider, Tailwind bridge, dark mode
- **Modules**: `concepts/modules.yaml` — module system, `_module.var`, ID scoping
- **Writing Modules**: `concepts/module-authoring.yaml` — module project structure, manifest, components
- **Blocks overview**: `concepts/blocks.yaml`
- **Block schemas** (meta.js with cssKeys, properties, theme tokens):
  - `../plugins/blocks/blocks-antd/src/blocks/{BlockName}/meta.js`
  - `../plugins/blocks/blocks-basic/src/blocks/{BlockName}/meta.js`
- **Block docs**:
  - `blocks/container/Box.yaml`, `blocks/container/Card.yaml`, `blocks/container/Layout.yaml`, `blocks/container/Content.yaml`
  - `blocks/display/Button.yaml`, `blocks/display/Title.yaml`, `blocks/display/Paragraph.yaml`

## Block Rendering Pipeline

Every block renders two DOM elements:

```
<div id="bl-{blockId}" style="{style.block}" class="{class.block}">   ← BlockLayout wrapper
  <div id="{blockId}" style="{style.element}" class="{class.element}"> ← Block element
    <Area style="{slots.content.style}" layout="{layout.*}">           ← Content slot
      {child blocks}
    </Area>
  </div>
</div>
```

Source files:

- Block routing: `/Users/sam/Developer/lowdefy/lowdefy/packages/client/src/block/CategorySwitch.js`
- BlockLayout wrapper: `/Users/sam/Developer/lowdefy/lowdefy/packages/layout/src/BlockLayout.js`
- Content Area: `/Users/sam/Developer/lowdefy/lowdefy/packages/layout/src/Area.js`
- Layout→CSS: `/Users/sam/Developer/lowdefy/lowdefy/packages/layout/src/deriveLayout.js`
- Box implementation: `/Users/sam/Developer/lowdefy/lowdefy/packages/plugins/blocks/blocks-basic/src/blocks/Box/Box.js`

## Style Property

`style` in YAML is an object. Flat keys go to the BlockLayout wrapper. `/`-prefixed keys target CSS slots defined in the block's `meta.js`.

```yaml
style:
  maxWidth: 400 # → BlockLayout wrapper (flat = /block)
  background: red # → BlockLayout wrapper
  /element: # → Block element <div>
    borderRadius: 12
  /header: # → Block-specific sub-element (Card header, etc.)
    backgroundColor: grey
```

**Where each target lands:**

- Flat / `/block` → the outer `<div id="bl-{blockId}">` (BlockLayout wrapper). This is the element that participates in parent flex/grid layout.
- `/element` → the inner `<div id="{blockId}">` (block component element). For Box, this is the main `<div>`. For Card, this is the `<div class="ant-card">`.
- `/header`, `/body`, etc. → block-specific sub-elements passed via Ant Design's `styles` prop.

Available CSS slot keys are listed in each block's `meta.js` under `cssKeys`.

**Gotcha:** Ant Design's Layout, Content, and Footer blocks paint their own backgrounds (from `colorBgLayout`). To override, use `/element` style — flat style on the wrapper won't cover the element's background.

## Class Property

`class` applies CSS class names (including Tailwind). String form → wrapper. Object form → CSS slot targets.

```yaml
# String → BlockLayout wrapper
class: "p-4 shadow-lg"

# Object → target specific parts
class:
  /element: "min-h-screen"
  /body: "p-8"
```

Tailwind CSS is always available. Theme-bridged classes like `bg-primary`, `text-text-secondary`, `bg-bg-layout` map to Ant Design tokens automatically.

**Gotcha:** Tailwind responsive classes (`hidden md:block`) on the wrapper may be overridden by Lowdefy's inline styles. If the layout system sets `display` as an inline style, Tailwind classes lose. Prefer the responsive `layout` system.

## Layout Property

`layout` controls two things:

1. **Block positioning** (applied to the BlockLayout wrapper):
   - `flex`, `grow`, `shrink`, `size` → CSS `flex` property
   - `span` → 24-column grid width via CSS custom properties
   - `selfAlign` → `align-self`
   - `order` → `order`

2. **Content area layout** (applied to the Area wrapper around children):
   - `direction` → `flex-direction` (default: `row`)
   - `wrap` → `flex-wrap` (default: `wrap`)
   - `justify` → `justify-content` — options: `start`, `end`, `center`, `space-around`, `space-between`
   - `align` → `align-items` — options: `top`, `middle`, `bottom`
   - `gap` → gap between children
   - `overflow` → overflow behavior

### Responsive Breakpoints

Layout properties support responsive breakpoints:

```yaml
layout:
  span: 24 # Mobile: full width
  md:
    span: 12 # Desktop: half width
  xl:
    span: 8 # Large: one third
```

Breakpoints: `xs` (<640), `sm` (>640), `md` (>768), `lg` (>1024), `xl` (>1280), `2xl` (>1536).

**Critical gotcha: only `span`-based properties support responsive breakpoints.** The `flex` property is set as an inline style, so `layout.md.flex` does NOT create a responsive flex value. It just sets the base `flex`. Use `span` for responsive sizing.

```yaml
# WRONG — md.flex is NOT responsive
layout:
  flex: 0 0 0
  md:
    flex: 0 0 45%    # This does NOT apply at md breakpoint!

# RIGHT — span IS responsive
layout:
  span: 0            # Hidden on mobile
  md:
    span: 11         # ~45% on desktop
```

`span: 0` sets `display: none` (hides the block). This is the reliable way to responsively hide blocks.

## Slots

Content slots are named areas where child blocks render. The default slot is `content` (populated via `blocks:`). Style the content slot directly via `slots`:

```yaml
- id: my-box
  type: Box
  slots:
    content:
      style:
        minHeight: 100vh
        alignItems: center # Overrides layout.align if needed
  blocks:
    - id: child
      type: Box
```

`slots.content.style` is applied to the Area `<div>` that wraps children. It spreads AFTER the layout-derived styles, so it can override `alignItems`, `justifyContent`, etc.

**Key use case:** When `layout.align: middle` doesn't produce `align-items: center` (observed in practice), use `slots.content.style.alignItems: center` as a reliable alternative.

## Theming

### App-level theme (lowdefy.yaml)

```yaml
theme:
  antd:
    token:
      colorPrimary: "#6366f1"
      fontSize: 14
      borderRadius: 8
    algorithm: dark # or compact, or [dark, compact]
    components:
      Card:
        headerBg: "#f5f5f5"
        bodyPadding: 24
```

### Per-block theme override

```yaml
- id: my-card
  type: Card
  properties:
    theme:
      borderRadiusLG: 12
      bodyPadding: 32
```

Wraps the block in a scoped ConfigProvider.

### `_theme` operator (runtime)

Reads resolved Ant Design tokens. Works in any evaluated property (including `style`):

```yaml
color:
  _theme: colorPrimary

background:
  _theme:
    key: colorBgContainer
    default: "#ffffff"
```

### CSS Variables

All Ant Design tokens are available as CSS variables with `--ant-` prefix:

```yaml
style:
  background: "var(--ant-color-primary)"
  borderColor: "var(--ant-color-border)"
```

Token name conversion: `colorPrimary` → `--ant-color-primary` (camelCase → kebab-case).

**Confirmed working:** `var(--ant-color-primary)`, `var(--ant-color-bg-layout)`, `var(--ant-color-bg-container)`.

**Not confirmed:** `var(--ant-color-primary-hover)`, `var(--ant-color-primary-active)` — these derived tokens may or may not be available as CSS variables. Use `color-mix()` to derive variants from the base color instead:

```css
color-mix(in srgb, var(--ant-color-primary) 70%, black)   /* darker */
color-mix(in srgb, var(--ant-color-primary) 70%, white)   /* lighter */
```

### Tailwind Theme Bridge

Ant Design tokens are bridged to Tailwind utility classes:

- `bg-primary`, `text-primary`, `border-primary` → `colorPrimary`
- `bg-bg-container` → `colorBgContainer`
- `bg-bg-layout` → `colorBgLayout`
- `text-text-primary` → `colorText`
- `text-text-secondary` → `colorTextSecondary`

These adapt to dark mode automatically.

## Practical Patterns

### Full-height centered content

```yaml
- id: panel
  type: Box
  layout:
    direction: column
    justify: center
  slots:
    content:
      style:
        minHeight: 100vh
        alignItems: center
  blocks:
    - id: content
      type: Box
      style:
        maxWidth: 400
```

### Theme-aware gradient

```yaml
background: "linear-gradient(160deg, color-mix(in srgb, var(--ant-color-primary) 70%, black) 0%, var(--ant-color-primary) 100%)"
```

### Card without border artifacts

```yaml
- id: my-card
  type: Card
  properties:
    bordered: false
    theme:
      borderRadiusLG: 12
      bodyPadding: 32
```

Do NOT put `boxShadow` on flat style (it goes to the wrapper, not the Card element, causing visual artifacts with rounded corners). Use `properties.theme` or `/element` style, or let the app theme handle it.

## `auth.theme.brandColor` vs `theme.antd.token.colorPrimary`

These are separate. `auth.theme.brandColor` configures the NextAuth theme (email templates, auth UI). `theme.antd.token.colorPrimary` configures the Ant Design theme used by all blocks.

In the demo app, `brandColor: "#f1b434"` does NOT set `--ant-color-primary`. The default Ant blue (`#1677ff`) applies unless `theme.antd.token.colorPrimary` is explicitly set.
