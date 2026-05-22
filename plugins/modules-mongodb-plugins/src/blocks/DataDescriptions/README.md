# DataDescriptions

A read-only data view built on Antd `Descriptions`, driven by an explicit `formConfig` that lays out sections, ordering, labels, and renderer hints. Use it on detail pages where the field set is fixed and you want full control over how the data is grouped.

The block ships a registry of field-type renderers — change stamps, contacts, companies, file lists, locations, phone numbers, dates, rich text, long text, URLs, emails, and primitives all render with sensible defaults. Use [`SmartDescriptions`](../SmartDescriptions/README.md) instead when you don't have an explicit schema and want auto-detection straight from the data.

## Usage

```yaml
- id: lot_view
  type: DataDescriptions
  properties:
    title: Lot details
    column: 2
    bordered: true
    data:
      _request: get_lot
    formConfig:
      component: section
      title: Lot
      form:
        - key: lot_number
          title: Lot number
        - key: status
          component: selector
        - key: assigned_to
          # Auto-detects as `contact` when the value matches the contact shape.
        - component: section
          title: Audit
          form:
            - key: created
              # Auto-detects as `changeStamp` when the value matches.
            - key: updated
    s3GetPolicyRequestId: download_policy
```

The `data` is the source object. The `formConfig` describes which keys to show, how to label them, and how to nest them. Every level supports a `title`, optional `extra` slot at the top, and arbitrary nesting of sections and fields.

## Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `data` | object | — | The data object to display. Field `key`s in `formConfig` resolve via dot-notation against this object. |
| `formConfig` | object \| array | — | Layout for the data. The root is a `section` or an array of items. See [Form config](#form-config). |
| `bordered` | boolean | `true` | Render items in the bordered table layout. |
| `colon` | boolean | `true` | Show a colon after each label. |
| `column` | number \| object | `2` | Number of items per row, or breakpoint object `{ xs, sm, md, lg, xl }`. |
| `layout` | `"horizontal"` \| `"vertical"` | `"horizontal"` | Label position. Horizontal puts the label to the left of the value. |
| `size` | `"default"` \| `"small"` | `"default"` | Antd `Descriptions` size. |
| `theme` | object | — | Antd design token overrides scoped to this block. See [Theme](#theme) and the [Antd docs](https://ant.design/components/descriptions#design-token). |
| `disableCrmLinks` | boolean | `false` | Disable hyperlinks on detected `contact` and `company` values. |
| `s3GetPolicyRequestId` | string | — | Request id resolving to an S3 download-policy URL. Required for `file` and `fileList` field types to render download links. |

### Form config

Each item in a `form` array is one of:

| Item shape | Renders as |
|---|---|
| `{ component: "section", title, form: [...] }` | A nested section. Top-level sections become a separate `Descriptions` block; deeper sections wrap in an Antd `Card` with `type="inner"`. |
| `{ component: "box", form: [...] }` | A transparent container. Children are merged into the current level. Useful for grouping items inside a config without introducing a visual section. |
| `{ key: "path.to.field", title?, component? }` | A single field. `key` supports dot notation. `title` overrides the auto-formatted label. `component` is a renderer hint (see below). |
| `{ key: "items", title, form: [...] }` | An array field. The block iterates the array at `key`, applies the nested `form` to each item (replacing `$` in nested keys with the index), and renders each as `Item N`. |

Fields with `null` or `undefined` values are skipped silently.

### Renderer hints

The `component` property on a field is a hint passed to the renderer registry. Recognised values:

| Hint | Field type |
|---|---|
| `text_input`, `text_area` | `string` / `longText` |
| `tiptap_input`, `html` | `richText` (full-width) |
| `selector`, `radio_selector`, `enum_selector`, `device_type_selector`, `button_selector`, `multiple_selector` | `selector` (renders as tags) |
| `checkbox_switch`, `yes_no_selector` | `boolean` (renders Yes/No) |
| `number` | `number` |
| `date_selector` | `date` |
| `date_range_selector` | `dateRange` |
| `phone_number_input` | `phoneNumber` (with flag and `tel:` link) |
| `location` | `location` (with Google Maps link, full-width) |
| `file_download`, `file_upload` | `file` / `fileList` |
| `change_stamp`, `timestamp` | `changeStamp` (renders `by <user> on <date>`) |
| `contact_selector_number_required` | `contact` (renders icon + name with link) |

Without a hint, the renderer is auto-detected from the value (e.g. an object with `email`, `contact_id` and a phone field renders as a contact). Hints take precedence and are useful when the value alone is ambiguous (e.g. a status string that should render as a tag).

### Theme

Antd `Descriptions` design tokens scoped to this instance:

| Token | Default |
|---|---|
| `labelBg` | `rgba(0, 0, 0, 0.02)` |
| `labelColor` | `rgba(0, 0, 0, 0.45)` |
| `titleColor` | `rgba(0, 0, 0, 0.88)` |
| `titleMarginBottom` | `20` |
| `itemPaddingBottom` | `16` |
| `itemPaddingEnd` | `16` |
| `colonMarginRight` | `8` |
| `colonMarginLeft` | `2` |
| `contentColor` | `rgba(0, 0, 0, 0.88)` |
| `extraColor` | `rgba(0, 0, 0, 0.88)` |

## Slots

| Slot | Purpose |
|---|---|
| `extra` | Extra content rendered in the header of the top-level `Descriptions` (e.g. action buttons). |

## CSS Keys

| Key | Element |
|---|---|
| `element` | The outer `Descriptions` wrapper. |
| `content` | Each item's content cell. |
| `label` | Each item's label cell. |

## Notes

- **Empty state.** When no fields resolve from the data (everything is `null` / `undefined` or `formConfig` is empty), the block renders the literal string `No data to display`.
- **`fileList` priority.** A value with a `fileList` array renders before being treated as a generic file. Use `s3GetPolicyRequestId` to enable downloads.
- **Auto-formatted labels.** When `title` is omitted, the field's `key` is converted to title case (`assigned_to` → `Assigned To`).
- **`extra` slot only at the top.** The `extra` slot renders only on the first top-level group.
