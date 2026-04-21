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

Multi-select contact picker backed by the `ContactSelector` plugin block. Searches contacts as the user types, supports inline add (opens a modal with a short form) and inline edit/delete. Use this for ticket subscribers, points-of-contact, and any case where you need to pick multiple contacts and optionally create new ones on the fly.

```yaml
- _ref:
    module: contacts
    component: contact-selector
    vars:
      id: subscribers
      keyword: Subscriber
      required: true
      max: 10
      form_required:
        given_name: true
        family_name: true
        email: true
      filter:
        - compound:
            must:
              - in:
                  path: global_attributes.company_ids
                  value:
                    _state: ticket.company_id
```

**Required var:** `id` — unique per page usage; scopes the block's state keys (`{id}`, `{id}_contact`, `{id}_input`, …) and request ids.

**Common vars:**

| Var                    | Default                     | Purpose                                                       |
| ---------------------- | --------------------------- | ------------------------------------------------------------- |
| `required`             | `false`                     | Make the picker required                                      |
| `validate`             | `[]`                        | Additional validation rules                                   |
| `keyword`              | module `label` var          | Singular noun used in title/placeholder/modal                 |
| `title`                | `"Select {keyword}"`        | Override input title                                          |
| `placeholder`          | `"Select a {keyword}..."`   | Override input placeholder                                    |
| `filter`               | `[]`                        | Extra Atlas Search compound clauses (e.g. company filter)     |
| `all_contacts`         | `false`                     | If `false`, restrict results to contacts linked to one of the current user's companies (`_user: global_attributes.company_ids`). Set `true` to search the whole directory. |
| `phone_label`          | `false`                     | Append phone numbers to dropdown labels                       |
| `disable_new_contacts` | `false`                     | Hide the "add new contact" option                             |
| `disable_edit`         | `false`                     | Hide edit buttons on list rows                                |
| `disable_delete`       | `false`                     | Hide delete buttons on list rows                              |
| `max`                  | _(unbounded)_               | Max selectable contacts                                       |
| `extra_options`        | `[]`                        | Additional options appended to search results                 |
| `form_required`        | `{ given_name, family_name, email: true }` | Which modal form fields are required          |
| `item`                 | `{}`                        | Override list row `{ title, description }` nunjucks templates |

**Wired events:**

- `onAddContact` — validates the modal form, calls the module's `create-contact` API, and appends the returned contact to the selection.
- `onEditContact` — calls the module's `update-contact` API with the edited contact.

**Available block events** (fire your own handlers by passing additional entries via `events:`):

- `onOpen`, `onClose` — modal lifecycle.
- `onChange` — selection changed (add or remove).
- `onCancel` — modal cancelled.
- `onBlur`, `onFocus`, `onClear` — selector input events.
- `afterSearch` — fires on every search-text change, with `event.value` set to the current query string. Useful for dependent lookups or analytics.
- `afterClose` — fires after the modal's close transition finishes.

**Modal form:** By default the picker ships with a three-field form (first name, last name, email). Email is disabled when editing existing contacts. If you need a richer form (company selector, phone numbers, custom fields), copy `components/form_contact_short.yaml.njk` and ref your own form in the modal content slot.

**State paths:** The picker stores its selection at `state[{id}]` (an array of contact summaries). When the modal is open, the contact being added/edited is at `state[{id}_contact]`. Use these in downstream request payloads — e.g. `_state: subscribers` to get the selected contacts.

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
