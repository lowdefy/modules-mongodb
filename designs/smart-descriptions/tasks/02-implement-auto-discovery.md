# Task 2: Implement Auto-Discovery Mode (processData.js)

## Context

Task 1 set up the SmartDescriptions directory with the field type infrastructure (registry, detection helpers, utilities). This task implements the auto-discovery mode — when `fields` is not provided, SmartDescriptions walks the `data` object and renders every field it finds.

The key difference from DataDescriptions' `buildStructureFromData.js` is that SmartDescriptions never creates nested sections or card groups. Unrecognized plain objects are recursively flattened with dotted key paths instead of wrapped in sections. The output is always a flat array of items.

The existing DataDescriptions auto-discovery pipeline:

- `preprocessData.js` → `buildStructureFromData.js` → `buildObjectStructure.js` → creates nested section/field trees → `collectGroups()` → recursive group structure with children
- SmartDescriptions replaces all of this with a single `processData.js` → flat item array

## Task

Create `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/processData.js`.

### Function Signature

```js
import { type } from "@lowdefy/helpers";
import detectFieldType from "./fieldTypes/detectFieldType.js";
import formatFieldName from "./utils/formatFieldName.js";

function processData(data) → Array<Item>
```

Note: `detectFieldType.js` should be **copied from DataDescriptions** (`blocks/DataDescriptions/preprocessing/helpers/detectFieldType.js`) into `SmartDescriptions/fieldTypes/detectFieldType.js` as part of this task, with one modification: remove the `getFieldTypeByComponentHint` import and any code path that uses it. SmartDescriptions has no `formConfig` or `componentHint` inputs, so this code path is dead. The remaining logic uses `getFieldTypesByPriority` and `getFieldTypeConfig` which were already copied in task 1.

### Item Shape

Every item in the returned array must match this shape (same shape as processFields returns, so renderValue can handle both):

```js
{
  key: "profile.phone_number",         // dotted key path
  value: { phone_number: "+1...", ... }, // resolved value
  label: "Phone Number",               // display label
  fieldType: "phoneNumber",            // registry type name
  isArray: false,                       // whether value is an array
  fullWidth: false,                     // from registry config
  options: null,                        // always null in auto-discovery
}
```

### Algorithm

```
processData(data):
  if !data or data is not a plain object → return []
  return flattenObject(data, "")

flattenObject(obj, prefix):
  items = []
  for each [key, value] in Object.entries(obj):
    fullKey = prefix ? `${prefix}.${key}` : key

    // Skip null and undefined in auto-discovery mode
    if value is null or undefined → continue

    // Skip empty arrays
    if value is an array and value.length === 0 → continue

    // Try to detect field type
    typeInfo = detectFieldType(value)

    if typeInfo is not null:
      // Recognized type — add as leaf item
      items.push({
        key: fullKey,
        value,
        label: formatLabel(fullKey),
        fieldType: typeInfo.type,
        isArray: typeInfo.isArray,
        fullWidth: typeInfo.config?.fullWidth ?? false,
        options: null,
      })
    else if value is a plain object:
      // Unrecognized object — flatten recursively with dotted keys
      items.push(...flattenObject(value, fullKey))
    // else: should not happen (detectFieldType handles all primitives)

  return items
```

### Label Formatting

Labels are derived from the full dotted key path:

```js
function formatLabel(fullKey) {
  // Split on dots, format each segment, join with space
  return fullKey
    .split(".")
    .map((segment) => formatFieldName(segment))
    .join(" ");
}
```

Examples:

- `"phone_number"` → `"Phone Number"`
- `"address.street"` → `"Address Street"`
- `"user.profile.address.street"` → `"User Profile Address Street"`

### Plain Object Detection

A "plain object" that should be flattened is an object where `detectFieldType` returns `null`. The existing `detectFieldType` already handles this correctly — it tests the value against all registered types by priority and returns `null` if nothing matches. Since all special object types (phoneNumber, contact, company, location, changeStamp, file, fileList, richText) have explicit detection rules, only true structural objects (plain key-value containers) will return `null`.

### Edge Cases

1. **Arrays** are always treated as leaf values (not flattened). `detectFieldType` already handles arrays: it checks if all items match a type, falls back to string type for mixed arrays.

2. **Deeply nested objects** flatten indefinitely: `{ a: { b: { c: "x" } } }` → one item with key `"a.b.c"`, label `"A B C"`. The design acknowledges this can produce verbose labels and considers it acceptable for auto-discovery.

3. **Root-level arrays** (data is an array, not an object) — return empty. The design specifies `data` is an object. DataDescriptions supported root arrays but SmartDescriptions does not need this since `data` always comes from an operator that resolves to an object.

## Acceptance Criteria

- `processData({})` returns `[]`
- `processData(null)` returns `[]`
- `processData({ name: "Sam", email: "sam@test.com" })` returns 2 items: string type for name, email type for email
- `processData({ address: { street: "Main", city: "NYC" } })` returns 2 items with keys `"address.street"` and `"address.city"`, labels `"Address Street"` and `"Address City"`
- `processData({ phone: { phone_number: "+1234", region: { flag: "US", dial_code: "+1" } } })` returns 1 item with fieldType `"phoneNumber"` (recognized object, not flattened)
- `processData({ name: "Sam", hidden: null, list: [] })` returns 1 item (null and empty array skipped)
- `processData({ tags: ["a", "b"] })` returns 1 item with `isArray: true`, `fieldType: "string"`
- All items have `options: null`

## Files

- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/processData.js` — create (new)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/fieldTypes/detectFieldType.js` — create (copy from `blocks/DataDescriptions/preprocessing/helpers/detectFieldType.js`)
