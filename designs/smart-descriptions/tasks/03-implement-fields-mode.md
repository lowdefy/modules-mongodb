# Task 3: Implement Fields Mode (processFields.js)

## Context

Task 1 set up the field type infrastructure including `blockTypeMap.js` (block type → field type mapping) and `getByDotNotation.js`. This task implements the fields mode — when `fields` is provided, SmartDescriptions resolves each field definition against the data object and determines the appropriate renderer.

Fields mode uses standard Lowdefy block definitions (the same blocks used in edit forms) as the input format. The block's `type` determines which renderer to use via the block type map. This replaces DataDescriptions' custom `formConfig` format (`{ key, title, component }` arrays).

## Task

Create `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/processFields.js`.

### Function Signature

```js
import { type } from "@lowdefy/helpers";
import blockTypeMap from "./fieldTypes/blockTypeMap.js";
import detectFieldType from "./fieldTypes/detectFieldType.js";
import formatFieldName from "./utils/formatFieldName.js";
import getByDotNotation from "./utils/getByDotNotation.js";

function processFields(data, fields) → Array<Item>
```

### Item Shape

Same shape as processData returns:

```js
{
  key: "profile.phone_number",
  value: { phone_number: "+1...", ... },
  label: "Phone Number",
  fieldType: "phoneNumber",
  isArray: false,
  fullWidth: false,
  options: [{ label: "Engineering", value: "eng" }], // populated for selector types
}
```

### Algorithm

```
processFields(data, fields):
  if !fields or !Array.isArray(fields) → return []
  items = []

  for each field in fields:
    if !field or !field.id → continue

    // 1. Resolve data value
    value = getByDotNotation(data, field.id)

    // 2. Determine label
    label = field.properties?.title ?? formatFieldName(lastSegment(field.id))

    // 3. Determine field type
    fieldType = null
    isArray = false
    fullWidth = false

    // Try block type mapping first
    if field.type and blockTypeMap[field.type]:
      fieldType = blockTypeMap[field.type]
      config = getFieldTypeConfig(fieldType)
      isArray = type.isArray(value)
      fullWidth = config?.fullWidth ?? false
    else:
      // Unknown block type or no type — fall back to auto-detection
      typeInfo = detectFieldType(value)
      if typeInfo:
        fieldType = typeInfo.type
        isArray = typeInfo.isArray
        fullWidth = typeInfo.config?.fullWidth ?? false
      else:
        // Final fallback: string
        fieldType = "string"

    // 4. Extract options for selector types
    options = null
    if fieldType === "selector":
      options = field.properties?.options ?? null

    // 5. Handle null/empty — still include the item (fields mode shows "Not set")
    //    The renderer handles null/empty display. We just ensure the item is in the list.

    items.push({
      key: field.id,
      value,
      label,
      fieldType,
      isArray,
      fullWidth,
      options,
    })

  return items
```

### Key Behaviors

**Label resolution:**

- Primary: `field.properties.title` — explicit label from the block definition
- Fallback: Format the last segment of the `id` path. `"profile.phone_number"` → format `"phone_number"` → `"Phone Number"`

```js
function lastSegment(id) {
  const parts = id.split(".");
  return parts[parts.length - 1];
}
```

**Block type mapping:**
The `blockTypeMap` (created in task 1) maps Lowdefy block types to field type names:

- `TextInput` → `"string"`, `Selector` → `"selector"`, `PhoneNumberInput` → `"phoneNumber"`, etc.
- Unknown block types (not in the map) fall back to `detectFieldType(value)` — value-based auto-detection
- If auto-detection also fails (value is an unrecognized object), final fallback is `"string"`

**Options passthrough:**

- Only extracted when `fieldType === "selector"`
- Passed through to the item's `options` field for the selector renderer to use
- Supports both string arrays `["Mr", "Ms"]` and object arrays `[{ label, value }]`
- When options is `null` or not provided, the selector renderer falls back to extracting `name`/`label`/`id` from the value object

**Null/empty handling in fields mode:**
Unlike auto-discovery (which skips nulls), fields mode includes every field in the output. The renderer is responsible for displaying "Not set" for null/undefined/empty values. This task just passes the value through — the rendering logic is in task 4 (renderValue.js).

The field type still needs to be resolved even for null values, because the renderer needs to know which "Not set" style to apply. When the value is null/undefined, `detectFieldType` will return `"null"` or `"undefined"` type. But in fields mode, we want to use the field type from the block type mapping (not the detected null/undefined), so the renderer can know what kind of field this is. The null/empty display is handled in renderValue.js (task 4).

**Override for null handling in fields mode:** When the value is null, undefined, empty string, or empty array, AND a block type mapping exists, keep the mapped field type but let renderValue handle the null display. This means: resolve the field type from blockTypeMap regardless of the value, then let the renderer decide how to display it.

**Ignored properties:**
Form-only block properties are naturally ignored — the function only reads `field.id`, `field.type`, `field.properties.title`, and `field.properties.options`. Everything else (`required`, `layout`, `validate`, `style`, `visible`, `areas`, `events`) is not accessed.

## Acceptance Criteria

- `processFields(data, null)` returns `[]`
- `processFields(data, [])` returns `[]`
- `processFields({ name: "Sam" }, [{ id: "name", type: "TextInput", properties: { title: "Full Name" } }])` returns 1 item: `{ key: "name", value: "Sam", label: "Full Name", fieldType: "string", ... }`
- `processFields({ profile: { phone: { phone_number: "+1" } } }, [{ id: "profile.phone", type: "PhoneNumberInput" }])` returns 1 item with `fieldType: "phoneNumber"` and value resolved from dot-notation path
- Selector field with options: `processFields({ team: "eng" }, [{ id: "team", type: "Selector", properties: { title: "Team", options: [{ label: "Engineering", value: "eng" }] } }])` returns item with `options: [{ label: "Engineering", value: "eng" }]`
- Unknown block type: `processFields({ date: "2024-01-01T00:00:00.000Z" }, [{ id: "date", type: "CustomDatePicker" }])` falls back to auto-detection → `fieldType: "date"`
- Missing title: `processFields({ phone_number: "123" }, [{ id: "phone_number", type: "TextInput" }])` derives label `"Phone Number"` from id
- Null value: `processFields({}, [{ id: "name", type: "TextInput", properties: { title: "Name" } }])` returns 1 item with `value: undefined` (field included, not skipped)
- Fields without `id` are skipped

## Files

- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/processFields.js` — create (new)

## Notes

- `detectFieldType.js` was already copied to `SmartDescriptions/fieldTypes/` in task 2. If running task 3 before task 2, copy it now from `blocks/DataDescriptions/preprocessing/helpers/detectFieldType.js`.
- `getFieldTypeConfig` is imported from `./fieldTypes/getFieldTypeConfig.js` (copied in task 1).
