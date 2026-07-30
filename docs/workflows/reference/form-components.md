---
title: Form Components
module: workflows
type: reference
concepts: [form, components, fields, form-builder]
---

# Workflows — Form components

Built-in field components for action `form:` blocks. The form-builder resolver substitutes each component's block config (with author-supplied vars merged) into the page block tree at build time.

Apps never `_ref` these files directly. A domain-specific field not in this library is added one of three ways: contribute a library component, write a raw Lowdefy block inline in the `form:` array, or ship a consumer-supplied field component from the app side (see [Custom components](#custom-components)).

**Universal action fields (`assignees`, `due_date`) are not form components** — they render in the page templates via the page chrome. Do not include them in `form:` blocks. The authored action [`description`](authoring-grammar.md#description-description) is likewise not a form component — it is set at the action root, not in `form:`.

## Text

### `text_input`

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
| `disabled`     | boolean | `false`            | Renders the input read-only                     |
| `extra`        | string  | —                  | Helper text shown below the label               |
| `on_change`    | array   | `[]`               | Actions wired to the block's onChange           |

```yaml
- component: text_input
  key: contact_name
  title: Contact name
  required: true
```

### `text_area`

Multi-line text. Renders a `TextArea`. Same vars as `text_input` minus `validate`.

```yaml
- component: text_area
  key: notes
  title: Notes
```

### `tiptap_input`

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
| `on_change`             | array   | `[]`               |

```yaml
- component: tiptap_input
  key: form.description
  title: Description
  required: true
```

## Numeric

### `number`

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
| `on_change`    | array   | `[]`               |

```yaml
- component: number
  key: quantity
  title: Quantity
  precision: 0
  min: 1
```

## Phone

### `phone`

Phone-number input. Renders a `PhoneNumberInput` — the form-side counterpart to the `phoneNumber` field type the view renderer already recognises. The block value is stored at the `key` state path.

| Var              | Type    | Required / Default |
| ---------------- | ------- | ------------------ | --------------------------------------------- |
| `key`            | string  | required           |
| `title`          | string  | —                  |
| `placeholder`    | string  | —                  |
| `visible`        | boolean | `true`             |
| `required`       | boolean | `false`            |
| `validate`       | array   | `[]`               |
| `label_inline`   | boolean | `false`            |
| `label_span`     | number  | —                  |
| `default_region` | string  | —                  | ISO region for parsing/formatting (e.g. `ZA`) |
| `on_change`      | array   | `[]`               |

```yaml
- component: phone
  key: form.contact.cell_number
  title: Contact number
  default_region: ZA
  placeholder: 82 123 4567
```

## Date

### `date_selector`

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
| `on_change`    | array   | `[]`               |

```yaml
- component: date_selector
  key: due_date
  title: Due date
```

### `date_range_selector`

Start + end date picker. Renders a `DateRangeSelector` with `format: DD MMMM YYYY`. When `required: true`, fails validation if the range array is empty. Same vars as `date_selector`.

```yaml
- component: date_range_selector
  key: warranty
  title: Warranty
  required: true
```

## Choice

### Options and enums

Every selector below takes its choices two ways (`tree_multiple_selector` excepted — see the note below):

- `options` — an array of `{ label, value }` pairs, plus any per-option extras the block reads (`color`, `disabled`, `style`, `filterString`, `tag`).
- `enum` — an enum map, `slug → { title, color, icon }`, converted to options for you: `title` becomes the label, the slug becomes the stored value, `color` tints the selected value and `icon` shows on a `multiple_selector` tag. Key order is preserved.

`options` wins when both are set. `enum` may be an operator (`_global: enums.ticket_statuses`, `_module.var: statuses`), and it resolves before conversion.

On read-only surfaces an `enum`-driven selector shows the entry's title, colour and icon instead of the stored slug — the `DataDescriptions` block resolves it. An `options`-driven one shows the formatted raw value, as before. See [DataDescriptions](../../plugins/data-descriptions.md).

```yaml
# Equivalent choices, authored both ways.
- component: selector
  key: status
  title: Status
  options:
    - { label: Open, value: open }
    - { label: Closed, value: closed }

- component: selector
  key: status
  title: Status
  enum:
    open: { title: Open, color: "#1890ff", icon: AiOutlineFolderOpen }
    closed: { title: Closed, color: "#52c41a", icon: AiOutlineCheck }
```

`tree_multiple_selector` takes `options` only. Its whole point is a hierarchy built from `primaryKey` / `parentKey` on each row, which a flat enum map cannot express — and for flat choices `multiple_selector` is the better component anyway, since it renders each option's colour and icon on the tag while the tree renders plain text.

### `selector`

Single-select dropdown. Renders a `Selector`.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `options`      | array   | `[]`               |
| `enum`         | object  | `{}`               |
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

### `multiple_selector`

Multi-select dropdown. Renders a `MultipleSelector`. When `required: true`, required-validation fires on empty array; caller-supplied `validate` is concatenated with that rule.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `validate`     | array   | `[]`               |
| `options`      | array   | `[]`               |
| `enum`         | object  | `{}`               |
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

### `radio_selector`

Radio group. Renders a `RadioSelector`. Label is hardcoded `align: right / colon: false`.

| Var              | Type    | Required / Default |
| ---------------- | ------- | ------------------ |
| `key`            | string  | required           |
| `title`          | string  | —                  |
| `visible`        | boolean | `true`             |
| `required`       | boolean | `false`            |
| `options`        | array   | `[]`               |
| `enum`           | object  | `{}`               |
| `extra`          | string  | —                  |
| `label_disabled` | boolean | `false`            |
| `on_change`      | array   | `[]`               |

```yaml
- component: radio_selector
  key: response
  title: Response
  options:
    - { label: Yes, value: true }
    - { label: No, value: false }
```

### `checkbox_selector`

Multi-select checkbox group. Renders a `CheckboxSelector`. Label `colon` is hardcoded `false`. `direction: vertical` stacks the boxes one per line instead of flowing them across the row. When `required: true`, required-validation fires on empty array; caller-supplied `validate` is concatenated with that rule.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `validate`     | array   | `[]`               |
| `options`      | array   | `[]`               |
| `enum`         | object  | `{}`               |
| `extra`        | string  | —                  |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |
| `direction`    | string  | `horizontal`       |
| `on_change`    | array   | `[]`               |

```yaml
- component: checkbox_selector
  key: channels
  title: Notification channels
  direction: vertical
  options:
    - { label: Email, value: email }
    - { label: SMS, value: sms }
```

### `button_selector`

Button-group selector. Renders a `ButtonSelector`.

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ | ------------------------------------------------------------ |
| `key`          | string  | required           |
| `title`        | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `options`      | array   | `[]`               |
| `enum`         | object  | `{}`               |
| `extra`        | string  | —                  |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |
| `colon`        | boolean | `true`             |
| `disabled`     | boolean | `false`            |
| `theme`        | object  | —                  | Ant theme tokens for the block (e.g. checked-button colours) |
| `on_change`    | array   | `[]`               |

```yaml
- component: button_selector
  key: severity
  title: Severity
  options:
    - { label: Low, value: low }
    - { label: High, value: high }
```

### `checkbox_switch`

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
| `on_change`      | array   | `[]`               |

```yaml
- component: checkbox_switch
  key: subscribed
  title: Subscribed
```

### `yes_no_selector`

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

## Contact

The `contact` and `multiple_contact` components wrap the contacts module's `contact-selector` export (the rich search / add / edit picker); `role_contact` / `role_contact_multiple` wrap the lighter `role-contact-selector`. All require the `contacts` module dependency. For `contact` / `multiple_contact` the block value is an array of denormalized `{ contact_id, name, email, verified }` objects; `role_contact` stores a single such object (minus `verified`) and `role_contact_multiple` an array of them.

### `contact`

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

### `multiple_contact`

Multiple contacts. Same as `contact` but uncapped; set `max` to limit selections.

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

### `role_contact`

Single contact scoped to one or more roles. Wraps the contacts module's `role-contact-selector` export — a plain `Selector` of contacts holding any of `roles` (matched against `apps.<app_name>.roles`), not the rich search/add/edit picker. Stores a denormalized `{ contact_id, name, email }` object (view-renderable). Use when a form only needs to pick an existing contact in a role (e.g. an internal agent).

| Var            | Type    | Required / Default |
| -------------- | ------- | ------------------ |
| `key`          | string  | required           |
| `roles`        | array   | required           |
| `title`        | string  | —                  |
| `placeholder`  | string  | —                  |
| `visible`      | boolean | `true`             |
| `required`     | boolean | `false`            |
| `label_inline` | boolean | `false`            |
| `label_span`   | number  | —                  |

```yaml
- component: role_contact
  key: form.account_manager_id
  title: Account Manager
  roles:
    - account-manager
  required: true
```

### `role_contact_multiple`

Multiple contacts scoped to one or more roles — `role_contact` in `MultipleSelector` mode. The block value is an array of `{ contact_id, name, email }` objects. Same vars as `role_contact`.

```yaml
- component: role_contact_multiple
  key: form.reviewers
  title: Reviewers
  roles:
    - reviewer
```

## Files

### `file_upload`

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

### `file_download`

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

## Location

### `location`

Address + coordinates. Renders a `GoogleAPIProvider` (or `Box` when `disableScript: true`) wrapping a `PlacesAutocomplete` and optionally coordinates `Label` with `Lat` / `Lng` `NumberInput` blocks. Reads `_build.env: GOOGLE_MAPS_API_KEY` at build time.

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

## Display

### `label`

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

### `label_value`

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

### `title`

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

### `section_title`

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

### `alert`

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

### `html`

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

## Structure

### `box`

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

### `section`

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

### `controlled_list`

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

## Actions

### `button`

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

There is no `component:` namespace for plugin blocks — `component:` resolves only against this library. For anything not covered here:

- **Reused across apps?** Contribute a library component (a `components/fields/*.yaml` file) so it gets a bare `component:` name. If a Lowdefy plugin block renders it, wrap that block in the library component.
- **One-off?** Drop a raw Lowdefy block into the `form:` array (below).
- **App-specific but reused within the app?** Ship a consumer-supplied field component (below).

### Raw inline blocks

A raw block has no `component:` key — you write its `type` and `properties` directly. Any block type works, including a plugin block. Use the module's field vocabulary rather than block keys:

| Author writes | Becomes                                 | Why                                                           |
| ------------- | --------------------------------------- | ------------------------------------------------------------- |
| `key`         | the block `id`, and the `form_meta` key | Binds page state **and** makes the submitted value round-trip |
| `title`       | `form_meta` label only                  | The overview/review display label                             |

```yaml
form:
  - component: section
    key: device_section
    title: Device
    form:
      - key: form.device # -> block id, and the form_meta key
        title: Device # -> overview label
        type: my-plugin:device_selector # plugin block type — resolved by the plugin registry
        properties:
          title: Device # the block's own visible label
          collection: devices
```

Neither `key` nor `title` is a valid Lowdefy block property (the block schema is `additionalProperties: false`, requiring `id` + `type`), so the form-builder maps `key` → `id` and strips both before the node reaches the page tree. Writing `key` **and** `id` on the same entry is an error.

**Use `key`, not a bare `id`.** Only `key` is recorded in `form_meta`, and `GetWorkflowAction` allowlists the stored `form_data` slice by those keys — a field the metadata never saw still saves, but its value is never read back, so it does not prefill on re-edit and does not render in the overview or review views.

Two limits worth knowing:

- **The block's visible label is its own business** (`properties.title` on the antd input blocks). The entry-level `title` is metadata only, because not every block type accepts a title and the module can't inject one generically.
- **Mapping applies at `form:` entry positions only** — top-level entries and the `form:` of a [structural component](#structure). Inside a raw block's own `blocks:` array you are in plain Lowdefy: use `id`. A `key` nested there would bind state but never reach `form_meta`, so its value would be silently dropped. To group fields, use `component: box` or `component: section`, whose children are walked.

### Consumer-supplied field components

A field that is specific to one app but used by several of its actions doesn't belong in this library, and a module `_ref` cannot escape its own package root — so the app contributes it. The app owns a file that emits a form entry, and the action `_ref`s it; the ref resolves in app context, so the path is app-relative and the module needs no registry of it.

```yaml
# apps/{app}/modules/workflows/fields/deal_temperature.yaml
config:
  key: { _var: key }
  title: { _var: title }
  type: SegmentedSelector
  properties:
    title: { _var: title }
    options: [Cold, Warm, Hot]
```

```yaml
form:
  - _ref:
      path: modules/workflows/fields/deal_temperature.yaml
      key: config
      vars:
        key: form.deal_temperature
        title: Deal temperature
```

The emitted entry is a raw block, so the `key`/`title` contract above applies unchanged — which is what gives these components full parity with the library: state binding, value round-trip, overview rendering, id-collision checking, and `viewOnly`.

See `apps/demo/modules/workflows/fields/deal_temperature.yaml` and its use in `sales-pipeline/qualify.yaml` for a worked example of both this and the raw-block form.
