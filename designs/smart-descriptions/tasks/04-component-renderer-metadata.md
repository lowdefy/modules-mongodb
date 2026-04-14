# Task 4: Create SmartDescriptions Component, Renderer, Metadata, and Register in Plugin

## Context

Tasks 1–3 created the field type infrastructure, `processData.js` (auto-discovery), and `processFields.js` (fields mode). This task creates the main component that ties everything together: the React component, the unified value renderer, block metadata, property schema, and plugin registration.

The existing DataDescriptions component at `blocks/DataDescriptions/DataDescriptions.js` has ~112 lines with recursive group rendering (Card wrappers at depth 1+, bare Descriptions at depth 0). SmartDescriptions is simpler — always a single flat `<Descriptions>` component with no nesting.

## Task

### 1. Create renderValue.js

Create `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/renderValue.js`.

This file replaces both `DataDescriptions/core/renderFieldValue.js` and `DataDescriptions/core/renderArray.js`. It consolidates array handling into one function.

```js
import React from "react";
import { getFieldTypeConfig } from "./fieldTypes/getFieldTypeConfig.js";

function renderValue(item, Icon, methods, properties) {
  const { value, fieldType, isArray, options } = item;

  // Null/empty handling for fields mode
  // In fields mode, null/undefined/empty values should show "Not set"
  if (value === null || value === undefined) {
    return <span className="dataview-value dataview-value-null">Not set</span>;
  }
  if (value === "") {
    return <span className="dataview-value dataview-value-null">Not set</span>;
  }
  if (Array.isArray(value) && value.length === 0) {
    return <span className="dataview-value dataview-value-null">Not set</span>;
  }

  const config = getFieldTypeConfig(fieldType);

  // Handle arrays
  if (isArray && Array.isArray(value)) {
    // Custom array rendering (if field type defines renderArray)
    if (config?.renderArray) {
      return config.renderArray({
        value,
        Icon,
        methods,
        properties,
        fieldType,
        options,
      });
    }

    // Typed array — render each item with single-value render
    if (config?.render) {
      if (value.length === 1) {
        return config.render({
          value: value[0],
          Icon,
          methods,
          properties,
          fieldType,
          options,
        });
      }

      return (
        <div className="dataview-special-array">
          {value.map((v, index) => (
            <div className="dataview-special-array-item" key={index}>
              {config.render({
                value: v,
                Icon,
                methods,
                properties,
                fieldType,
                options,
              })}
            </div>
          ))}
        </div>
      );
    }
  }

  // Non-array — use render function from registry
  if (config?.render) {
    return config.render({
      value,
      Icon,
      methods,
      properties,
      fieldType,
      options,
    });
  }

  // Fallback
  return <span className="dataview-value">{String(value)}</span>;
}

export default renderValue;
```

Key differences from DataDescriptions' `renderFieldValue.js`:

- Passes `options` through to registry render calls (for selector label lookup)
- Handles null/empty values directly (returns "Not set") instead of relying on the null/undefined field types
- No recursive `renderFieldValue` callback passed to `renderArray` — the array logic is inline

### 2. Create SmartDescriptions.js

Create `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/SmartDescriptions.js`.

```js
import React, { useMemo } from "react";
import { renderHtml, withBlockDefaults } from "@lowdefy/block-utils";
import { Descriptions } from "antd";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import processData from "./processData.js";
import processFields from "./processFields.js";
import renderValue from "./renderValue.js";
import "./style.module.css";

const SmartDescriptions = ({
  blockId,
  classNames = {},
  content,
  properties,
  components: { Icon },
  methods,
  styles = {},
}) => {
  const { data, fields } = properties;

  const items = useMemo(() => {
    if (!data) return [];
    return fields ? processFields(data, fields) : processData(data);
  }, [data, fields]);

  if (!items.length) {
    return <div id={blockId}>No data to display</div>;
  }

  const title = properties.title
    ? renderHtml({ html: properties.title, methods })
    : null;

  const extra = content.extra ? content.extra() : undefined;

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

  return (
    <div id={blockId}>
      <Descriptions {...descProps} title={title} extra={extra}>
        {items.map((item, i) => (
          <Descriptions.Item
            key={i}
            label={item.label}
            span={item.fullWidth ? "filled" : 1}
          >
            {renderValue(item, Icon, methods, properties)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </div>
  );
};

export default withTheme(
  "SmartDescriptions",
  withBlockDefaults(SmartDescriptions),
);
```

Key differences from DataDescriptions:

- No `Card` import — no nesting
- No `renderGroup` / `renderDescriptions` recursive functions
- Uses `processData` or `processFields` instead of `preprocessData`
- Uses `renderValue` instead of `renderFieldValue`
- Reads `fields` instead of `formConfig` from properties
- Single `<Descriptions>` output, always flat

### 3. Create meta.js

Create `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/meta.js`.

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

Same as DataDescriptions — identical category, icons, slots, and cssKeys.

### 4. Create schema.json

Create `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/schema.json`.

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
      "description": "Label position relative to value."
    },
    "size": {
      "type": "string",
      "enum": ["default", "small"],
      "description": "Size of the descriptions block."
    },
    "theme": {
      "type": "object",
      "description": "Antd design token overrides. See https://ant.design/components/descriptions#design-token.",
      "properties": {
        "labelBg": { "type": "string" },
        "labelColor": { "type": "string" },
        "titleColor": { "type": "string" },
        "titleMarginBottom": { "type": "number" },
        "itemPaddingBottom": { "type": "number" },
        "itemPaddingEnd": { "type": "number" },
        "colonMarginRight": { "type": "number" },
        "colonMarginLeft": { "type": "number" },
        "contentColor": { "type": "string" },
        "extraColor": { "type": "string" }
      }
    },
    "title": {
      "type": "string",
      "description": "Descriptions header title."
    },
    "data": {
      "type": "object",
      "description": "Data object to display. Field IDs and auto-discovered keys resolve paths here."
    },
    "fields": {
      "type": "array",
      "description": "Lowdefy block definitions as field hints. When provided, only these fields render. Each entry uses id (data path), type (renderer hint), and properties.title/options.",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Dot-notation path into the data object."
          },
          "type": {
            "type": "string",
            "description": "Lowdefy block type (e.g., TextInput, Selector, PhoneNumberInput). Determines which renderer to use."
          },
          "properties": {
            "type": "object",
            "properties": {
              "title": {
                "type": "string",
                "description": "Display label for the field."
              },
              "options": {
                "type": "array",
                "description": "Options for selector types. String array or [{label, value}] array."
              }
            }
          }
        },
        "required": ["id"]
      }
    },
    "disableCrmLinks": {
      "type": "boolean",
      "default": false,
      "description": "Disable hyperlinks for contact and company fields."
    },
    "contactDetailPageId": {
      "type": "string",
      "default": "contacts/contact-detail",
      "description": "Page ID for contact detail links."
    },
    "companyDetailPageId": {
      "type": "string",
      "default": "companies/company-detail",
      "description": "Page ID for company detail links."
    },
    "s3GetPolicyRequestId": {
      "type": "string",
      "description": "Request ID for S3 file download policy."
    }
  }
}
```

Key differences from DataDescriptions schema:

- `formConfig` replaced with `fields` (array of Lowdefy block definitions)
- Added `title` property (top-level, not nested in formConfig)
- Added `contactDetailPageId` and `companyDetailPageId` (were implicit defaults in DataDescriptions renderers, now explicit properties)
- Removed defaults from `colon`, `layout`, `size`, and theme token properties (only `bordered` and `column` have defaults)

### 5. Register in Plugin Exports

**Modify `plugins/modules-mongodb-plugins/src/blocks.js`** — add SmartDescriptions export:

```js
export { default as DataDescriptions } from "./blocks/DataDescriptions/DataDescriptions.js";
export { default as EventsTimeline } from "./blocks/EventsTimeline/EventsTimeline.js";
export { default as FileManager } from "./blocks/FileManager/FileManager.js";
export { default as SmartDescriptions } from "./blocks/SmartDescriptions/SmartDescriptions.js";
```

**Modify `plugins/modules-mongodb-plugins/src/metas.js`** — add SmartDescriptions meta export:

```js
export { default as DataDescriptions } from "./blocks/DataDescriptions/meta.js";
export { default as EventsTimeline } from "./blocks/EventsTimeline/meta.js";
export { default as FileManager } from "./blocks/FileManager/meta.js";
export { default as SmartDescriptions } from "./blocks/SmartDescriptions/meta.js";
```

### 6. Build Verification

Run the plugin build to verify no import errors:

```bash
cd plugins/modules-mongodb-plugins && pnpm build
```

This compiles all source files with SWC. Any broken imports, syntax errors, or missing files will fail the build.

## Acceptance Criteria

- `renderValue.js` renders "Not set" for null, undefined, empty string, and empty array values
- `renderValue.js` passes `options` through to registry render calls
- `renderValue.js` handles both array and non-array items
- `SmartDescriptions.js` selects processFields when `fields` is provided, processData when not
- `SmartDescriptions.js` renders a single flat `<Descriptions>` — no `<Card>` imports, no recursive rendering
- `SmartDescriptions.js` passes `title` and `extra` content area to `<Descriptions>`
- `SmartDescriptions.js` uses `span="filled"` for fullWidth items
- `SmartDescriptions.js` is wrapped with `withTheme("SmartDescriptions", withBlockDefaults(...))`
- `meta.js` has category "display", slots `{ extra }`, and cssKeys `{ element, content, label }`
- `schema.json` validates: `data` (object), `fields` (array of block definitions), `title`, `bordered`, `column`, `size`, `layout`, `colon`, `theme`, `disableCrmLinks`, `contactDetailPageId`, `companyDetailPageId`, `s3GetPolicyRequestId`
- `src/blocks.js` exports SmartDescriptions
- `src/metas.js` exports SmartDescriptions meta
- `pnpm build` succeeds in the plugin directory

## Files

- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/renderValue.js` — create (new)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/SmartDescriptions.js` — create (new)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/meta.js` — create (new)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/schema.json` — create (new)
- `plugins/modules-mongodb-plugins/src/blocks.js` — modify (add SmartDescriptions export)
- `plugins/modules-mongodb-plugins/src/metas.js` — modify (add SmartDescriptions meta export)

## Notes

- DataDescriptions is NOT removed in this task. It remains in the plugin alongside SmartDescriptions until all consumers are migrated (module-field-pattern design).
- The `<Card>` import from antd is intentionally absent — SmartDescriptions never nests.
- The `renderHtml` import from `@lowdefy/block-utils` is used for the title property (same as DataDescriptions) to support HTML titles.
