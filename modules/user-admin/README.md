# User Admin

User administration — list, search, invite, edit, and manage user access for an app. Operates on the shared `user-contacts` collection with per-app data namespaced under `apps.{app_name}`, so a single collection serves multiple apps.

The end-user counterpart is [`user-account`](../user-account/README.md).

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | Page wrapper |
| [events](../events/README.md) | Audit logging and `change_stamp` |
| [notifications](../notifications/README.md) | Invite + resend dispatch |

## How to Use

```yaml
modules:
  - id: user-admin
    source: "github:lowdefy/modules-mongodb/modules/user-admin@v0.1.1"
    vars:
      app_name: my-app
      app_title: Team
      roles:
        _ref: modules/user-admin/roles.yaml
      fields:
        show_honorific: true
        profile:
          _ref: modules/shared/profile/fields.yaml
        global_attributes:
          _ref: modules/user-admin/global_attributes_fields.yaml
        app_attributes:
          _ref: modules/user-admin/app_attributes_fields.yaml
```

`app_name` and `roles` are required. See `apps/demo/modules/user-admin/vars.yaml` for a worked example, [App name scoping](../../docs/idioms.md#app-name), and [Slots](../../docs/idioms.md#slots).

## Exports

### Pages

| ID | Description | Path |
|---|---|---|
| `users` | List with filtering, sorting, pagination, Excel download | `/{entryId}/users` |
| `users-view` | Read-only detail with profile, attributes, access sidebar | `/{entryId}/users-view` |
| `users-edit` | Edit existing user profile and access | `/{entryId}/users-edit` |
| `users-invite` | Invite a new user with profile and access | `/{entryId}/users-invite` |
| `check-invite-email` | Verify email availability before sending an invite | `/{entryId}/check-invite-email` |

### Components

- **`user-selector`** — Autocomplete selector returning all active users for the current app. Use in other modules that need a user picker.

  ```yaml
  _ref:
    module: user-admin
    component: user-selector
    vars:
      label: Assigned To
  ```

### API Endpoints

| ID | Description |
|---|---|
| `invite-user` | Create user invite with profile, access, and notification. Logs `invite-user`. |
| `update-user` | Update existing user profile and access. Logs `update-user`. |
| `resend-invite` | Resend the invite email for a user with an open invite. Logs `resend-user-invite`. |

### Connections

| ID | Collection |
|---|---|
| `user-contacts-collection` | `user-contacts` |

### Menus

| ID | Contents |
|---|---|
| `default` | Single link to the users list. Title adapts to `app_title`. |

```yaml
links:
  _ref:
    module: user-admin
    menu: default
```

## Vars

### `app_name` (required)

`string` — App identifier used in MongoDB field paths. Per-app data is stored under `apps.{app_name}` (roles, disabled status, invite state, sign-up date, app attributes). See [App name scoping](../../docs/idioms.md#app-name).

### `roles` (required)

`array` of `{ label, value }` — Roles shown in role selectors on the invite/edit pages, role filters on the list page, and role columns in the table and Excel export.

### `app_title`

`string`, default `""`. Optional display prefix for page titles and menu labels:

| `app_title` | Page title examples |
|---|---|
| _(not set)_ | "User Admin", "Invite User", "Edit User" |
| `"Team"` | "Team User Admin", "Invite Team User", "Edit Team User" |

### `app_domain`

`string` — Base URL for invite links shown on the invite and edit pages. Falls back to the current browser origin. Invite link format: `{app_domain}/login?hint={email}`.

### `event_display`

`object` — See [Event display](../../docs/idioms.md#event-display). Defaults from `defaults/event_display.yaml`. Event types: `invite-user`, `update-user`, `resend-user-invite`. Templates receive `user` (current user) and `target` (`{ name, email }` of the affected user).

### `fields`

`object` — Field-block slots. See [Slots](../../docs/idioms.md#slots).

- **`show_honorific`** — `boolean`, default `false`. Show the honorific (Mr/Ms/Dr) selector in the profile form.
- **`profile`** — Profile field blocks; ids prefixed with `profile.`.
- **`global_attributes`** — Cross-app attribute field blocks; ids prefixed with `global_attributes.`.
- **`app_attributes`** — Per-app attribute field blocks scoped to `app_name`; ids prefixed with `app_attributes.`. Saved to `apps.{app_name}.app_attributes` on write.

### `components`

`object` — Component slot overrides. See [Slots](../../docs/idioms.md#slots).

- **`table_columns`** — Extra columns on the users list table.
- **`download_columns`** — Extra columns on the Excel export.
- **`filters`** — Extra filter blocks below the search bar.
- **`main_slots`** — Extra blocks on the users-view main column.
- **`sidebar_slots`** — Extra blocks on the users-view sidebar.
- **`view_access_tile`** — Override for the access tile on users-view (default is the built-in roles/access summary).

### `request_stages`

`object` — Pipeline overrides. See [Slots](../../docs/idioms.md#slots).

- **`filter_match`** — Atlas Search compound clauses appended to the list `$search` query.
- **`get_all_users`** — Stages appended after filtering on the list and Excel export aggregations.
- **`write`** — Update stages appended to both `update-user` and `invite-user` flows.

### `filter_requests`

`array`, default `[]`. Additional requests fetched alongside the custom `filters` blocks.

### `avatar_colors`

`array` — Default loaded from `modules/shared/profile/avatar_colors.yaml`. See [Avatar colors](../../docs/idioms.md#avatar-colors).

## Secrets

| Name | Used for |
|---|---|
| `MONGODB_URI` | MongoDB connection |

## Plugins

- `@lowdefy/community-plugin-mongodb`
- `@lowdefy/community-plugin-xlsx` — Excel download
- `@lowdefy/modules-mongodb-plugins` — `SmartDescriptions`, `EventsTimeline`

## Notes

User documents share the `user-contacts` collection with plain contacts managed by the [`contacts`](../contacts/README.md) module — users are distinguished by `apps.{app_name}.is_user === true`. The `contacts` module excludes user records from its list and refuses to edit them; this module is the only writer for users.
