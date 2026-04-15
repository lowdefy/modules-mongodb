# Task 2: Scaffold DataDescriptions block

## Context

Task 1 created the `DataDescriptions/` directory with adapted preprocessing that outputs `[{ title, fields, children }]` (a tree of groups preserving nesting), plus copied fieldTypes, core renderers, and utils. This task creates the React component, block metadata, schema, and registers it as a Lowdefy plugin block.

The block follows the same pattern as the existing Lowdefy Descriptions block (`@lowdefy/blocks-antd/dist/blocks/Descriptions/Descriptions.js`) but replaces `items`/`itemOptions` with DataView's `data`/`formConfig` preprocessing.

**Key references:**

- DataView entry point: `plugins/modules-mongodb-plugins/src/blocks/DataView/DataView.js`
- DataView meta: `plugins/modules-mongodb-plugins/src/blocks/DataView/meta.js`
- Block registration: `plugins/modules-mongodb-plugins/src/blocks.js` and `plugins/modules-mongodb-plugins/src/metas.js`
- Lowdefy Descriptions source: `@lowdefy/blocks-antd/dist/blocks/Descriptions/Descriptions.js` (in node_modules)
- Preprocessing created in task 1: `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/preprocessing/preprocessData.js`

## Task

### 1. Create `DataDescriptions.js`

Create `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/DataDescriptions.js`.

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

  // Recursively render a group and its children.
  // Top-level groups (depth 0) render as bare Descriptions.
  // Nested groups (depth 1+) render as Card type="inner" wrapping Descriptions.
  function renderGroup(group, depth, index, extra) {
    const title = group.title || null;
    const hasFields = group.fields?.length > 0;
    const hasChildren = group.children?.length > 0;

    if (depth === 0) {
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

Key points:

- `renderFieldValue` handles arrays internally (checks `isArray` and delegates to `renderArray`), so we just call it for every field.
- `properties.bordered` defaults to `true` (unlike standard Descriptions which defaults to `false`).
- `properties.column` defaults to `2`.
- **Nesting uses Card inner:** top-level groups (depth 0) render as bare `<Descriptions>`. Nested groups (depth 1+) render as `<Card type="inner">` wrapping a `<Descriptions>`. This avoids nesting Descriptions tables inside each other.
- The `extra` content slot only renders on the first Descriptions group.
- CSS keys (`element`, `content`, `label`) are wired via `classNames` and `styles` passthrough to antd's semantic API.
- `withTheme("DataDescriptions", ...)` enables `properties.theme` for antd design token overrides. Imported from `@lowdefy/blocks-antd/blocks/withTheme.js` (already a peer dependency).
- `import "./style.css"` loads the value-type CSS classes used by field type renderers (see step 2).

### 2. Create `style.css`

Create `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/style.css`.

Extract the value-type CSS rules from DataView's `style.module.css` (the `:global()` rules for classes used by field type renderers). Include all `dataview-value*`, `dataview-link*`, `dataview-tag*`, `dataview-richtext`, `dataview-value-longtext`, `dataview-special-array*` rules. Exclude DataView-specific layout classes (grid, section, card, container, responsive).

The field type renderers use plain string class names (not CSS module references), so this file is a plain CSS file — not a CSS module. The `import "./style.css"` in `DataDescriptions.js` ensures these styles are loaded when the block is used, independent of whether DataView is also present on the page.

### 3. Create `meta.js`

Create `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/meta.js`.

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

Icons are the same as DataView because the same field type renderers (contact, company, location, file) are used.

### 4. Create `schema.json`

Create `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/schema.json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "bordered": {
      "type": "boolean",
      "default": true,
      "description": "Render items in a bordered table. Defaults to true."
    },
    "colon": {
      "type": "boolean",
      "default": true,
      "description": "Include a colon after labels."
    },
    "column": {
      "default": 2,
      "oneOf": [
        {
          "type": "number",
          "description": "The number of description items in a row."
        },
        {
          "type": "object",
          "properties": {
            "xs": { "type": "integer" },
            "sm": { "type": "integer" },
            "md": { "type": "integer" },
            "lg": { "type": "integer" },
            "xl": { "type": "integer" }
          }
        }
      ]
    },
    "layout": {
      "type": "string",
      "enum": ["horizontal", "vertical"],
      "default": "horizontal",
      "description": "Label position relative to value. Horizontal puts labels to the left."
    },
    "size": {
      "type": "string",
      "enum": ["default", "small"],
      "default": "default",
      "description": "Size of the descriptions block."
    },
    "theme": {
      "type": "object",
      "description": "Antd design token overrides for this block. See https://ant.design/components/descriptions#design-token.",
      "properties": {
        "labelBg": { "type": "string", "default": "rgba(0, 0, 0, 0.02)" },
        "labelColor": { "type": "string", "default": "rgba(0, 0, 0, 0.45)" },
        "titleColor": { "type": "string", "default": "rgba(0, 0, 0, 0.88)" },
        "titleMarginBottom": { "type": "number", "default": 20 },
        "itemPaddingBottom": { "type": "number", "default": 16 },
        "itemPaddingEnd": { "type": "number", "default": 16 },
        "colonMarginRight": { "type": "number", "default": 8 },
        "colonMarginLeft": { "type": "number", "default": 2 },
        "contentColor": { "type": "string", "default": "rgba(0, 0, 0, 0.88)" },
        "extraColor": { "type": "string", "default": "rgba(0, 0, 0, 0.88)" }
      }
    },
    "data": {
      "type": "object",
      "description": "The data object to display. Supports nested objects, arrays, and various data types with automatic type detection and formatting."
    },
    "formConfig": {
      "type": "object",
      "description": "Configuration object defining how to structure and display the data. Allows customization of sections, field ordering, labels, and component hints for type detection.",
      "properties": {
        "component": {
          "type": "string",
          "enum": ["section"],
          "description": "Component type, typically 'section' for the root."
        },
        "title": {
          "type": "string",
          "description": "Title for the section."
        },
        "form": {
          "type": "array",
          "description": "Array of field configurations or nested sections.",
          "items": {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "description": "The data field key to display. Supports dot notation for nested fields (e.g., 'user.name')."
              },
              "title": {
                "type": "string",
                "description": "Custom label for the field. If not provided, the key will be formatted automatically."
              },
              "component": {
                "type": "string",
                "description": "Component hint for type detection (e.g., 'selector', 'date_selector', 'contact_selector_number_required'). Helps DataView determine the correct rendering type."
              }
            }
          }
        }
      }
    },
    "disableCrmLinks": {
      "type": "boolean",
      "default": false,
      "description": "Disable hyperlinks for contact and company fields."
    },
    "s3GetPolicyRequestId": {
      "type": "string",
      "description": "Request ID for S3 file download policy."
    }
  }
}
```

### 5. Register the block

Add exports to the plugin registration files:

**`plugins/modules-mongodb-plugins/src/blocks.js`** — add:

```js
export { default as DataDescriptions } from "./blocks/DataDescriptions/DataDescriptions.js";
```

**`plugins/modules-mongodb-plugins/src/metas.js`** — add:

```js
export { default as DataDescriptions } from "./blocks/DataDescriptions/meta.js";
```

### 6. Build

Run `pnpm build` in `plugins/modules-mongodb-plugins/` to compile the new block to `dist/`.

## Acceptance Criteria

- `DataDescriptions.js`, `meta.js`, and `schema.json` exist in `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/`.
- Block is registered in `blocks.js` and `metas.js`.
- `pnpm build` in the plugin directory succeeds without errors.
- The block can be used in a Lowdefy page YAML as `type: DataDescriptions` with `data` and `formConfig` properties.
- Renders an antd `<Descriptions>` component with bordered table layout.
- Field values are rendered using type-aware renderers (dates formatted, booleans as Yes/No, emails as links, etc.).
- The `extra` content slot renders in the first Descriptions header area.
- Top-level sections produce separate `<Descriptions>` groups. Nested sections render inside `<Card type="inner">` wrapping their own `<Descriptions>`.
- CSS keys (`element`, `content`, `label`) are wired through to antd Descriptions.
- `style.css` exists with value-type CSS classes extracted from DataView's `style.module.css`. Field values are visually styled (boolean colors, link styling, tag backgrounds, null/empty dimming) without requiring DataView on the page.

## Files

- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/DataDescriptions.js` — **create** — main component
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/style.css` — **create** — value-type CSS classes
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/meta.js` — **create** — block metadata
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/schema.json` — **create** — property schema
- `plugins/modules-mongodb-plugins/src/blocks.js` — **modify** — add DataDescriptions export
- `plugins/modules-mongodb-plugins/src/metas.js` — **modify** — add DataDescriptions meta export

## Notes

- The `content.extra` slot may not be present if no slot is defined in the YAML. Guard with `content.extra ? content.extra() : undefined`.
- `renderHtml` from `@lowdefy/block-utils` returns `undefined` when given a falsy value, which is safe to pass as the `title` prop.
- `renderFieldValue` imports `renderArray` internally and checks `isArray`, so we don't need to handle arrays separately — just call `renderFieldValue` for every field.
- All preprocessing imports are local (`./preprocessing/`, `./core/`) — no cross-block imports from DataView.
