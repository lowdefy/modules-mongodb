# SmartDescriptions Block

## Problem

DataDescriptions works but has two friction points:

1. **Parallel definitions.** Consumers maintain `formConfig` (custom `{ key, title, component }` arrays) separately from form blocks. Same field information in two places, two formats. Divergence is a silent bug.

2. **Config or nothing.** When `formConfig` is provided, auto-detection is skipped entirely. When it's absent, you get full auto-detection but no way to hint "this field is a selector, render it as a tag." There's no middle ground where you give data and optionally enhance with hints.

The block also carries nesting complexity (recursive sections, Card inner wrappers, grid nodes) that adds implementation weight without proportional value — view pages already group visually by using multiple block instances.

## Solution

Replace DataDescriptions with SmartDescriptions. Two modes, both flat:

**Data only** — give it a data object, it auto-detects field types and renders everything. Phone number objects get tel: links, emails get mailto: links, booleans get Yes/No badges, dates get formatted. Good defaults, zero config.

**Data + fields** — give it a data object plus an array of standard Lowdefy block definitions (the same blocks used in the edit form). The block `type` determines the renderer: `PhoneNumberInput` renders a phone number, `Selector` looks up labels from `properties.options`, `TextInput` shows plain text. Only defined fields render. No separate view config needed.

No nesting. No sections. No recursive card wrapping. Always a single flat `<Descriptions>` output.

## Properties

```yaml
- id: profile_view
  type: SmartDescriptions
  properties:
    # --- Data ---
    data: # required — data object to display
      profile:
        _state: profile
    fields: # optional — Lowdefy block definitions as hints
      - id: profile.phone_number
        type: PhoneNumberInput
        properties:
          title: Phone Number
      - id: profile.team
        type: Selector
        properties:
          title: Team
          options:
            - label: Engineering
              value: eng
            - label: Sales
              value: sales

    # --- Standard Descriptions props ---
    title: Profile # Descriptions header title
    bordered: true # default: true
    column: 2 # number or { xs: 1, sm: 2, md: 3 }
    size: small # "default" | "small"
    layout: horizontal # "horizontal" | "vertical"
    colon: true # colon after labels

    # --- DataView features ---
    disableCrmLinks: false # disable contact/company auto-links
    s3GetPolicyRequestId: req_id # for S3 file downloads

    # --- Theme ---
    theme: # antd design tokens (via withTheme)
      labelBg: "rgba(0, 0, 0, 0.02)"

  # CSS keys (same as Descriptions)
  style:
    .element: {}
    .content: {}
    .label: {}

  # Content slot
  areas:
    extra:
      blocks:
        - id: edit_btn
          type: Button
          properties:
            title: Edit
```

| Property               | Type            | Default                      | Description                                                                   |
| ---------------------- | --------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `data`                 | object          | required                     | Data object. Field IDs / auto-discovered keys resolve paths here.             |
| `fields`               | array           | —                            | Lowdefy block definitions. When provided, only these fields render.           |
| `title`                | string          | —                            | Descriptions header title.                                                    |
| `bordered`             | boolean         | `true`                       | Ant Design Descriptions bordered prop.                                        |
| `column`               | number / object | `2`                          | Items per row. Number or responsive object.                                   |
| `size`                 | string          | —                            | `"default"` or `"small"`.                                                     |
| `layout`               | string          | —                            | `"horizontal"` or `"vertical"`.                                               |
| `colon`                | boolean         | —                            | Show colon after labels.                                                      |
| `disableCrmLinks`      | boolean         | `false`                      | Disable contact/company auto-links.                                           |
| `contactDetailPageId`  | string          | `"contacts/contact-detail"`  | Page ID for contact detail links (used by contact and changeStamp renderers). |
| `companyDetailPageId`  | string          | `"companies/company-detail"` | Page ID for company detail links.                                             |
| `s3GetPolicyRequestId` | string          | —                            | Request ID for S3 file downloads.                                             |
| `theme`                | object          | —                            | Antd design token overrides.                                                  |

The defaults for `contactDetailPageId` and `companyDetailPageId` assume the contacts and companies modules use `contacts` and `companies` as entry IDs. In module contexts where entry IDs differ, resolve these at the YAML level:

```yaml
properties:
  contactDetailPageId:
    _module.pageId:
      id: contact-detail
      module: contacts
  companyDetailPageId:
    _module.pageId:
      id: company-detail
      module: companies
```

## Data-Only Mode (Auto-Discovery)

When `fields` is not provided, the block walks the `data` object and renders every field it finds.

### Detection

Each value is tested against the field type registry (same 20 types from DataDescriptions). The registry detects types by value shape — priority-ordered, first match wins:

| Priority | Type        | Detection                                                      | Renderer                                       |
| -------- | ----------- | -------------------------------------------------------------- | ---------------------------------------------- |
| 1        | null        | `value === null`                                               | "Not set" (italic gray)                        |
| 1        | undefined   | `value === undefined`                                          | "-"                                            |
| 35       | fileList    | `{ fileList: [] }`                                             | S3Download links                               |
| 40       | richText    | `{ html\|markdown, text }`                                     | HTML via DangerousHtml                         |
| 40       | changeStamp | `{ timestamp, user: { name, id } }`                            | "by Name on Date, at Time"                     |
| 40       | contact     | `{ (email\|work_phone\|identifier_phone_number), contact_id }` | Contact link                                   |
| 40       | company     | `{ trading_name }`                                             | Company link                                   |
| 40       | file        | `{ key, bucket }`                                              | S3Download link                                |
| 40       | location    | `{ formatted_address\|geometry }`                              | Google Maps link (or text-only if no geometry) |
| 40       | phoneNumber | `{ phone_number, region }`                                     | Flag + tel: link                               |
| 50       | longText    | String > 200 chars or contains `\n`                            | Pre-formatted text, full-width                 |
| 90       | email       | Email regex match                                              | mailto: link                                   |
| 90       | url         | Starts with `http://` or `https://`                            | Clickable link (truncated)                     |
| 90       | date        | ISO string with midnight UTC                                   | `toLocaleDateString()`                         |
| 95       | datetime    | Date object or ISO datetime string                             | `toLocaleString()`                             |
| 95       | dateRange   | Never auto-detected (hint-only)                                | "start - end"                                  |
| 98       | selector    | Never auto-detected (hint-only)                                | Tag badge                                      |
| 100      | string      | Any string                                                     | Plain text                                     |
| 100      | boolean     | `true` / `false`                                               | "Yes" / "No" badge                             |
| 100      | number      | Any number                                                     | `toLocaleString()`                             |

### Flattening Nested Objects

When a value is a plain object that doesn't match any registered type, the block flattens it recursively with dotted key paths:

```
Data:  { address: { street: "Main St", city: "NYC" } }

"address" is a plain object — not a phone number, contact, location, or other known type.
Flatten: address.street → "Main St", address.city → "NYC"

Rendered:
  Address Street: Main St
  Address City:   NYC
```

Labels are derived from the full dotted key path: `address.street` → split on dots → format each segment → join with space → "Address Street".

Deeply nested objects flatten the same way: `a.b.c` → "A B C". If labels get unwieldy, the consumer should switch to fields mode for explicit control.

### Null / Undefined Skipping

In auto-discovery mode, null and undefined values are **skipped** — the field is not rendered at all. This matches the current DataDescriptions behavior where consumers null out fields they don't want shown:

```yaml
data:
  _object.assign:
    - _state: profile
    - profile_created: null # excluded from display
    - picture: null # excluded from display
```

### Arrays

Arrays are always treated as leaf values (not flattened):

- Arrays where all items match a type → rendered with that type's array renderer (e.g., string arrays render as tags)
- Empty arrays → skipped
- Mixed-type arrays → fall back to string tags

## Fields Mode

When `fields` is provided, only the defined fields render. Each entry is a standard Lowdefy block definition.

### Field Resolution

For each entry in `fields`:

1. **Data key**: `field.id` used as dot-notation path into `data`. Example: `profile.phone_number` resolves to `data.profile.phone_number`.
2. **Label**: `field.properties.title`. Falls back to formatted last segment of `id` (e.g., `phone_number` → "Phone Number").
3. **Renderer**: Determined by `field.type` via the block type mapping (see below). If the block type is not recognized, falls back to auto-detection from the value.
4. **Options**: For selector types, `field.properties.options` enables label lookup.
5. **isArray**: Determined by `Array.isArray(value)`. Routes to the field type's array renderer when true.

### Block Type to Renderer Mapping

Block types map to the same field type renderers used in auto-discovery. The block type determines which renderer to use, the value determines what to render.

| Block Type                      | Field Type  | Notes                                           |
| ------------------------------- | ----------- | ----------------------------------------------- |
| `TextInput`                     | string      | Plain text                                      |
| `TextArea`                      | longText    | Pre-formatted text, full-width                  |
| `NumberInput`                   | number      | `toLocaleString()`                              |
| `Selector`                      | selector    | Label lookup from `properties.options`          |
| `MultipleSelector`              | selector    | Tags with label lookup                          |
| `RadioSelector`                 | selector    | Same as Selector                                |
| `ButtonSelector`                | selector    | Same as Selector                                |
| `CheckboxSelector`              | selector    | Same as MultipleSelector                        |
| `Switch`                        | boolean     | "Yes" / "No" badge                              |
| `CheckboxSwitch`                | boolean     | Same as Switch                                  |
| `DateSelector`                  | date        | `toLocaleDateString()`                          |
| `DateTimeSelector`              | datetime    | `toLocaleString()`                              |
| `DateRangeSelector`             | dateRange   | "start - end"                                   |
| `PhoneNumberInput`              | phoneNumber | Flag + tel: link                                |
| `LocationSelector`              | location    | Google Maps link                                |
| `S3UploadButton`                | fileList    | S3Download links                                |
| `TiptapInput`                   | richText    | HTML via DangerousHtml                          |
| `ContactSelectorNumberRequired` | contact     | Contact link                                    |
| _(unknown type)_                | auto-detect | Fall back to value-based detection, then string |

The fallback for unknown block types uses value-based auto-detection. This means project-specific or custom block types still get reasonable rendering without explicit mapping — a custom date picker renders as a formatted date because the value is detected as a date.

### Options Lookup (Selectors)

For selector types, the renderer reads `properties.options` from the field definition:

- String array `["Mr", "Ms"]`: value is its own label.
- Object array `[{ label: "Engineering", value: "eng" }]`: match by `value`, display `label`.
- No options provided or no match found: fall back to current selector rendering (extract `name`/`label`/`id` from object, or show raw value).

### Null and Empty Handling

| Condition            | Display                 |
| -------------------- | ----------------------- |
| Key missing in data  | "Not set" (italic gray) |
| `null`               | "Not set"               |
| `""`                 | "Not set"               |
| `false` with Switch  | "No"                    |
| `0` with NumberInput | "0"                     |
| `[]` empty array     | "Not set"               |

In fields mode, null/undefined/empty values render as "Not set" rather than being skipped — the field was explicitly requested, so its absence is meaningful.

### Ignored Properties

Form-only block properties are silently ignored: `required`, `layout`, `validate`, `style`, `visible`, `areas`, `events`.

## Rendering

Always a single flat `<Descriptions>` component. No sections, no nested cards, no recursive rendering.

```jsx
<div id={blockId}>
  <Descriptions
    bordered={true}
    column={2}
    size="small"
    title="Profile"
    extra={content.extra?.()}
  >
    <Descriptions.Item label="Phone Number">
      {renderFieldValue(field)} {/* Flag + tel: link */}
    </Descriptions.Item>
    <Descriptions.Item label="Team">
      {renderFieldValue(field)} {/* "Engineering" from options lookup */}
    </Descriptions.Item>
    <Descriptions.Item label="Notes" span="filled">
      {renderFieldValue(field)} {/* Pre-formatted text, full row */}
    </Descriptions.Item>
  </Descriptions>
</div>
```

Full-width types (`longText`, `richText`, `location`) use `span: "filled"` to take the remaining columns in the row.

For arrays of full-width types (e.g., multiple longText values), the `span: "filled"` applies to the entire `Descriptions.Item`. The array renderer wraps individual items in a flex container inside the item — each value renders vertically within the single full-width cell.

## Implementation

### Component Approach

```jsx
const SmartDescriptions = ({
  blockId,
  classNames,
  content,
  properties,
  components: { Icon },
  methods,
  styles,
}) => {
  const { data, fields } = properties;

  const items = useMemo(() => {
    if (!data) return [];
    return fields
      ? processFields(data, fields) // fields mode
      : processData(data); // auto-discovery mode
  }, [data, fields]);

  if (!items.length) {
    return <div id={blockId}>No data to display</div>;
  }

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

Both processing functions return the same shape — a flat array of items:

```js
{
  key: "profile.phone_number",
  value: { phone_number: "+1234567890", region: { flag: "🇺🇸", dial_code: "+1" } },
  label: "Phone Number",
  fieldType: "phoneNumber",
  isArray: false,
  fullWidth: false,
  options: null,          // only set in fields mode for selector types
}
```

One set of renderers serves both modes. The `fieldType` determines which render function runs. In fields mode, `options` is passed through to the selector renderer for label lookup.

`renderValue.js` passes the item's `options` through to the registry render call:

```js
const renderValue = (item, Icon, methods, properties) => {
  const config = getFieldTypeConfig(item.fieldType);
  return config.render({
    value: item.value,
    Icon,
    methods,
    properties,
    fieldType: item.fieldType,
    options: item.options, // null in auto-discovery, populated in fields mode
  });
};
```

Existing render functions ignore the extra `options` parameter via destructuring. Only the selector renderer reads it.

### File Structure

```
blocks/SmartDescriptions/
├── SmartDescriptions.js           # Entry point (withTheme + withBlockDefaults)
├── meta.js                        # Block metadata
├── schema.json                    # Block property schema
├── processData.js                 # Auto-discovery: data → flat item list
├── processFields.js               # Fields mode: data + fields → flat item list
├── fieldTypes/
│   ├── fieldTypeRegistry.js       # 20 type configs with detect + render (from DataDescriptions)
│   ├── getFieldTypeConfig.js      # Lookup by type name
│   ├── getFieldTypesByPriority.js      # Priority-sorted list (auto-discovery)
│   └── blockTypeMap.js            # Block type → field type mapping (fields mode)
├── renderValue.js                 # Unified value renderer (delegates to registry)
├── style.module.css               # Value-type CSS classes
└── utils/
    ├── formatFieldName.js         # key → "Field Name"
    ├── formatValue.js             # Value formatting
    └── getByDotNotation.js        # Dot-notation path resolution
```

**From DataDescriptions — kept unchanged:** `fieldTypes/getFieldTypeConfig.js`, `fieldTypes/getFieldTypesByPriority.js`, `style.module.css`, `utils/formatFieldName.js`, `utils/formatValue.js`.

**From DataDescriptions — modified:** `fieldTypes/fieldTypeRegistry.js` (selector renderer enhanced to accept `options` parameter; location renderer fixed to guard missing `geometry`).

**From DataDescriptions — removed:** `preprocessing/` (entire directory — no structure tree, no sections, no grid nodes), `core/StructureRenderer.js`, `core/renderField.js`, `components/` (Section, GridItem, Card).

**From DataDescriptions — simplified:** `core/renderFieldValue.js` → `renderValue.js` (same registry dispatch, no recursive group handling). `core/renderArray.js` logic folded into `renderValue.js`.

**New:** `processData.js` (flat auto-discovery with dotted-key flattening), `processFields.js` (flat field resolution with block type mapping), `fieldTypes/blockTypeMap.js` (block type → field type lookup table), `utils/getByDotNotation.js` (dot-notation path resolution for fields mode).

### Selector Renderer Enhancement

The selector render function in `fieldTypeRegistry.js` is enhanced to accept an `options` parameter:

```js
selector: {
  render: ({ value, options }) => {
    // If options provided (fields mode), look up label
    if (options?.length) {
      const label = lookupLabel(value, options);
      if (label) return <span className="dataview-tag">{label}</span>;
    }
    // Fallback: extract displayable value from object, or show raw
    const displayValue = type.isObject(value)
      ? value.name || value.label || value.id || String(value)
      : String(value);
    return <span className="dataview-tag">{formatValue(displayValue)}</span>;
  },
  // ...
}
```

`lookupLabel` handles both string options (`["Mr", "Ms"]`) and object options (`[{ label, value }]`).

## Worked Example: Profile View

### Data-only (quick prototyping)

```yaml
- id: profile_view
  type: SmartDescriptions
  properties:
    data:
      _state: profile
```

Renders every field in `state.profile`. Phone numbers auto-detected as tel: links. Emails auto-detected as mailto: links. Nested objects flattened. No config needed.

### Data + fields (production)

```yaml
- id: profile_view
  type: SmartDescriptions
  properties:
    title: Profile
    column: 1
    size: small
    data:
      profile:
        _state: profile
    fields:
      _build.array.concat:
        # Core fields — _module.var resolves at call site, form_core.yaml reads via _var
        - _ref:
            path: ../shared/profile/form_core.yaml
            vars:
              show_title:
                _module.var: fields.show_title
        # Consumer extended fields
        - _module.var: fields.profile
  areas:
    extra:
      blocks:
        - id: edit_btn
          type: Button
          properties:
            title: Edit
```

Same field definitions used in the edit form. `profile.phone_number` resolves to `data.profile.phone_number`. PhoneNumberInput type renders a formatted phone number. Selector types look up labels. Internal fields like `picture`, `profile_created`, `name` are not rendered — they're not in the fields array.

## What Changes From DataDescriptions

| Aspect            | DataDescriptions                        | SmartDescriptions                             |
| ----------------- | --------------------------------------- | --------------------------------------------- |
| Field config      | Custom `formConfig` array               | Standard Lowdefy block definitions (optional) |
| Data-only mode    | Auto-discovery with nested sections     | Auto-discovery, flat, dotted-key flattening   |
| Display hint      | `component` string → registry lookup    | Block `type` → field type mapping             |
| Label             | `formConfig[].title`                    | `properties.title`                            |
| Data key          | `formConfig[].key` (flat key only)      | Block `id` (dot-notation path into data)      |
| Options lookup    | Not supported                           | `properties.options` on selector types        |
| Sections/nesting  | `component: "section"`, recursive cards | Not supported — use multiple block instances  |
| Null in auto-disc | Skipped                                 | Skipped (same)                                |
| Null in fields    | N/A                                     | Renders "Not set"                             |
| Unknown types     | N/A                                     | Fall back to value-based auto-detection       |

## Key Decisions

**Two modes, one block.** Data-only gives you auto-discovery with zero config. Adding fields gives you explicit control with better rendering. The block is useful at both ends — quick data dump and production view page.

**Fields are standard Lowdefy blocks.** Consumers already write these for forms. SmartDescriptions extracts `id`, `type`, `properties.title`, and `properties.options` — ignores everything else. No parallel definition, no custom format.

**No nesting.** Always flat. DataDescriptions had recursive sections with Card inner wrappers for nested groups. This added implementation complexity without proportional value — view pages already group fields by using multiple SmartDescriptions instances with different titles. Removing nesting simplifies the preprocessing pipeline from a recursive tree walker to a single flat map.

**Auto-discovery flattens nested objects.** Unrecognized plain objects (objects that don't match any registered type like phone, contact, location) are recursively flattened with dotted key paths. `{ address: { street, city } }` becomes two fields with labels "Address Street" and "Address City". Recognized complex objects (phones, contacts, locations, etc.) are NOT flattened — they're rendered by their type's renderer.

**Shared renderers between modes.** Both modes produce the same item shape and use the same `fieldTypeRegistry` render functions. The block type mapping in fields mode resolves to the same field type names used in auto-discovery. One set of renderers, two ways to select them.

**Unknown block types fall back to auto-detection.** If a field has a block type not in the mapping table, the value is tested against the field type registry (same as auto-discovery). This means custom or project-specific block types still get reasonable rendering — a custom date picker renders as a formatted date because the value is detected as a date. Final fallback is `String(value)`.

**`bordered: true` by default.** Unlike standard Descriptions (`false`). This block's primary use case is bordered horizontal-label display.

**Replaces DataDescriptions.** New block name, new directory, new props interface. DataDescriptions is removed once the three consumer modules (user-admin, user-account, contacts) are migrated.

## Non-Goals

- **Sections or nested card grouping.** Use multiple SmartDescriptions instances for visual separation.
- **Backwards compatibility with `formConfig`.** Clean break. The module-field-pattern migration updates all consumers.
- **Rendering arbitrary Lowdefy block trees.** Fields is a flat array of input block definitions, not a nested block hierarchy.

## Open Questions

1. **Label formatting for deep dotted keys.** `user.profile.address.street` → "User Profile Address Street" is verbose. Could truncate to last N segments or use only the segment after the last shared prefix. Low priority — deep nesting in auto-discovery is an edge case, and consumers with complex data should use fields mode.
