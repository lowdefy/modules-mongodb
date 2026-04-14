# Task 1: Scaffold SmartDescriptions and Port Field Type Infrastructure

## Context

The existing DataDescriptions block lives at `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/`. SmartDescriptions reuses most of DataDescriptions' field type infrastructure (20 type detectors and renderers) but replaces the entire preprocessing/rendering pipeline. This task creates the new directory structure and copies or creates all foundational files that tasks 2–4 depend on.

## Task

### 1. Create Directory Structure

Create the SmartDescriptions directory tree under `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/`:

```
blocks/SmartDescriptions/
├── fieldTypes/
│   ├── fieldTypeRegistry.js
│   ├── getFieldTypeConfig.js
│   ├── getFieldTypesByPriority.js
│   └── blockTypeMap.js
├── utils/
│   ├── formatFieldName.js
│   ├── formatValue.js
│   └── getByDotNotation.js
└── style.module.css
```

### 2. Copy Unchanged Files

Copy these files exactly from `blocks/DataDescriptions/` — no modifications:

- `fieldTypes/getFieldTypeConfig.js` → `SmartDescriptions/fieldTypes/getFieldTypeConfig.js`
- `fieldTypes/getFieldTypesByPriority.js` → `SmartDescriptions/fieldTypes/getFieldTypesByPriority.js`
- `utils/formatFieldName.js` → `SmartDescriptions/utils/formatFieldName.js`
- `utils/formatValue.js` → `SmartDescriptions/utils/formatValue.js`
- `style.module.css` → `SmartDescriptions/style.module.css`

### 3. Copy and Modify fieldTypeRegistry.js

Copy `DataDescriptions/fieldTypes/fieldTypeRegistry.js` to `SmartDescriptions/fieldTypes/fieldTypeRegistry.js`, then make two modifications:

**a) Enhance the selector renderer** to accept and use an `options` parameter for label lookup:

```js
selector: {
  priority: 98,
  detect: () => false,
  render: ({ value, options }) => {
    // If options provided (fields mode), look up label
    if (options?.length) {
      const label = lookupLabel(value, options);
      if (label) return <span className="dataview-tag">{label}</span>;
    }
    // Fallback: extract displayable value from object, or show raw
    const displayValue = type.isObject(value)
      ? value.name || value.label || value.id || value._id || String(value)
      : String(value);
    return <span className="dataview-tag">{formatValue(displayValue)}</span>;
  },
  renderArray: ({ value, options }) => (
    <div className="dataview-tags">
      {value.map((item, index) => {
        let displayValue;
        if (options?.length) {
          const label = lookupLabel(item, options);
          if (label) {
            displayValue = label;
          }
        }
        if (!displayValue) {
          displayValue = type.isObject(item)
            ? item.name || item.label || item.id || item._id || String(item)
            : String(item);
        }
        return (
          <span className="dataview-tag" key={index}>
            {formatValue(displayValue)}
          </span>
        );
      })}
    </div>
  ),
  fullWidth: false,
  componentHints: [
    "selector",
    "radio_selector",
    "enum_selector",
    "device_type_selector",
    "button_selector",
    "multiple_selector",
  ],
},
```

Add a `lookupLabel` helper function at the top of the file (after imports):

```js
function lookupLabel(value, options) {
  if (!options || !options.length) return null;

  for (const opt of options) {
    // String options: ["Mr", "Ms"] — value is its own label
    if (type.isString(opt)) {
      if (opt === value) return opt;
      continue;
    }
    // Object options: [{ label, value }] — match by value field
    if (type.isObject(opt) && opt.value === value) {
      return opt.label ?? String(opt.value);
    }
  }
  return null;
}
```

**b) Fix the location renderer** to guard against missing `geometry`:

The current location renderer assumes `value.geometry.location` exists when building the link. When a location only has `formatted_address` without `geometry`, this crashes. Fix:

```js
location: {
  priority: 40,
  detect: (value) =>
    type.isObject(value) &&
    ("formatted_address" in value ||
      (value.geometry && value.geometry.location)),
  render: ({ value, Icon }) => {
    const address =
      value.formatted_address ??
      `${value.geometry.location.lat}, ${value.geometry.location.lng}`;

    // Guard: if no geometry, render address as plain text
    if (!value.geometry?.location) {
      return (
        <span className="dataview-value">
          <Icon blockId="location-icon" properties="AiOutlineEnvironment" />{" "}
          {address}
        </span>
      );
    }

    const { lat, lng } = value.geometry.location;
    const coordinates = `${lat},${lng}`;
    const query = encodeURIComponent(coordinates);

    return (
      <span className="dataview-value">
        <a
          className="dataview-link"
          href={`https://maps.google.com/?q=${query}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          <Icon blockId="location-icon" properties="AiOutlineEnvironment" />{" "}
          {address}
        </a>
      </span>
    );
  },
  fullWidth: true,
  componentHints: ["location"],
},
```

### 4. Create blockTypeMap.js

New file at `SmartDescriptions/fieldTypes/blockTypeMap.js`. Maps Lowdefy block type names to field type names in the registry:

```js
// Maps Lowdefy input block types to field type registry names.
// Used in fields mode to determine which renderer to use.
// Unknown block types fall back to auto-detection from the value.

const blockTypeMap = {
  TextInput: "string",
  TextArea: "longText",
  NumberInput: "number",
  Selector: "selector",
  MultipleSelector: "selector",
  RadioSelector: "selector",
  ButtonSelector: "selector",
  CheckboxSelector: "selector",
  Switch: "boolean",
  CheckboxSwitch: "boolean",
  DateSelector: "date",
  DateTimeSelector: "datetime",
  DateRangeSelector: "dateRange",
  PhoneNumberInput: "phoneNumber",
  LocationSelector: "location",
  S3UploadButton: "fileList",
  TiptapInput: "richText",
  ContactSelectorNumberRequired: "contact",
};

export default blockTypeMap;
```

### 5. Create getByDotNotation.js

New file at `SmartDescriptions/utils/getByDotNotation.js`. Resolves dot-notation paths (e.g., `"profile.phone_number"`) into nested objects:

```js
function getByDotNotation(obj, path) {
  if (!obj || !path) return undefined;
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

export default getByDotNotation;
```

Note: DataDescriptions used `get()` from `@lowdefy/helpers` for this. SmartDescriptions uses a local utility instead to avoid the dependency on the specific behavior of the helpers' `get` function (which handles arrays and other edge cases that aren't needed here).

## Acceptance Criteria

- Directory structure matches the file structure in the design document
- All 5 copied files are byte-identical to their DataDescriptions originals
- `fieldTypeRegistry.js` has the `lookupLabel` helper and enhanced selector render/renderArray
- `fieldTypeRegistry.js` location renderer handles `{ formatted_address: "..." }` without crashing (no `geometry` property)
- `blockTypeMap.js` contains all 18 block type mappings from the design's mapping table
- `getByDotNotation.js` resolves `"a.b.c"` to nested value, returns `undefined` for missing paths
- No import errors — all relative import paths between the copied files are correct (they reference `../utils/formatValue.js`, `./fieldTypeRegistry.js`, etc., which are at the same relative positions)

## Files

- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/fieldTypes/fieldTypeRegistry.js` — create (copy + modify from DataDescriptions)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/fieldTypes/getFieldTypeConfig.js` — create (copy from DataDescriptions)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/fieldTypes/getFieldTypesByPriority.js` — create (copy from DataDescriptions)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/fieldTypes/blockTypeMap.js` — create (new)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/utils/formatFieldName.js` — create (copy from DataDescriptions)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/utils/formatValue.js` — create (copy from DataDescriptions)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/utils/getByDotNotation.js` — create (new)
- `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/style.module.css` — create (copy from DataDescriptions)
