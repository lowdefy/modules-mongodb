# SmartDescriptions Block

## Problem

DataDescriptions takes a custom `formConfig` array (`{ key, title, component }`) to define how data fields display. Consumers maintain the same field information in two places: form blocks (for editing) and formConfig entries (for viewing). The `component` hint is a string that loosely maps to a renderer via an internal registry — the mapping is implicit, undocumented, and adding a new display type requires modifying the registry.

## Solution

Replace DataDescriptions with SmartDescriptions. It accepts standard Lowdefy block definitions as its field configuration — the same blocks used in the edit form. The block `type` determines rendering: `PhoneNumberInput` renders a phone number, `Selector` looks up labels from `properties.options`, `DateSelector` formats a date.

One block array. Used in the form for editing. Used in SmartDescriptions for viewing.

## Non-Goals

- Sections or nested card grouping. Use multiple SmartDescriptions instances for visual separation.
- Auto-discovery from data shape. Fields are always explicitly configured.
- Backwards compatibility with DataDescriptions formConfig format.

## Input Contract

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
      - id: profile.phone_number
        type: PhoneNumberInput
        properties:
          title: Phone Number
      - id: profile.department
        type: TextInput
        properties:
          title: Department
      - id: profile.team
        type: Selector
        properties:
          title: Team
          options:
            - label: Engineering
              value: eng
            - label: Sales
              value: sales
  areas:
    extra:
      blocks:
        - id: edit_btn
          type: Button
          properties:
            title: Edit
```

### Properties

| Property   | Type    | Default  | Description                                                     |
| ---------- | ------- | -------- | --------------------------------------------------------------- |
| `data`     | object  | required | Data object. Field IDs resolve as dot-notation paths into this. |
| `fields`   | array   | required | Lowdefy block definitions. Same format used in forms.           |
| `title`    | string  | —        | Descriptions header title.                                      |
| `bordered` | boolean | `true`   | Ant Design Descriptions bordered prop.                          |
| `column`   | number  | `2`      | Items per row.                                                  |
| `size`     | string  | —        | `"default"` or `"small"`.                                       |
| `layout`   | string  | —        | `"horizontal"` or `"vertical"`.                                 |
| `colon`    | boolean | —        | Show colon after labels.                                        |

Form-only block properties (`required`, `layout`, `validate`, `style`, etc.) are silently ignored.

### Field Resolution

For each entry in `fields`:

1. **Data key**: `field.id` used as dot-notation path into `data`. Example: `profile.phone_number` resolves to `data.profile.phone_number`.
2. **Label**: `field.properties.title`. Falls back to formatted last segment of `id` (e.g. `phone_number` becomes "Phone Number").
3. **Renderer**: Determined by `field.type` (see mapping below).
4. **Options**: For selector types, `field.properties.options` enables label lookup.

Fields whose path resolves to `undefined` in data render "Not set". Data keys not present in `fields` are not rendered — no need to null out internal fields.

## Block Type to Renderer Mapping

| Block Type          | Display            | Notes                                             |
| ------------------- | ------------------ | ------------------------------------------------- |
| `TextInput`         | Plain text         | Also the fallback for unknown types               |
| `TextArea`          | Pre-formatted text | Preserves whitespace and newlines, full-width row |
| `PhoneNumberInput`  | Flag + tel: link   | Parses phone object `{ phone_number, region }`    |
| `Selector`          | Label from options | Looks up value in `properties.options`            |
| `MultipleSelector`  | Tags               | Each value looked up in `properties.options`      |
| `RadioSelector`     | Label from options | Same rendering as Selector                        |
| `ButtonSelector`    | Label from options | Same rendering as Selector                        |
| `Switch`            | Yes / No           | Green "Yes" badge or gray "No" badge              |
| `DateSelector`      | Formatted date     | `toLocaleDateString()`                            |
| `DateRangeSelector` | Date range         | "start -- end"                                    |
| `NumberInput`       | Formatted number   | `toLocaleString()`                                |
| _(fallback)_        | `String(value)`    | Any unrecognised type                             |

### Options Lookup

For selector types, the renderer reads `properties.options` from the block definition:

- String array `["Mr", "Ms"]`: value is its own label.
- Object array `[{ label: "Engineering", value: "eng" }]`: match by `value`, display `label`.
- No match found: display the raw value.

### Null and Empty Handling

| Condition            | Display                 |
| -------------------- | ----------------------- |
| Key missing in data  | "Not set" (italic gray) |
| `null`               | "Not set"               |
| `""`                 | "Not set"               |
| `false` with Switch  | "No"                    |
| `0` with NumberInput | "0"                     |
| `[]` empty array     | "Empty list"            |

## Content Slot

SmartDescriptions keeps the `extra` content area (used for "Edit" button on view pages):

```yaml
areas:
  extra:
    blocks:
      - id: edit_btn
        type: Button
        ...
```

## Worked Example: Profile View

Current DataDescriptions approach — two parallel definitions:

```yaml
# Form blocks (form_profile.yaml)
- id: user.profile.phone_number
  type: PhoneNumberInput
  properties:
    title: Phone Number

# View config (profile_view_config.yaml) — separate file!
- key: phone_number
  title: Phone Number
  component: phone_number_input
```

New SmartDescriptions approach — one definition:

```yaml
# fields.yaml — used in BOTH form and view
- id: profile.phone_number
  type: PhoneNumberInput
  properties:
    title: Phone Number
```

Form component:

```yaml
blocks:
  _build.array.concat:
    -  # ... core fields
    - _module.var: profile.fields # ← fields.yaml
```

View component:

```yaml
- type: SmartDescriptions
  properties:
    data:
      profile:
        _state: profile
    fields:
      _build.array.concat:
        -  # ... core fields
        - _module.var: profile.fields # ← same fields.yaml
```

## What Changes From DataDescriptions

| Aspect         | DataDescriptions                            | SmartDescriptions                      |
| -------------- | ------------------------------------------- | -------------------------------------- |
| Field config   | Custom `formConfig` array                   | Standard Lowdefy block definitions     |
| Display hint   | `component` string with registry lookup     | Block `type` with renderer mapping     |
| Label          | `formConfig[].title`                        | `properties.title`                     |
| Data key       | `formConfig[].key` (flat key only)          | Block `id` (dot-notation path)         |
| Options lookup | Not supported                               | `properties.options` on selector types |
| Sections       | `component: "section"` in formConfig        | Not supported (use multiple blocks)    |
| Auto-discovery | Falls back to data-shape when no formConfig | Config-driven only                     |
| Nested cards   | Supported via depth tracking                | Not supported                          |

## Implementation

### File Changes

Replace the existing DataDescriptions block in-place. Rename directory and exports.

| Path                                     | Action                                                  |
| ---------------------------------------- | ------------------------------------------------------- |
| `plugins/.../blocks/DataDescriptions/`   | Rename directory to `SmartDescriptions/`                |
| `SmartDescriptions/SmartDescriptions.js` | Rewrite component                                       |
| `SmartDescriptions/schema.json`          | New properties: `data`, `fields`, display props         |
| `SmartDescriptions/meta.js`              | Rename, keep `extra` content area                       |
| `SmartDescriptions/preprocessing/`       | Remove. Replace with flat field processor in component. |
| `SmartDescriptions/fieldTypes/`          | Remove. Replace with block-type renderer map.           |
| `SmartDescriptions/core/`                | Remove. Inline simplified rendering.                    |
| `SmartDescriptions/style.module.css`     | Keep, trim unused classes                               |
| `plugins/.../src/index.js`               | Update export: `DataDescriptions` → `SmartDescriptions` |

### Processing Pipeline

```
fields[]
  → map each field:
      1. Extract id, type, properties.title, properties.options
      2. Resolve get(data, id) via dot-notation
      3. Look up renderer by block type
      4. Build { label, value, renderer, options }
  → render as Ant <Descriptions> items
```

No section recursion, no type-detection heuristics, no structural-field inference. A single flat map over the fields array.

## Key Decisions

**Lowdefy blocks as config, not a custom schema.** Consumers already write blocks for forms. Reusing the same format eliminates a parallel definition. SmartDescriptions extracts `id`, `type`, `properties.title`, and `properties.options` — ignores everything else.

**Dot-notation path resolution for data keys.** `id: profile.phone_number` resolves to `data.profile.phone_number`. The data prop structure controls the namespace. Wrap state in a key matching the field ID prefix and it just works — no prefix-stripping parameter, no convention to remember.

**No auto-discovery fallback.** DataDescriptions guesses structure from the data shape when formConfig is absent. Useful for prototyping but unpredictable in production. SmartDescriptions always requires explicit `fields`.

**No section grouping.** Flat field list only. For visual grouping, use multiple SmartDescriptions blocks with different `title` values. This is already the pattern in view pages (separate blocks for Profile and Attributes).

**Replace rather than extend DataDescriptions.** Only used on profile/contact view pages, all of which will be migrated. No backwards compatibility needed. Clean break.
