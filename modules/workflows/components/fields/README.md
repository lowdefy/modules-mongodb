# Form components library

Internal field components consumed by the form-builder resolver (workflows module, part 15) when rendering action `form:` blocks. Action authors reference components by name; the resolver substitutes the component's `config` (with author-supplied vars merged) into the page block tree at build time.

Apps never `_ref` these files directly.

## Library boundary

### Internal-only

Components are referenced by name in action `form:` blocks; they are **not** exposed via `_module.componentId`. Apps wanting custom fields ship a regular Lowdefy custom block plugin and reference it as `component: <plugin-name>:foo` in `form:` blocks. The form-builder resolver passes through any `component:` name it doesn't recognise as a library component.

See [workflows-module-concept/action-authoring/spec.md §"Form components library"](../../../../designs/workflows-module-concept/action-authoring/spec.md).

### Universal-fields-vs-form

`assignees`, `due_date`, and `description` are **not** part of the library — they render in the page templates (part 16) via the page chrome. Don't include them in `form:` blocks.

See [workflows-module-concept/action-authoring/spec.md §"Universal action fields"](../../../../designs/workflows-module-concept/action-authoring/spec.md).

## Component reference

### Text

#### `text_input`

Single-line text input. Renders a `TextInput`.

| Var            | Type    | Required / Default | Notes                                           |
| -------------- | ------- | ------------------ | ----------------------------------------------- |
| `key`          | string  | required           | State path and block id                         |
| `title`        | string  | —                  | Label title                                     |
| `placeholder`  | string  | —                  |                                                 |
| `visible`      | boolean | `true`             |                                                 |
| `required`     | boolean | `false`            |                                                 |
| `validate`     | array   | `[]`               | Caller-supplied validate rules                  |
| `label_inline` | boolean | `false`            |                                                 |
| `label_span`   | number  | —                  | When set, adds `span` + `align: right` to label |

```yaml
- component: text_input
  key: contact_name
  title: Contact name
  required: true
```

#### `text_area`

Multi-line text. Renders a `TextArea`. Same var set as `text_input` minus `validate`.

```yaml
- component: text_area
  key: notes
  title: Notes
```

#### `tiptap_input`

Rich-text editor. Renders a `TiptapInput`. Required-validation fires when `_string.length: _state: {key}.text` is `0`.

| Var                     | Type    | Required / Default |
| ----------------------- | ------- | ------------------ |
| `key`                   | string  | required           |
| `title`                 | string  | —                  |
| `placeholder`           | string  | —                  |
| `visible`               | boolean | `true`             |
| `required`              | boolean | `false`            |
| `label_inline`          | boolean | `false`            |
| `label_span`            | number  | —                  |
| `s3PostPolicyRequestId` | string  | `upload_files`     |

```yaml
- component: tiptap_input
  key: form.description
  title: Description
  required: true
```

### Numeric

#### `number`

Numeric input. Renders a `NumberInput`.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `placeholder`  | number  | `0`                |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `validate`     | array   | `[]`               |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |
| `extra`        | string  | —                  |
| `precision`    | number  | `0`                |
| `min`          | number  | `0`                |

```yaml
- component: number
  key: quantity
  title: Quantity
  precision: 0
  min: 1
```

### Date

#### `date_selector`

Single date picker. Renders a `DateSelector` with `format: DD MMMM YYYY`.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `extra`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |

```yaml
- component: date_selector
  key: due_date
  title: Due date
```

#### `date_range_selector`

Start + end date picker. Renders a `DateRangeSelector` with `format: DD MMMM YYYY`. When `required: true`, fails validation if the range array is empty.

Same var set as `date_selector`.

```yaml
- component: date_range_selector
  key: warranty
  title: Warranty
  required: true
```

### Choice

#### `selector`

Single-select dropdown. Renders a `Selector`.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `options`      | array   | `[]`               |
| `extra`        | string  | `null`             |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |
| `on_change`    | array   | `[]`               |

```yaml
- component: selector
  key: priority
  title: Priority
  options:
    - { label: High, value: high }
    - { label: Low, value: low }
```

#### `multiple_selector`

Multi-select dropdown. Renders a `MultipleSelector`. Caller-supplied `validate` is concatenated with a required-fires-on-empty-array rule when `required: true`.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `validate`     | array   | `[]`               |
| `options`      | array   | `[]`               |
| `extra`        | string  | —                  |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |
| `renderTags`   | boolean | `false`            |
| `on_change`    | array   | `[]`               |

```yaml
- component: multiple_selector
  key: tags
  title: Tags
  options:
    - { label: Urgent, value: urgent }
    - { label: Internal, value: internal }
```

#### `tree_multiple_selector`

Checkable-tree multi-select. Renders a `TreeMultipleSelector`. Options are a flat array of rows; `primaryKey`/`parentKey` name the fields that build the hierarchy (a row whose `parentKey` matches another row's `primaryKey` nests under it — omit both to render flat). `checkable` defaults on, and `showCheckedStrategy: SHOW_CHILD` stores only leaf values (checking a group cascades to its leaves without storing the group). Caller-supplied `validate` is concatenated with a required-fires-on-empty-array rule when `required: true`. On the read-only view page the stored values render as tags.

| Var                    | Type    | Required / Default |
| ---------------------- | ------- | ------------------ |
| `key`                  | string  | required           |
| `title`                | string  | —                  |
| `visible`              | boolean | `true`             |
| `required`             | boolean | `false`            |
| `validate`             | array   | `[]`               |
| `options`              | array   | `[]`               |
| `primaryKey`           | string  | `null`             |
| `parentKey`            | string  | `null`             |
| `checkable`            | boolean | `true`             |
| `showCheckedStrategy`  | string  | `SHOW_CHILD`       |
| `showSearch`           | boolean | `true`             |
| `treeDefaultExpandAll` | boolean | `false`            |
| `allowClear`           | boolean | `true`             |
| `placeholder`          | string  | —                  |
| `maxTagCount`          | number  | —                  |
| `extra`                | string  | —                  |
| `label_inline`         | boolean | `false`            |
| `label_span`           | number  | —                  |
| `label_disabled`       | boolean | `false`            |
| `on_change`            | array   | `[]`               |

```yaml
- component: tree_multiple_selector
  key: form.reports
  title: Reports
  primaryKey: id
  parentKey: parentId
  options:
    _js: |
      # rows: { id, value, label, parentId, selectable } — parents carry no value
      ...
```

#### `radio_selector`

Radio group. Renders a `RadioSelector`. Label is hardcoded `align: right / colon: false`.

| Var              | Type    | Required / Default |
| ---------------- | ------- | ------------------ |
| `key`            | string  | required           |
| `title`          | string  | —                  |
| `visible`        | boolean | `true`             |
| `required`       | boolean | `false`            |
| `options`        | array   | `[]`               |
| `extra`          | string  | —                  |
| `label_disabled` | boolean | `false`            |

```yaml
- component: radio_selector
  key: response
  title: Response
  options:
    - { label: Yes, value: true }
    - { label: No, value: false }
```

#### `checkbox_selector`

Multi-select checkbox group. Renders a `CheckboxSelector`. Label is hardcoded `span: 12 / align: right / colon: false`.

| Var        | Type    | Required / Default |
| ---------- | ------- | ------------------ |
| `key`      | string  | required           |
| `title`    | string  | —                  |
| `visible`  | boolean | `true`             |
| `required` | boolean | `false`            |
| `options`  | array   | `[]`               |
| `extra`    | string  | —                  |

```yaml
- component: checkbox_selector
  key: channels
  title: Notification channels
  options:
    - { label: Email, value: email }
    - { label: SMS, value: sms }
```

#### `button_selector`

Button-group selector. Renders a `ButtonSelector`.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `options`      | array   | `[]`               |
| `extra`        | string  | —                  |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |
| `colon`        | boolean | `true`             |

```yaml
- component: button_selector
  key: severity
  title: Severity
  options:
    - { label: Low, value: low }
    - { label: High, value: high }
```

#### `checkbox_switch`

Toggle switch. Renders a `CheckboxSwitch`.

| Var              | Type    | Required / Default |
| ---------------- | ------- | ------------------ |
| `key`            | string  | required           |
| `title`          | string  | —                  |
| `visible`        | boolean | `true`             |
| `required`       | boolean | `false`            |
| `validate`       | array   | `[]`               |
| `label_inline`   | boolean | `false`            |
| `label_span`     | number  | —                  |
| `extra`          | string  | —                  |
| `label_disabled` | boolean | `false`            |
| `description`    | string  | —                  |

```yaml
- component: checkbox_switch
  key: subscribed
  title: Subscribed
```

#### `yes_no_selector`

Yes/no toggle. Renders a `ButtonSelector` with hardcoded `[Yes / No]` boolean options.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `validate`     | array   | `[]`               |
| `disabled`     | boolean | `false`            |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |
| `extra`        | string  | —                  |
| `on_change`    | array   | `[]`               |

```yaml
- component: yes_no_selector
  key: form.device_online
  title: Is the device online?
  required: true
```

#### `enum_selector`

Selector sourced from an enum map. Renders a `Selector`. The enum object (slug → `{ title, color, icon, ... }`) is converted to `{ label, value, style, tag }` options at build time via `_mql.aggregate`. Label is hardcoded `align: right / span: 12`.

| Var        | Type    | Required / Default |
| ---------- | ------- | ------------------ |
| `key`      | string  | required           |
| `title`    | string  | —                  |
| `visible`  | boolean | `true`             |
| `required` | boolean | `false`            |
| `enum`     | object  | `{}`               |

```yaml
- component: enum_selector
  key: status
  title: Status
  enum:
    _global: enums.ticket_statuses
```

### Contact

Both contact fields wrap the **contacts module's `contact-selector`** export (the rich search / add / edit picker). They require the host app to wire a `contacts` module entry — the workflows manifest declares `contacts` as a dependency, auto-wired when an entry with id `contacts` exists. The block value is an **array** of denormalized `{ contact_id, name, email, verified }` objects; the picker's own required-validation (at least one selected) is reused, so a caller `validate` is appended, not replaced.

#### `contact`

Single contact. `contact-selector` capped at `max: 1` — read the selection as `_state: {key}.0`.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `validate`     | array   | `[]`               |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |

```yaml
- component: contact
  key: form.contact
  title: Contact
  required: true
```

#### `multiple_contact`

Multiple contacts. Same as `contact` but uncapped; set `max` to limit the number of selections.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `max`          | number  | — (unlimited)      |
| `validate`     | array   | `[]`               |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |

```yaml
- component: multiple_contact
  key: form.stakeholders
  title: Stakeholders
  max: 5
```

### Files

#### `file_upload`

S3 put via policy. Renders a `Label` wrapping an `S3UploadDragger`. When `required: true` and `singleFile: true`, validates that the single file has `status: done`. When `required: true` and `singleFile: false`, validates that at least one file is in the file list.

| Var                     | Type    | Required / Default            |
| ----------------------- | ------- | ----------------------------- |
| `key`                   | string  | required                      |
| `title`                 | string  | —                             |
| `visible`               | boolean | `true`                        |
| `required`              | boolean | `false`                       |
| `singleFile`            | boolean | `false`                       |
| `accept`                | string  | `null`                        |
| `label`                 | string  | `Click or drag to add files.` |
| `label_disabled`        | boolean | `true`                        |
| `s3PostPolicyRequestId` | string  | `upload_files`                |

```yaml
- component: file_upload
  key: form.installation_files
  title: Installation files
  required: true
```

#### `file_download`

File-list S3 get via policy. Renders a `Label` wrapping an `S3Download`.

| Var                    | Type    | Required / Default     |
| ---------------------- | ------- | ---------------------- |
| `key`                  | string  | required               |
| `title`                | string  | —                      |
| `visible`              | boolean | `true`                 |
| `fileList`             | array   | required               |
| `label_disabled`       | boolean | `true`                 |
| `s3GetPolicyRequestId` | string  | `file_download_policy` |

```yaml
- component: file_download
  key: form.contract
  title: Contract
  fileList:
    _state: form.contract_files
```

### Location

#### `location`

Address + coordinates. Renders a `GoogleAPIProvider` (or `Box` when `disableScript: true`) wrapping a `PlacesAutocomplete` and optionally a coordinates `Label` with `Lat` / `Lng` `NumberInput` blocks. Reads `_build.env: GOOGLE_MAPS_API_KEY` at build time.

| Var                 | Type    | Required / Default |
| ------------------- | ------- | ------------------ |
| `key`               | string  | required           |
| `title`             | string  | required           |
| `visible`           | boolean | `true`             |
| `required`          | boolean | `false`            |
| `disabled`          | boolean | `false`            |
| `disableScript`     | boolean | `false`            |
| `events`            | object  | `{}`               |
| `label_inline`      | boolean | `false`            |
| `label_span`        | number  | —                  |
| `extra`             | string  | —                  |
| `coordinates_title` | string  | `null`             |

```yaml
- component: location
  key: form.site_address
  title: Site address
  required: true
  coordinates_title: Coordinates
```

### Display

#### `label`

Read-only label with optional nested blocks. Renders a `Label`.

| Var        | Type    | Required / Default |
| ---------- | ------- | ------------------ |
| `key`      | string  | required           |
| `title`    | string  | —                  |
| `disabled` | boolean | —                  |
| `visible`  | boolean | `true`             |
| `validate` | array   | `[]`               |
| `blocks`   | array   | `[]`               |

```yaml
- component: label
  key: form.summary_label
  title: Summary
  blocks:
    - { type: Html, properties: { html: <p>Static description</p> } }
```

#### `label_value`

Key-value pair rendered as `Html` with `<div>title: <span class="secondary">value</span></div>`.

| Var       | Type    | Required / Default |
| --------- | ------- | ------------------ |
| `key`     | string  | required           |
| `title`   | string  | required           |
| `visible` | boolean | `true`             |

```yaml
- component: label_value
  key: form.devices.$._id
  title: Honeycomb Number
```

#### `title`

Section header. Renders a Lowdefy `Title` block at level 5.

| Var     | Type   | Required / Default |
| ------- | ------ | ------------------ |
| `key`   | string | required           |
| `title` | string | required           |

```yaml
- component: title
  key: device_section_title
  title: Devices
```

#### `section_title`

Sub-section header. Renders a `Divider` with the title on it.

| Var       | Type    | Required / Default |
| --------- | ------- | ------------------ |
| `key`     | string  | required           |
| `title`   | string  | required           |
| `visible` | boolean | `true`             |

```yaml
- component: section_title
  key: warranty_divider
  title: Warranty
```

#### `alert`

Alert banner. Renders a `Box` wrapping an `Alert`.

| Var           | Type    | Required / Default |
| ------------- | ------- | ------------------ |
| `key`         | string  | required           |
| `visible`     | boolean | `true`             |
| `message`     | string  | —                  |
| `description` | string  | —                  |
| `type`        | string  | `warning`          |
| `show_icon`   | boolean | `true`             |
| `label_span`  | number  | —                  |

```yaml
- component: alert
  key: warranty_alert
  message: Warranty expires soon
  type: warning
```

#### `html`

Raw HTML. Renders an `Html` block.

| Var       | Type    | Required / Default |
| --------- | ------- | ------------------ |
| `key`     | string  | required           |
| `html`    | string  | required           |
| `visible` | boolean | `true`             |

```yaml
- component: html
  key: intro_html
  html: "<p>Welcome to the installation form.</p>"
```

### Structure

#### `box`

Plain grouping container. Renders a `Box`.

| Var       | Type    | Required / Default |
| --------- | ------- | ------------------ |
| `key`     | string  | required           |
| `visible` | boolean | `true`             |
| `blocks`  | array   | `[]`               |

```yaml
- component: box
  key: contact_group
  blocks:
    - { component: text_input, key: contact_name, title: Name }
```

#### `section`

Grouped section with optional title divider and Card wrapper.

| Var       | Type    | Required / Default |
| --------- | ------- | ------------------ |
| `key`     | string  | required           |
| `title`   | string  | `null`             |
| `visible` | boolean | `true`             |
| `blocks`  | array   | `[]`               |

```yaml
- component: section
  key: warranty_section
  title: Warranty
  blocks:
    - { component: date_range_selector, key: warranty, title: Period }
```

#### `controlled_list`

Dynamic list of sub-forms. Renders a `Label` wrapping a `ControlledList` whose rows carry their own sub-form blocks. Required-validation fires on empty array.

| Var                | Type    | Required / Default |
| ------------------ | ------- | ------------------ |
| `key`              | string  | required           |
| `title`            | string  | —                  |
| `visible`          | boolean | `true`             |
| `required`         | boolean | `false`            |
| `hideAddButton`    | boolean | `false`            |
| `hideRemoveButton` | boolean | `false`            |
| `minItems`         | number  | `0`                |
| `blocks`           | array   | `[]`               |

```yaml
- component: controlled_list
  key: form.devices
  title: Devices
  required: true
  hideAddButton: true
  blocks:
    - component: label_value
      key: form.devices.$._id
      title: Honeycomb Number
    - component: date_range_selector
      key: form.devices.$.warranty
      title: Warranty
      required: true
```

### Actions

#### `button`

Inline button. Renders a `Button`.

| Var          | Type    | Required / Default |
| ------------ | ------- | ------------------ |
| `key`        | string  | required           |
| `title`      | string  | required           |
| `visible`    | boolean | `true`             |
| `align`      | string  | `left`             |
| `type`       | string  | `default`          |
| `icon`       | string  | `null`             |
| `disabled`   | boolean | `false`            |
| `label_span` | number  | `0`                |
| `on_click`   | array   | `[]`               |

```yaml
- component: button
  key: refresh_btn
  title: Refresh
  type: primary
  on_click:
    - { id: refetch, type: Request, params: get_data }
```

## Custom components

Apps that need a domain-specific component ship it as a regular Lowdefy custom component in their plugin and reference it in `form:` blocks via `component: <plugin-name>:device_selector`. The form-builder resolver passes through any `component:` name it doesn't recognise as a library component.

```yaml
form:
  - component: my-plugin:device_selector
    key: form.device
    title: Device
```

## See also

- [Action authoring spec](../../../../designs/workflows-module-concept/action-authoring/spec.md) — full grammar for `form:` blocks.
- [Form-builder resolver design (part 15)](../../../../designs/workflows-module/parts/15-resolver-form-builder/design.md) — how component references are substituted at build time.
- [Page templates (part 16)](../../../../designs/workflows-module/parts/16-page-templates/design.md) — where universal fields (`assignees`, `due_date`, `description`) live.
