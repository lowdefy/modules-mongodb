# Companies

Company management — list, detail, edit, and create pages plus a company selector. Companies are stored in their own collection with auto-generated consecutive IDs (`C-0001`, `C-0002`, …) and a configurable display name field.

The module is paired with [`contacts`](../contacts/README.md): the company `view` page renders a contacts tile, and create/update reconciles bidirectional links on linked contact records.

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | Page wrapper |
| [events](../events/README.md) | Audit logging and `change_stamp` |
| [contacts](../contacts/README.md) | Contacts tile and bidirectional linking |
| [files](../files/README.md) | Optional file-attachments sidebar tile |

Cross-module cycle: `companies ↔ contacts`. Both must be added as separate entries in `lowdefy.yaml`; the build resolves the cycle at runtime.

## How to Use

```yaml
modules:
  - id: companies
    source: "github:lowdefy/modules-mongodb/modules/companies@v0.4.0"
    vars:
      label: Company
      label_plural: Companies
      id_prefix: "C-"
      id_length: 4
```

Defaults work out of the box. To add custom fields, table columns, sidebar tiles, or pipeline stages, see [Slots](../../docs/idioms.md#slots). To point the module at a different MongoDB collection, remap `companies-collection` via the entry's `connections` mapping.

## Exports

### Pages

| ID | Description | Path |
|---|---|---|
| `all` | List with filtering, sorting, pagination, Excel download | `/{entryId}/all` |
| `view` | Read-only detail with sidebar tiles | `/{entryId}/view` |
| `edit` | Edit existing company | `/{entryId}/edit` |
| `new` | Create a new company | `/{entryId}/new` |

### Components

- **`company-selector`** — `Selector` / `MultipleSelector` block over all companies. Use via `_ref`:

  ```yaml
  _ref:
    module: companies
    component: company-selector
    vars:
      label: Employer
      field_id: global_attributes.company_ids
  ```

### API Endpoints

| ID | Description |
|---|---|
| `create-company` | Insert a company; auto-assigns the next consecutive ID, reconciles linked contacts, logs `create-company` |
| `update-company` | Update a company; reconciles contact link changes, logs `update-company` |

### Connections

| ID | Collection |
|---|---|
| `companies-collection` | `companies` |

### Menus

| ID | Contents |
|---|---|
| `default` | Single link to the companies list |

```yaml
links:
  _ref:
    module: companies
    menu: default
```

## Vars

### `label` / `label_plural`

`string` — Defaults `Company` / `Companies`. Singular and plural display labels used in page titles, buttons, and selector placeholders.

### `name_field`

`string` — Default `name`. Top-level field on company documents used as the display name in selectors, table titles, and event templates. Override (e.g. `trading_name`) only if your collection genuinely uses a different display field.

### `short_name`

`object` — Default `{ enabled: true }`. Toggles a top-level `short_name` field for narrow display contexts (reports, chart axes, dense tables).

- **`enabled`** (`boolean`, default `true`) — When true, the field is **required** on the create/edit form, rendered on the view-page core descriptions, included as a column on the list table (between Name and Description) and the Excel export, and read/written by the create/update APIs. When false, every surface referencing `short_name` is omitted at build time and the field is absent from new documents. Existing documents that already carry a `short_name` keep it on disk but won't be rendered or written until the var is re-enabled.

Apps that want `short_name` to drive selectors, table titles, and event templates can additionally set `name_field: short_name` — the existing escape hatch already supports it.

### `id_prefix` / `id_length`

`string` / `number` — Defaults `"C-"` / `4`. Auto-generated consecutive IDs are formatted as `{id_prefix}{n.padStart(id_length)}`, producing `C-0001`, `C-0002`, …

### `event_display`

`object` — See [Event display](../../docs/idioms.md#event-display). Defaults from `defaults/event_display.yaml`. Event types: `create-company`, `update-company`. The `target` shape is `{ name }`, where `name` is the `name_field` on the saved doc.

### `fields`

`object` — Field-block slots rendered in both the edit form and the SmartDescriptions view. See [Slots](../../docs/idioms.md#slots).

- **`contact`** — Block array for the contact section (`contact.*`). Default `[]`. Apps typically `_ref` `field-presets/contact-default.yaml` (website / email / phone) or supply their own array. Block ids must be prefixed with `contact.`.
- **`address`** — Block array for the address section (`address.*`). Default `[]`. Use `field-presets/address-text.yaml` for a zero-dependency text input, or `field-presets/address-places.yaml` (depends on a custom `PlacesAutocomplete` plugin — not yet shipped). Block ids must be prefixed with `address.`.
- **`registration`** — Block array for the registration section (`registration.*`). Default `[]`. Region-specific; ship your own array or use `field-presets/registration-sa.yaml` (registered_name / registration_number / vat_number) for a South African setup. Block ids must be prefixed with `registration.`.
- **`attributes`** — Custom field blocks appended after the built-in sections in the edit form and view page. Default `[]`. Block ids must be prefixed with `attributes.`.

### `components`

`object` — Component slot overrides. See [Slots](../../docs/idioms.md#slots).

- **`table_columns`** — Extra columns on the list table.
- **`filters`** — Extra filter blocks below the search bar (pair with `filter_requests`).
- **`main_slots`** — Extra blocks appended to the main column on the detail page.
- **`sidebar_slots`** — Extra blocks appended to the sidebar.
- **`download_columns`** — Extra columns on the Excel export.
- **`contact_card_extra_fields`** — `[{ label, value }]` pairs appended under each contact in the company `view` page contacts tile. `value` is a top-level key on the contact doc projected by `get_company_contacts`.

### `request_stages`

`object` — Pipeline overrides. See [Slots](../../docs/idioms.md#slots).

- **`filter_match`** — Atlas Search compound clauses appended to the list `$search` query.
- **`get_all_companies`** — Stages appended after filtering on the list and Excel export aggregations.
- **`selector`** — Stages appended to the company-selector aggregation.
- **`write`** — Update stages appended to both create and update flows. On create, runs as a follow-up update on the inserted document; skipped at build time when empty.

### `filter_requests`

`array` — Default `[]`. Additional requests fetched alongside the custom `filters` blocks (e.g. dropdown option sources).

## Field presets

The module ships block-array presets under `field-presets/`. Apps `_ref` whichever sections they want; the module itself ships nothing wired up (all `fields.X` default to `[]`).

| File | Section | What it provides |
|---|---|---|
| `field-presets/contact-default.yaml` | `fields.contact` | Website (text), email (text + email validator), phone (`PhoneNumberInput`). |
| `field-presets/address-text.yaml` | `fields.address` | Plain `TextInput` for `address.formatted_address` and `address.extra`. Zero dependencies. |
| `field-presets/address-places.yaml` | `fields.address` | `PlacesAutocomplete` block writing `address.formatted_address`, plus a `TextInput` for `address.extra`. **Depends on a custom `PlacesAutocomplete` plugin that is not yet shipped** — apps that want autocomplete today supply their own block in the slot. |
| `field-presets/registration-sa.yaml` | `fields.registration` | South African registration trio: registered name / registration number / VAT number. |

Wire from your app's module-entry vars:

```yaml
# apps/your-app/modules/companies/vars.yaml
fields:
  contact:
    _ref: ../../modules/companies/field-presets/contact-default.yaml
  address:
    _ref: ../../modules/companies/field-presets/address-text.yaml
  registration:
    _ref: ../../modules/companies/field-presets/registration-sa.yaml
```

`_ref` paths resolve from the consuming app's config root, so adjust the `../`-prefix to match your app's depth relative to the module.

## Secrets

| Name | Used for |
|---|---|
| `MONGODB_URI` | MongoDB connection |

## Plugins

- `@lowdefy/community-plugin-mongodb` — collection connections and read/write
- `@lowdefy/community-plugin-xlsx` — Excel download
- `@lowdefy/modules-mongodb-plugins` — `ContactSelector`, `SmartDescriptions`, `EventsTimeline`, `FetchRequest`

## Notes

Linked contacts are stored on the contact side as `global_attributes.company_ids: [company_id, ...]`. The detail page resolves linked contacts via `$lookup`, and the edit page reconciles the link set on save.

Section sub-objects (`contact`, `address`, `registration`, `attributes`) are merged on save (`$mergeObjects`), not replaced. Removing a field from `fields.X` leaves any existing key on the document — `$set` does not unset. Run a one-off cleanup migration if you need to remove legacy keys from saved docs.

The `short_name` var is opt-out (default `enabled: true`). When enabled, the field is required on the create/edit form and surfaced on the view, list table, and Excel export. When disabled, the field and all of its surfaces are omitted at build time — existing documents retain any saved `short_name` on disk but won't render or be written until re-enabled.
