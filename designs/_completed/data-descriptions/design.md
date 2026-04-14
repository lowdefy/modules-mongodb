# DataDescriptions Block

## Problem

The DataView block renders field labels **above** values (vertical stacking via CSS grid). With `maxColumns: 2`, this creates excessive vertical space and looks sparse — labels floating above short values wastes the horizontal space that a 2-column layout should be using efficiently.

The user wants a **bordered, horizontal-label layout** like Ant Design's Descriptions component (`bordered: true`, `layout: "horizontal"`), where labels sit to the **left** of values in a structured table format.

DataView has excellent data preprocessing — 20 field types with auto-detection, formConfig-driven structure, component hints, nested data support. The Lowdefy Descriptions block has none of this. The existing Descriptions block only accepts simple label/value pairs with no type awareness.

**Goal:** Create a new `DataDescriptions` block that combines DataView's data preprocessing pipeline with Ant Design's Descriptions rendering.

## Current State

### DataView rendering flow

```
DataView.js
  → preprocessData(data, formConfig, { maxColumns })
    → buildStructureFromConfig(data, formConfig, options)  [or buildStructureFromData]
      → returns structure tree:
          { type: "root", items: [
            { type: "section", title, level, items: [
              { type: "grid", columns, items: [
                { type: "field", key, value, label, fieldType, fullWidth, ... }
              ]},
              { type: "section", ... }  // nested sections
            ]}
          ]}
  → StructureRenderer.js (recursive React renderer)
    → Section.js, GridItem.js, Card.js, renderField.js, renderFieldValue.js
```

Key insight: the preprocessing pipeline (`preprocessing/` + `fieldTypes/`) is **pure data transformation** — it takes `(data, formConfig, options)` and returns a structure tree. The rendering layer (`core/` + `components/`) is a separate concern. We can reuse the preprocessing and swap the renderer.

### DataView file layout

```
blocks/DataView/
├── DataView.js                    # Entry point
├── schema.json                    # Block schema
├── meta.js                        # Block metadata
├── style.module.css               # Grid-based CSS
├── preprocessing/
│   ├── preprocessData.js          # Router: config vs auto
│   └── helpers/
│       ├── buildStructureFromConfig.js
│       ├── buildStructureFromData.js
│       ├── processConfigItems.js   # Config → structure tree
│       ├── buildObjectStructure.js # Data → structure tree
│       ├── createGridNode.js       # Grid node factory
│       ├── createSection.js        # Section node factory
│       ├── wrapItemsInSections.js  # Ensure root has sections
│       └── detectFieldType.js      # Type detection
├── fieldTypes/
│   └── fieldTypeRegistry.js       # 20 type configs
├── core/
│   ├── StructureRenderer.js       # Recursive renderer
│   ├── renderField.js             # Field → GridItem
│   ├── renderFieldValue.js        # Value → typed JSX
│   └── renderArray.js             # Array value rendering
├── components/
│   ├── Section.js                 # Section wrapper
│   ├── GridItem.js                # Label-above-value item
│   └── Card.js                    # Ant Card wrapper
└── utils/
    ├── formatFieldName.js         # key → "Field Name"
    └── formatValue.js             # Value formatting
```

**Copied and adapted for DataDescriptions:** `preprocessing/` (modified to output a tree of groups instead of grid tree), `fieldTypes/` (registry + 3 lookup helpers), `utils/`, `core/renderFieldValue.js`, `core/renderArray.js`

**Not used by DataDescriptions:** `core/StructureRenderer.js`, `core/renderField.js`, `components/GridItem.js`, `components/Section.js`, `components/Card.js`

**Partially used:** `style.module.css` — the value-type CSS classes (`dataview-value`, `dataview-link`, `dataview-tag`, etc.) are extracted into `DataDescriptions/style.css`. Layout classes (grid, section, card, container, responsive) are not used.

### Lowdefy v5 Descriptions block (reference implementation)

Source: `@lowdefy/blocks-antd/src/blocks/Descriptions/Descriptions.js`

The existing Lowdefy Descriptions block wraps antd `Descriptions` with:

- **`withTheme('Descriptions', ...)`** — enables `properties.theme` for antd design token overrides (labelBg, labelColor, titleColor, spacing tokens, etc.)
- **`withBlockDefaults`** — standard Lowdefy block wrapper
- **`renderHtml`** — HTML support in `title`, labels, and values
- **CSS keys**: `element` (the Descriptions element), `content` (value cells), `label` (label cells) — passed via `classNames`/`styles`
- **Content slot**: `extra` — renders in the header area (e.g., an Edit button)
- **`items`** — accepts array of `{label, value, span, style, contentStyle, labelStyle}` or plain object
- **`itemOptions`** — per-key overrides with `transformValue`, `transformLabel`, `span`, `style` (can be functions)

Standard Descriptions props: `bordered`, `colon`, `column` (number or responsive object), `layout`, `size`, `title`, `theme`. (DataDescriptions omits `title` — see below.)

### Ant Design Descriptions API (antd v6)

```jsx
<Descriptions
  bordered={true}
  layout="horizontal" // labels to the LEFT of values
  column={{ xs: 1, sm: 2 }} // responsive columns
  size="small"
  title="Section Title"
>
  <Descriptions.Item label="Name" span={1}>
    John Doe
  </Descriptions.Item>
  <Descriptions.Item label="Notes" span="filled">
    Long text...
  </Descriptions.Item>
</Descriptions>
```

Key properties:

- `bordered` — table with borders and label background color
- `layout` — `"horizontal"` (label left of value) or `"vertical"` (label above value)
- `column` — number or responsive object `{ xs: 1, sm: 2, md: 3 }`
- `size` — `"small"`, `"default"` (Lowdefy maps to antd sizes)
- `title` — ReactNode, rendered in header
- `extra` — ReactNode, action area top-right of header
- Items accept `ReactNode` children — any JSX works
- `span: "filled"` (v5.22+) — fills remaining columns in the row

## Solution

### New block: `DataDescriptions`

A new block in `modules-mongodb-plugins` that:

1. Accepts the same `data` and `formConfig` props as DataView
2. Runs the same preprocessing pipeline
3. Walks the structure tree and renders using Ant Design `Descriptions`

### Properties — standard Descriptions + data handling

The block follows the **same property interface as Lowdefy's Descriptions block**, replacing `items`/`itemOptions` with `data`/`formConfig`:

```yaml
type: DataDescriptions
properties:
  # --- Standard Descriptions properties (same as Lowdefy Descriptions) ---
  bordered: true # default: true
  colon: true # default: true
  column: 2 # number or { xs: 1, sm: 2, md: 3 }
  layout: horizontal # "horizontal" | "vertical"
  size: small # "default" | "small"
  theme: # antd design tokens (via withTheme)
    labelBg: "rgba(0, 0, 0, 0.02)"
    labelColor: "rgba(0, 0, 0, 0.45)"
    titleColor: "rgba(0, 0, 0, 0.88)"
    titleMarginBottom: 20
    itemPaddingBottom: 16
    itemPaddingEnd: 16
    colonMarginRight: 8
    colonMarginLeft: 2
    contentColor: "rgba(0, 0, 0, 0.88)"
    extraColor: "rgba(0, 0, 0, 0.88)"

  # --- Data handling (from DataView) ---
  data: { ... } # data object to display
  formConfig: [...] # optional structure config

  # --- DataView-specific features ---
  disableCrmLinks: false # disable contact/company links
  s3GetPolicyRequestId: request_id # for S3 file downloads

# CSS keys (same as Descriptions)
style:
  .element: {} # The Descriptions element
  .content: {} # Value cells
  .label: {} # Label cells

# Content slots (same as Descriptions)
slots:
  extra: # Action area in header
    blocks:
      - id: edit_button
        type: Button
        properties:
          title: Edit
```

**What's the same as Descriptions:** `bordered`, `colon`, `column`, `layout`, `size`, `theme`, CSS keys (`element`, `content`, `label`), `extra` slot, `withTheme`.

**What's different:** `data` + `formConfig` replace `items` + `itemOptions`. Plus `disableCrmLinks` and `s3GetPolicyRequestId` for DataView's special type renderers. No `title` prop — section titles come from `formConfig` sections; a block-level title that only renders for single-group data would be inconsistent.

**Changed defaults:** `bordered: true` (Descriptions defaults to `false`). This block exists for bordered display.

### How it maps structure → Descriptions

The structure tree from preprocessing has four node types: `root`, `section`, `grid`, `field`.

**Mapping:**

| Structure node             | Descriptions rendering                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `root`                     | Container `<div>` wrapping all children                                                   |
| `root` fields (no section) | Bare `<Descriptions>` — no card wrapping                                                  |
| `section` (level 0)        | Bare `<Descriptions title={title}>` — top-level sections render as sibling Descriptions   |
| `section` (level 1+)       | `<Card type="inner" title={title}>` wrapping a `<Descriptions>`                           |
| `grid`                     | Transparent — extract field items, pass to parent Descriptions                            |
| `field`                    | `<Descriptions.Item label={label} span={span}>` with value rendered by `renderFieldValue` |
| `field` (fullWidth)        | `<Descriptions.Item span="filled">` — spans remaining columns                             |

**Root-level fields** (fields not inside an explicit section) get wrapped in a single untitled `<Descriptions>` group.

### Handling nested data — Card inner for sub-groups

Nested data from formConfig creates nested sections in the structure tree. The renderer uses **AntD Cards with `type="inner"`** for sub-grouping, keeping `<Descriptions>` at a single level (never Descriptions-inside-Descriptions).

**Why not nest Descriptions?** AntD `Descriptions` with `bordered: true` renders as a `<table>`. Nesting tables creates double borders, misaligned columns, and awkward padding. Cards with `type="inner"` are designed for nesting — lightweight container with thin border, no shadow.

**Top-level sections** render as sibling `<Descriptions>` groups (same as DataView's Card-at-level-0 pattern):

```
Section "Contact Details"     →  <Descriptions title="Contact Details" bordered>
  ├── field: Name                   <Descriptions.Item label="Name">...</>
  ├── field: Email                  <Descriptions.Item label="Email">...</>
  └── field: Phone                  <Descriptions.Item label="Phone">...</>
                                 </Descriptions>

Section "Address"             →  <Descriptions title="Address" bordered>
  ├── field: Street                 <Descriptions.Item label="Street">...</>
  ├── field: City                   <Descriptions.Item label="City">...</>
  └── field: Country                <Descriptions.Item label="Country">...</>
                                 </Descriptions>
```

**Nested sections** (section within section) render as inner Cards wrapping their own Descriptions:

```
<Descriptions title="Contact Details" bordered>    ← top-level section
  <Descriptions.Item label="Name">...</>
  <Descriptions.Item label="Email">...</>
</Descriptions>

<Card type="inner" title="Address">                ← nested section → Card inner
  <Descriptions bordered>
    <Descriptions.Item label="Street">...</>
    <Descriptions.Item label="City">...</>
  </Descriptions>

  <Card type="inner" title="Billing">              ← deeper nesting → Card inner
    <Descriptions bordered>
      <Descriptions.Item label="Account">...</>
    </Descriptions>
  </Card>
</Card>
```

**Array items** (e.g., "Item 1", "Item 2" from controlled_list config) each become their own inner Card with a Descriptions inside.

This mirrors DataView's nesting pattern (Card at level 0, lightweight containers deeper) but uses AntD's `Card type="inner"` instead of DataView's custom Section/Card components. If inner Cards prove too visually heavy at deep nesting, they can be swapped for plain divs with header styling — but starting with Cards for v1.

### File structure

```
blocks/DataDescriptions/
├── DataDescriptions.js        # Entry point (withTheme + withBlockDefaults)
├── meta.js                    # Block metadata (category, cssKeys, slots, schema)
├── schema.json                # Block property schema
├── preprocessing/
│   ├── preprocessData.js      # Router: config vs auto (copied from DataView, adapted)
│   └── helpers/
│       ├── buildStructureFromConfig.js  # Config → group tree (adapted: no grid wrapping)
│       ├── buildStructureFromData.js    # Data → group tree (adapted: no grid wrapping)
│       ├── processConfigItems.js        # Config → sections + fields (adapted)
│       ├── buildObjectStructure.js      # Data → sections + fields (adapted)
│       ├── createSection.js             # Section node factory (copied)
│       ├── wrapItemsInSections.js       # Ensure root has sections (copied)
│       └── detectFieldType.js           # Type detection (copied)
├── fieldTypes/
│   ├── fieldTypeRegistry.js           # 20 type configs (copied)
│   ├── getFieldTypeConfig.js          # Type lookup by name (copied)
│   ├── getFieldTypeByComponentHint.js # Type lookup by component hint (copied)
│   └── getFieldTypesByPriority.js     # Priority-sorted type list (copied)
├── core/
│   ├── renderFieldValue.js    # Value → typed JSX (copied)
│   └── renderArray.js         # Array value rendering (copied)
├── style.css                  # Value-type CSS classes (extracted from DataView)
└── utils/
    ├── formatFieldName.js     # key → "Field Name" (copied)
    └── formatValue.js         # Value formatting (copied)
```

Preprocessing is **copied from DataView and adapted** to output a tree of groups `[{ title, fields, children }]` instead of a tree with grid wrappers. Nesting hierarchy is preserved so the renderer can use Card inner for nested groups. Field types, value renderers, and utils are copied unchanged. This makes DataDescriptions self-contained — no cross-block imports.

`@lowdefy/blocks-antd` is already a peer dependency of `modules-mongodb-plugins`. No additional dependency is needed — Lowdefy's build system resolves plugin peers via the generated `.lowdefy/dev/package.json`.

### DataDescriptions.js approach

```jsx
import React, { useMemo } from "react";
import { renderHtml, withBlockDefaults } from "@lowdefy/block-utils";
import { Card, Descriptions } from "antd";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import preprocessData from "./preprocessing/preprocessData.js";
import renderFieldValue from "./core/renderFieldValue.js";
import "./style.css";

const DataDescriptions = ({
  blockId,
  classNames = {},
  content,
  properties,
  components: { Icon },
  methods,
  styles = {},
}) => {
  const { data, formConfig } = properties;

  const groups = useMemo(() => {
    return preprocessData(data, formConfig);
  }, [data, formConfig]);

  if (!groups?.length) {
    return <div id={blockId}>No data to display</div>;
  }

  // Descriptions props — standard antd passthrough
  const descProps = {
    bordered: properties.bordered ?? true,
    colon: properties.colon,
    column: properties.column ?? 2,
    layout: properties.layout,
    size: properties.size,
    className: classNames.element,
    classNames: { content: classNames.content, label: classNames.label },
    style: styles.element,
    styles: { content: styles.content, label: styles.label },
  };

  // Render a group's fields as a <Descriptions> block
  function renderDescriptions(group, title, extra) {
    return (
      <Descriptions
        {...descProps}
        title={renderHtml({ html: title, methods })}
        extra={extra}
      >
        {group.fields.map((field, j) => (
          <Descriptions.Item
            key={j}
            label={field.label}
            span={field.fullWidth ? "filled" : 1}
          >
            {renderFieldValue(field, Icon, methods, properties)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    );
  }

  // Recursively render a group and its children
  // Top-level groups (depth 0) render as bare Descriptions.
  // Nested groups (depth 1+) render as Card type="inner" wrapping Descriptions.
  function renderGroup(group, depth, index, extra) {
    const title = group.title || null;
    const hasFields = group.fields?.length > 0;
    const hasChildren = group.children?.length > 0;

    if (depth === 0) {
      // Top-level: bare Descriptions + recurse children as siblings
      return (
        <React.Fragment key={`${depth}-${index}`}>
          {hasFields && renderDescriptions(group, title, extra)}
          {!hasFields && title && (
            <Descriptions
              {...descProps}
              title={renderHtml({ html: title, methods })}
              extra={extra}
            />
          )}
          {hasChildren &&
            group.children.map((child, i) => renderGroup(child, 1, i))}
        </React.Fragment>
      );
    }

    // Nested: wrap in Card inner
    return (
      <Card type="inner" title={title} key={`${depth}-${index}`} size="small">
        {hasFields && renderDescriptions(group, null)}
        {hasChildren &&
          group.children.map((child, i) => renderGroup(child, depth + 1, i))}
      </Card>
    );
  }

  return (
    <div id={blockId}>
      {groups.map((group, i) =>
        renderGroup(
          group,
          0,
          i,
          i === 0 && content.extra ? content.extra() : undefined,
        ),
      )}
    </div>
  );
};

export default withTheme(
  "DataDescriptions",
  withBlockDefaults(DataDescriptions),
);
```

`withTheme` is imported from `@lowdefy/blocks-antd/blocks/withTheme.js` via its wildcard export. It wraps the component in an antd `ConfigProvider` to scope `properties.theme` design tokens to this component.

### meta.js

```js
export default {
  category: "display",
  icons: [
    "AiOutlineEnvironment",
    "AiOutlineCluster",
    "AiOutlineUser",
    "AiOutlinePaperClip",
  ],
  slots: {
    extra: "Extra content in the header.",
  },
  cssKeys: {
    element: "The Descriptions element.",
    content: "The Descriptions content.",
    label: "The Descriptions label.",
  },
};
```

### Preprocessing output format

The adapted preprocessing outputs a **tree of groups** — each group has `fields` (leaf items) and `children` (nested sub-groups). This preserves the nesting hierarchy so the renderer can decide how to visually represent depth (bare Descriptions at root, Card inner for nested).

```js
[
  {
    title: "Contact Details", // or null for untitled sections
    fields: [
      {
        type: "field",
        key: "name",
        value: "John",
        label: "Name",
        fieldType: "string",
        isArray: false,
        fullWidth: false,
      },
      {
        type: "field",
        key: "email",
        value: "john@test.com",
        label: "Email",
        fieldType: "email",
        isArray: false,
        fullWidth: false,
      },
    ],
    children: [
      {
        title: "Address",
        fields: [
          {
            type: "field",
            key: "city",
            value: "NYC",
            label: "City",
            fieldType: "string",
            isArray: false,
            fullWidth: false,
          },
        ],
        children: [],
      },
    ],
  },
];
```

The key adaptation from DataView's preprocessing: instead of wrapping fields in `createGridNode()` and producing a tree, the adapted `processConfigItems` and `buildObjectStructure` push fields directly into items arrays (no grid wrapping). The `preprocessData` entry point then recursively walks the resulting structure tree, collecting each section's direct fields and nested sub-sections into a group tree. This correctly handles nested formConfig sections, controlled_list arrays, and deeply nested auto-detected objects — preserving the hierarchy for Card-based rendering.

### Profile view usage (before/after)

**Before (DataView):**

```yaml
- id: profile_data
  type: DataView
  properties:
    sectionCards: false
    maxColumns: 2
    data: ...
    formConfig: ...
```

**After (DataDescriptions):**

```yaml
- id: profile_data
  type: DataDescriptions
  properties:
    bordered: true
    column: 2
    size: small
    data: ...
    formConfig: ...
```

## Key Decisions

1. **New block, not a DataView mode.** DataView is CSS-grid based with a specific visual language (cards, sections, label-above-value). Adding a `bordered` mode would require conditional rendering throughout. A separate block with shared preprocessing is cleaner.

2. **Standard Descriptions API.** Properties match the Lowdefy Descriptions block — `bordered`, `colon`, `column`, `layout`, `size`, `theme`, CSS keys, `extra` slot. Only the data source props (`data`/`formConfig` instead of `items`/`itemOptions`) and DataView features (`disableCrmLinks`, `s3GetPolicyRequestId`) are different. `title` is omitted — section titles come from formConfig; a block-level title that only works for single-group data would be inconsistent.

3. **Copy and adapt preprocessing, don't import from DataView.** The preprocessing pipeline, field types, and value renderers are copied into DataDescriptions and the preprocessing is adapted to output a group tree (no grid wrapping, nesting preserved). This makes the block self-contained and avoids coupling to DataView's internal structure.

4. **`withTheme` wrapping.** Same pattern as Lowdefy Descriptions — enables `properties.theme` for antd design token customization (label colors, backgrounds, spacing).

5. **Card inner for nested groups, bare Descriptions at root.** Ant Design Descriptions renders as a `<table>` — nesting tables creates visual artifacts. Top-level sections render as sibling `<Descriptions>` groups. Nested sections render as `<Card type="inner">` wrapping a `<Descriptions>`. This mirrors DataView's one-level-of-Card pattern. If inner Cards prove too heavy visually, they can be swapped for plain divs.

6. **`bordered: true` by default.** Unlike standard Descriptions (`false`), this block defaults to bordered — that's the primary reason it exists.

7. **`column` replaces `maxColumns`.** Uses Ant Design's native responsive system (`{ xs: 1, sm: 2 }`) instead of DataView's custom maxColumns cap.

8. **fullWidth fields use `span: "filled"`.** Ant Design v5.22+ supports `"filled"` which spans remaining columns — perfect for rich text, long text, and location fields.

## Non-Goals

- **Replacing DataView.** DataView remains better for complex nested data displays, card-based layouts, and 3-column grids. DataDescriptions is for structured bordered displays.
- **Supporting `items`/`itemOptions`.** Use the standard Descriptions block for manual item lists. DataDescriptions is specifically for auto-rendering from data objects.

## Open Questions

1. **Card inner visual weight.** Nested sections use `<Card type="inner">`. If deeply nested data produces too many nested cards, may swap to plain divs with header styling for level 2+. Will confirm once implemented.
