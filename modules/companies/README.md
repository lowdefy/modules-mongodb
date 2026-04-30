# Companies

Company management module — list, detail, edit, and create company records with linked contacts and audit events.

## Dependencies

| Dependency   | Purpose                                            |
| ------------ | -------------------------------------------------- |
| **layout**   | Page layout wrapper (page, card, floating-actions) |
| **events**   | Audit event logging and change stamps              |
| **contacts** | Contact selector for linking contacts to companies |
| **files**    | File attachments (optional sidebar tile)           |

## Pages

### `all`

Main list page. Paginated, searchable table of companies.

- Full-text search via MongoDB Atlas Search
- Customizable filter section
- Sortable columns
- Row click navigates to detail page
- Excel export of filtered results

### `view`

Read-only company detail with main info card (rendered by `SmartDescriptions`), optional `fields.attributes` block, contacts tile, events tile, and main/sidebar tile slots.

### `edit`

Edit an existing company. Uses `$mergeObjects` on `contact`, `address`, and `attributes` so fields set outside the form are preserved. Logs `update-company` audit event on save.

### `new`

Create a new company. Generates a consecutive ID (e.g., `C-0001`), links selected contacts via `global_attributes.company_ids`, and logs `create-company` event.

## Components

### `company-selector`

Selector/MultipleSelector for picking companies from the current app. Useful in modules that need a company picker (e.g. a contact's linked companies).

```yaml
- _ref:
    module: companies
    component: company-selector
    vars:
      label: Employer
      field_id: global_attributes.company_ids
```

## API Endpoints

### `create-company`

Inserts a company with an auto-incrementing consecutive ID, runs optional `request_stages.write` stages, links the selected contacts, and logs a `create-company` event.

### `update-company`

Pipeline update with `$mergeObjects` on `contact` / `address` / `attributes`, derived `lowercase_email`, unlink/relink selected contacts on `global_attributes.company_ids`, and a `update-company` event log.

## Menus

### `default`

Single menu link to the `companies` page.

```yaml
links:
  _ref:
    module: companies
    menu: default
```

## Vars

### `collection`

Type: `string`
Default: `companies`

MongoDB collection name.

### `label` / `label_plural`

Type: `string`
Defaults: `Company` / `Companies`

Display labels used throughout the UI.

### `name_field`

Type: `string`
Default: `trading_name`

Field used as the display name in selectors, event titles, and page titles.

### `id_prefix` / `id_length`

Type: `string` / `number`
Defaults: `C-` / `4`

Prefix and zero-padded length of the auto-generated consecutive ID (e.g., `C-0001`).

### `fields`

Type: `object`

Field block arrays rendered in both the edit form and the SmartDescriptions view. All keys default to `[]`.

- **`attributes`** (array) — Custom fields appended after the built-in company sections. IDs must be prefixed with `attributes.` (e.g. `attributes.industry`) so they bind to `state.attributes.*` and resolve correctly in `SmartDescriptions`.

```yaml
fields:
  attributes:
    - id: attributes.industry
      type: Selector
      properties:
        title: Industry
        options:
          - Technology
          - Finance
    - id: attributes.employee_count
      type: NumberInput
      properties:
        title: Employees
```

### `components`

Type: `object`

Page-level slot overrides.

- **`table_columns`** — Extra column definitions appended to the default table
- **`filters`** — Extra filter blocks rendered below the built-in search bar (use with `filter_requests` for custom filter data sources)
- **`main_slots`** / **`sidebar_slots`** — Extra blocks appended to the main / sidebar columns on the detail page
- **`download_columns`** — Extra columns appended to the Excel export

### `request_stages`

Type: `object`

MongoDB pipeline-stage overrides.

- **`get_all_companies`** — Stages appended to the list aggregation
- **`selector`** — Stages appended to the company-selector aggregation
- **`filter_match`** — `$search` compound clauses appended to the Atlas Search query on the list page
- **`write`** — Pipeline update stages appended to both `create-company` and `update-company` flows. On create, these run as a follow-up `MongoDBUpdateOne` on the newly inserted document and are skipped at build time when empty.

```yaml
request_stages:
  write:
    - $set:
        lowercase_trading_name:
          $toLower: "$trading_name"
```

### `filter_requests`

Type: `array`
Default: `[]`

Additional request definitions loaded on the companies list page alongside the built-in requests.

### `event_display`

Type: `object`

Per-app event display templates. Same shape and semantics as `user-admin.event_display`. Merged with the module's default templates for `create-company` and `update-company`.

## Data Model

Company documents live in the configured `collection` (default `companies`):

```
{
  _id: "C-0001",
  trading_name: "Acme Ltd",
  description: "...",
  registered_name: "Acme Limited",
  registration_number: "12345",
  vat_number: "GB123456789",
  website: "https://acme.example",
  contact: {
    primary_email: "info@acme.example",
    primary_phone: "+44..."
  },
  address: {
    registered: {
      formatted_address: "10 Downing St, London",
      extra: "Suite 5"
    }
  },
  attributes: { ... },
  lowercase_email: "info@acme.example",
  removed: null,
  created: { ... },
  updated: { ... }
}
```

Linked contacts are stored on the contact side as `global_attributes.company_ids: [company_id, ...]`. The company detail page looks up linked contacts via `$lookup`, and the edit page reconciles the link set on save.

## Event Types

| Event Type       | When                   |
| ---------------- | ---------------------- |
| `create-company` | New company created    |
| `update-company` | Company fields updated |

## Example

```yaml
modules:
  - id: companies
    source: "github:lowdefy/modules-mongodb/modules/companies@v1"
    vars:
      id_prefix: "ACME-"
      id_length: 5
      fields:
        attributes:
          - id: attributes.industry
            type: Selector
            properties:
              title: Industry
              options: [Technology, Finance, Healthcare]
```
