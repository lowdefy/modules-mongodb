# SmartDescriptions

A read-only data view built on Antd `Descriptions` that auto-detects how to render each field straight from the data — no schema needed. Drop in a data object and get a labelled, type-aware view: contacts and companies become links, change stamps become "by Alice on 2026-04-30", phone numbers become tappable, files become download buttons, and so on.

Use it for quick views over data with a known shape but no declared layout.

## Usage

### Auto-discovery (no `fields`)

```yaml
- id: contact_view
  type: SmartDescriptions
  properties:
    title: Contact details
    column: 2
    data:
      _request: get_contact
    s3GetPolicyRequestId: download_policy
```

The block walks `data` and renders every recognisable leaf. Unrecognised objects are flattened recursively with dotted-path labels (e.g. `address.street`).

### Field-driven (with `fields`)

When you have a list of Lowdefy input block definitions (e.g. from a form config), pass them as `fields`. The block reads each `id` (a dot-notation path into `data`), uses `type` as a renderer hint, and pulls `properties.title` for the label and `properties.options` for selectors:

```yaml
- id: contact_view
  type: SmartDescriptions
  properties:
    title: Contact
    data:
      _request: get_contact
    fields:
      - id: profile.name
        type: TextInput
        properties:
          title: Name
      - id: profile.role
        type: Selector
        properties:
          title: Role
          options: [admin, editor, viewer]
      - id: phone
        type: PhoneNumberInput
      - id: created
        # No `type` — auto-detected as a change stamp.
```

This is the path most consumers want — it lets a single field config drive both a form (with the input blocks) and the corresponding read-only view (with `SmartDescriptions`).

## Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `data` | object | — | The source data. Field paths in `fields` resolve via dot-notation against this object. |
| `fields` | array | — | Lowdefy block definitions used as field hints. When provided, only these fields render. Without it, the block flattens `data` and renders every recognised leaf. |
| `title` | string (HTML) | — | Header rendered above the items. Sanitised through `renderHtml`. |
| `bordered` | boolean | `true` | Render items in the bordered table layout. |
| `colon` | boolean | — | Show a colon after each label. |
| `column` | number \| object | `2` | Number of items per row, or breakpoint object `{ xs, sm, md, lg, xl }`. |
| `layout` | `"horizontal"` \| `"vertical"` | — | Label position relative to value. |
| `size` | `"default"` \| `"small"` | — | Antd `Descriptions` size. |
| `theme` | object | — | Antd design token overrides. See the [Antd docs](https://ant.design/components/descriptions#design-token). |
| `disableCrmLinks` | boolean | `false` | Disable hyperlinks on detected `contact` and `company` values. |
| `contactDetailPageId` | string | `contacts/contact-detail` | Page id used to build contact detail links. |
| `companyDetailPageId` | string | `companies/company-detail` | Page id used to build company detail links. |
| `s3GetPolicyRequestId` | string | — | Request id resolving to an S3 download-policy URL. Required for `file` and `fileList` field types to render download links. |

### `fields` items

Each entry is a `{ id, type?, properties? }` object — usually one of the input block configs already used in a form:

| Key | Description |
|---|---|
| `id` | Dot-notation path into `data` (e.g. `profile.role`). The last segment is auto-formatted as the label fallback. |
| `type` | Lowdefy input block type (e.g. `TextInput`, `Selector`, `DateSelector`, `PhoneNumberInput`). Mapped to a renderer (see [Block-type mapping](#block-type-mapping)). Unknown types fall back to value-based auto-detection. |
| `properties.title` | Custom label for the field. |
| `properties.options` | Forwarded to `selector` renderers — accepts a string array or `[{label, value}]`. |

### Block-type mapping

| Lowdefy block type | Renderer |
|---|---|
| `TextInput` | `string` |
| `TextArea` | `longText` (full-width) |
| `NumberInput` | `number` |
| `Selector`, `MultipleSelector`, `RadioSelector`, `ButtonSelector`, `CheckboxSelector` | `selector` (renders as tags) |
| `Switch`, `CheckboxSwitch` | `boolean` (Yes/No) |
| `DateSelector` | `date` |
| `DateTimeSelector` | `datetime` |
| `DateRangeSelector` | `dateRange` |
| `PhoneNumberInput` | `phoneNumber` (with flag, `tel:` link) |
| `LocationSelector` | `location` (Google Maps link, full-width) |
| `S3UploadButton` | `fileList` |
| `TiptapInput` | `richText` (full-width) |
| `ContactSelectorNumberRequired` | `contact` |

For unknown types the block runs the same value-based detection it uses in auto-discovery mode.

### Auto-discovery

In the no-`fields` path:

- Each top-level value in `data` is checked against the renderer registry (change stamps, contacts, companies, file lists, files, locations, phone numbers, dates, datetimes, date ranges, rich text, long text, URLs, emails, and primitives).
- Recognised values render as one item. Unrecognised objects are walked recursively with dotted-path keys.
- `null`, `undefined`, and empty arrays are skipped.

## Slots

| Slot | Purpose |
|---|---|
| `extra` | Extra content rendered in the header (e.g. action buttons). |

## CSS Keys

| Key | Element |
|---|---|
| `element` | The outer `Descriptions` wrapper. |
| `content` | Each item's content cell. |
| `label` | Each item's label cell. |

## Notes

- **Empty state.** When no items resolve from `data`, the block renders the literal string `No data to display`.
- **Selector options.** A `Selector` field with no `options` still renders the value as a tag — supplying `options` only changes the dropdown source, not the read-only render.
- **Field-mode label fallback.** When `properties.title` is absent on a `fields` entry, the label is `formatFieldName(lastSegmentOf(id))` — so `id: profile.given_name` becomes `Given Name`.
- **No grouping.** This block renders a flat list of items; sections and array iteration are not supported.
