# Contacts

Contact management module — list, detail, edit, and create contact records in the shared `user_contacts` collection, with company linking and audit events.

## Dependencies

| Dependency    | Purpose                                            |
| ------------- | -------------------------------------------------- |
| **layout**    | Page layout wrapper (page, card, floating-actions) |
| **events**    | Audit event logging and change stamps              |
| **companies** | Company selector and detail page links             |
| **files**     | File attachments (optional sidebar tile)           |

## Pages

### `contacts`

Main list page. Paginated, searchable table of contacts for the current app.

- Full-text search by name or email (MongoDB Atlas Search)
- Customizable filter section
- Sortable columns
- Row click navigates to detail page
- Excel export of filtered results

### `contact-detail`

Read-only contact detail with main info card, companies tile, events tile, and optional main/sidebar tile slots.

### `contact-edit`

Edit an existing contact's profile and attributes. Blocked for user records (those with `apps.{app_name}.is_user === true`) — the edit page redirects to the detail page.

- Logs `update-contact` audit event on save
- Triggers avatar regeneration from initials

### `contact-new`

Create a new contact with duplicate detection (by email).

- Logs `create-contact` audit event on save
- Avatar is generated from the given/family name

## Components

### `contact-selector`

Selector/MultipleSelector for picking contacts from the current app. Useful in other modules that need a contact picker (e.g. linking contacts to a company).

```yaml
- _ref:
    module: contacts
    component: contact-selector
    vars:
      label: Linked Contacts
      mode: MultipleSelector
      field_id: contacts
```

## API Endpoints

### `create-contact`

Upserts a contact document. Checks for an existing contact by `lowercase_email` first; if found, returns the existing ID. Logs `create-contact` event.

### `update-contact`

Pipeline update with `$mergeObjects` on `profile` and `global_attributes`, guarded by `apps.{app_name}.is_user !== true`. Logs `update-contact` event.

## Menus

### `default`

Single menu link to the `contacts` page.

```yaml
links:
  _ref:
    module: contacts
    menu: default
```

## Vars

### `app_name` (required)

Type: `string`

App identifier used to guard edits on user records (`apps.{app_name}.is_user`) and to scope per-app access flags.

### `label` / `label_plural`

Type: `string`
Defaults: `Contact` / `Contacts`

Display labels used in page titles, breadcrumbs, buttons, and messages.

### `fields`

Type: `object`

Field block arrays used in both edit forms and view pages (via `SmartDescriptions`). The same blocks are rendered as inputs on edit/create and as read-only rows on view.

- **`show_honorific`** (boolean, default `false`) — Toggle the honorific/title selector (Mr/Ms/Dr) in the shared profile core.
- **`profile`** (array, default `[]`) — Extended profile fields. IDs must be prefixed with `profile.` (e.g. `profile.phone_number`) so they bind to `state.profile.*` and resolve correctly in `SmartDescriptions`.
- **`global_attributes`** (array, default `[]`) — Global attribute fields. IDs prefixed with `global_attributes.`.

Example:

```yaml
fields:
  show_honorific: true
  profile:
    - id: profile.phone_number
      type: PhoneNumberInput
      properties:
        title: Phone Number
    - id: profile.job_title
      type: TextInput
      properties:
        title: Job Title
  global_attributes:
    - id: global_attributes.notes
      type: TextArea
      properties:
        title: Internal Notes
```

### `components`

Type: `object`

Page-level slot overrides. All keys optional.

- **`table_columns`** — Extra column definitions appended to the default table
- **`filters`** — Extra filter blocks rendered below the built-in search bar (use with `filter_requests` for custom filter data sources)
- **`main_slots`** — Extra blocks appended to the main column on the detail page
- **`sidebar_slots`** — Extra blocks appended to the sidebar column on the detail page
- **`download_columns`** — Extra columns appended to the Excel export

### `request_stages`

Type: `object`

Inject additional MongoDB aggregation stages into module requests.

- **`get_all_contacts`** — Stages appended to the list aggregation
- **`selector`** — Stages appended to the selector aggregation
- **`filter_match`** — `$search` compound clauses appended to the Atlas Search query on the list page
- **`write`** — Pipeline update stages appended to both `create-contact` and `update-contact` write flows. Use for derived fields or extra transforms beyond the built-in `$mergeObjects` merge of `profile` and `global_attributes`.

```yaml
request_stages:
  write:
    - $set:
        profile.department:
          $trim:
            input: "$profile.department"
```

### `filter_requests`

Type: `array`
Default: `[]`

Additional request definitions loaded on the contacts list page alongside the built-in requests.

### `event_display`

Type: `object`

Per-app event display templates. Same shape and semantics as `user-admin.event_display`. Merged with the module's default templates for `create-contact` and `update-contact`.

### `avatar_colors`

Type: `array` of `{ from, to }`

Gradient pairs for avatar backgrounds. Defaults to the shared profile palette.

## Data Model

Contact records live in the `user-contacts` collection:

```
{
  _id: "uuid",
  email: "jane@example.com",
  lowercase_email: "jane@example.com",
  profile: {
    name: "Jane Smith",
    given_name: "Jane",
    family_name: "Smith",
    title: "Ms",
    picture: "data:image/svg+xml..."
  },
  global_attributes: {
    company_ids: ["company-id-1"],
    notes: "..."
  },
  apps: {
    "my-app": {
      is_user: false
    }
  },
  created: { ... },
  updated: { ... }
}
```

The `apps.{app_name}.is_user` flag distinguishes user records (managed by `user-admin` / `user-account`) from plain contacts. The contacts module refuses to edit user records and excludes them from the contacts list.

## Event Types

| Event Type       | When                   |
| ---------------- | ---------------------- |
| `create-contact` | New contact created    |
| `update-contact` | Contact fields updated |

## Example

```yaml
modules:
  - id: contacts
    source: "github:lowdefy/modules-mongodb/modules/contacts@v1"
    vars:
      app_name: my-app
      fields:
        profile:
          _ref: modules/shared/profile/fields.yaml
        global_attributes:
          - id: global_attributes.notes
            type: TextArea
            properties:
              title: Internal Notes
```
