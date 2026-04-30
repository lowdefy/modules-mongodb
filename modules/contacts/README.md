# Contacts

Contact management — list, detail, edit, and create pages over the shared `user-contacts` collection, plus a rich contact selector with inline add/edit/verify and a basic dropdown selector.

User records (those with `apps.{app_name}.is_user === true`, managed by `user-admin` and `user-account`) are excluded from the contact list and are not editable through this module.

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | Page wrapper |
| [events](../events/README.md) | Audit logging and `change_stamp` |
| [companies](../companies/README.md) | Company selector and bidirectional linking |
| [files](../files/README.md) | Optional file-attachments sidebar tile |

Cross-module cycle: `companies ↔ contacts`. Both must be added as separate entries in `lowdefy.yaml`.

## How to Use

```yaml
modules:
  - id: contacts
    source: "github:lowdefy/modules-mongodb/modules/contacts@v0.2.0"
    vars:
      app_name: my-app
      fields:
        show_honorific: true
        profile:
          _ref: modules/shared/profile/fields.yaml
        global_attributes:
          - id: global_attributes.notes
            type: TextArea
            properties:
              title: Internal Notes
```

`app_name` is required — see [App name scoping](../../docs/idioms.md#app-name). To extend forms, lists, or pipelines, see [Slots](../../docs/idioms.md#slots). See `apps/demo/modules/contacts/vars.yaml` for a worked example.

## Exports

### Pages

| ID | Description | Path |
|---|---|---|
| `all` | List with filtering, sorting, pagination, Excel download | `/{entryId}/all` |
| `view` | Read-only detail with sidebar tiles | `/{entryId}/view` |
| `edit` | Edit existing contact (blocked for user records) | `/{entryId}/edit` |
| `new` | Create a new contact with duplicate detection | `/{entryId}/new` |

### Components

- **`contact-selector`** — Rich `ContactSelector` block: search, add, edit, remove, optional verify UI. Backed by [`@lowdefy/modules-mongodb-plugins/blocks/ContactSelector`](../../plugins/modules-mongodb-plugins/src/blocks/ContactSelector/README.md).

  ```yaml
  _ref:
    module: contacts
    component: contact-selector
    vars:
      label: Linked Contacts
      mode: MultipleSelector
      field_id: contacts
  ```

- **`basic-contact-selector`** — Simple `Selector` / `MultipleSelector` dropdown over all active contacts, no add/edit UI.

### API Endpoints

| ID | Description |
|---|---|
| `create-contact` | Upsert by `lowercase_email`; if found, returns the existing id. Logs `create-contact` |
| `update-contact` | `$mergeObjects` update on `profile` and `global_attributes`, guarded by `apps.{app_name}.is_user !== true`. Logs `update-contact` |

### Connections

| ID | Collection |
|---|---|
| `contacts-collection` | `user-contacts` |

### Menus

| ID | Contents |
|---|---|
| `default` | Single link to the contacts list |

## Vars

### `app_name` (required)

`string` — App identifier. Used to guard edits on user records (`apps.{app_name}.is_user`) and scope per-app access flags. See [App name scoping](../../docs/idioms.md#app-name).

### `label` / `label_plural`

`string` — Defaults `Contact` / `Contacts`.

### `event_display`

`object` — See [Event display](../../docs/idioms.md#event-display). Event types: `create-contact`, `update-contact`. Defaults from `defaults/event_display.yaml`.

### `fields`

`object` — Field-block slots. See [Slots](../../docs/idioms.md#slots).

- **`show_honorific`** — `boolean`, default `false`. Shows the honorific (Mr/Ms/Dr) selector in the profile form.
- **`profile`** — Extended profile field blocks; ids prefixed with `profile.`.
- **`global_attributes`** — Cross-app attribute field blocks; ids prefixed with `global_attributes.`.

### `components`

`object` — Component slot overrides. See [Slots](../../docs/idioms.md#slots).

- **`table_columns`** — Extra columns on the list table.
- **`filters`** — Extra filter blocks below the search bar.
- **`main_slots`** — Extra blocks on the detail page main column.
- **`sidebar_slots`** — Extra blocks on the detail page sidebar.
- **`download_columns`** — Extra columns on the Excel export.
- **`company_card_extra_fields`** — `[{ label, value }]` pairs appended under each company in the contact `view` page companies tile. `value` is a top-level key on the company doc projected by `get_contact_companies`.

### `request_stages`

`object` — Pipeline overrides. See [Slots](../../docs/idioms.md#slots).

- **`get_all_contacts`** — Stages appended after filtering on the list and Excel export.
- **`get_contact`** — Stages appended to `get_contact` (e.g. `$lookup`, `$addFields`).
- **`selector`** — Stages appended to the contact-selector aggregation.
- **`filter_match`** — Atlas Search compound clauses appended to the list `$search`.
- **`write`** — Update stages appended to both create and update flows. Runs after the built-in `$mergeObjects` of `profile` and `global_attributes`.

### `filter_requests`

`array` — Default `[]`. Additional requests fetched alongside the custom `filters` blocks.

### `avatar_colors`

`array` — Default loaded from `modules/shared/profile/avatar_colors.yaml`. See [Avatar colors](../../docs/idioms.md#avatar-colors).

### `use_verified`

`boolean` — Default `false`. When `true`, contact selectors render a Verify button for unverified rows and write `global_attributes.verified` on add/edit. Each picker instance sets the written value via its per-call `verified` var (see the contact-selector wrapper).

## Secrets

| Name | Used for |
|---|---|
| `MONGODB_URI` | MongoDB connection |

## Plugins

- `@lowdefy/community-plugin-mongodb`
- `@lowdefy/community-plugin-xlsx` — Excel download
- `@lowdefy/modules-mongodb-plugins` — `ContactSelector`, `SmartDescriptions`, `EventsTimeline`, `FetchRequest`

## Notes

Contact records live in the `user-contacts` collection alongside user records. The `apps.{app_name}.is_user` flag distinguishes plain contacts from users — the contact list filters them out and the edit page refuses to save them.
