# User Admin

User administration module — list, search, invite, edit, and manage user access across multi-app MongoDB environments.

## Dependencies

| Dependency        | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| **layout**        | Page layout wrapper (page, floating-actions components) |
| **events**        | Audit event logging and change stamps                   |
| **notifications** | Notification dispatch (invite and resend emails)        |

## Pages

### `users`

Main administration page. Displays a paginated, searchable table of all users belonging to the current app.

- Full-text search by name, surname, or email (MongoDB Atlas Search)
- Filter by roles, status (Active, Disabled, Open Invite)
- Sortable by name, email, date updated, date created, date signed up
- Row click navigates to edit page
- Excel export of filtered results

### `users-edit`

Edit an existing user's profile and access settings.

- Displays avatar preview, signed-up date, invite link, email
- Profile and access form sections (customizable via `components` var)
- Resend Invite button (visible when user hasn't accepted yet)
- Logs `update-user` audit event on save

### `users-invite`

Invite a new user with profile and access settings.

- Reached via `check-invite-email` page (validates email first)
- If the email already exists with an active account or open invite, redirects to `users-edit` instead
- Sets up invite link, profile, roles
- Logs `invite-user` audit event and dispatches notification on submit

### `check-invite-email`

Entry point for the invite flow. Validates the email address, checks if the user already exists, and routes to either `users-invite` (new) or `users-edit` (existing).

## Components

### `user-selector`

Autocomplete selector that returns all active users for the current app. Useful in other modules that need a user picker (e.g. assigning a contact owner).

```yaml
- _ref:
    module: user-admin
    component: user-selector
    vars:
      label: Assigned To
```

### `event_types`

User-admin's event type display metadata (color, title, icon for `invite-user`, `update-user`, `resend-user-invite`). Consumers that need to aggregate event type configs across modules can `_ref: { module: user-admin, component: event_types }`.

## API Endpoints

### `invite-user`

Creates or upserts a user document in MongoDB, logs an `invite-user` event, and dispatches a notification (email).

### `update-user`

Updates an existing user's profile, roles, and access flags. Logs an `update-user` event.

### `resend-invite`

Re-dispatches the invite notification for a user with an open invite. Logs a `resend-user-invite` event.

## Menus

### `default`

Single menu link to the `users` page. Title adapts to `app_title` — shows "{app_title} User Admin" or just "User Admin".

```yaml
links:
  - id: user-admin-group
    type: MenuGroup
    properties:
      title: User Admin
    links:
      _ref:
        module: user-admin
        menu: default
```

## Vars

### `app_name` (required)

Type: `string`

App identifier used to construct MongoDB field paths. User documents store per-app data under `apps.{app_name}` — this includes roles, disabled status, invite state, and sign-up date.

### `roles` (required)

Type: `array` of `{label, value}`

Available user roles shown in role selectors on the invite and edit pages, role filters on the list page, and role columns in the table and Excel export.

```yaml
roles:
  - label: Admin
    value: admin
  - label: Editor
    value: editor
  - label: Viewer
    value: viewer
```

### `app_title`

Type: `string`

Display prefix for page titles and menu labels. Appears throughout the UI:

| `app_title` | Page title examples                                     |
| ----------- | ------------------------------------------------------- |
| _(not set)_ | "User Admin", "Invite User", "Edit User"                |
| `"Team"`    | "Team User Admin", "Invite Team User", "Edit Team User" |

### `app_domain`

Type: `string`

Base URL for invite links shown on the invite and edit pages. Falls back to the current browser origin if not provided. The invite link format is `{app_domain}/login?hint={email}`.

### `event_display`

Type: `object`

Per-app event display templates. Each key is an app identifier (matching the viewing app's `display_key` in the events module). Each value maps event types to Nunjucks title templates. Templates receive `user` (current user) and `target` (affected user with `name` and `email`).

Merged with the built-in defaults:

```yaml
# defaults/event_display.yaml
default:
  invite-user: "{{ user.profile.name }} invited {{ target.name }}"
  update-user: "{{ user.profile.name }} updated {{ target.name }}"
  resend-user-invite: "{{ user.profile.name }} resent invite to {{ target.name }}"
```

The `default` key is a fallback — events always render a title even without app-specific configuration. Apps that need events to render in specific app contexts add their own keys:

```yaml
# App managing users for multiple apps
event_display:
  team-app:
    invite-user: "{{ user.profile.name }} invited {{ target.name }}"
    update-user: "{{ user.profile.name }} updated {{ target.name }}"
    resend-user-invite: "{{ user.profile.name }} resent invite to {{ target.name }}"
  support-app:
    invite-user: "New user {{ target.name }} invited"
    update-user: "{{ target.name }} was updated"
```

Omitting a template for an event type under a given key means no display entry is produced for that app — `support-app` above has no `resend-user-invite`, so resend events won't appear in the support app's event log.

### `components`

Type: `object`

Override default form sections, table columns, and filters. All keys are optional — omitted keys use module defaults (empty placeholder blocks for forms, standard columns for tables).

- **`profile_fields`** — Array of form field blocks appended to the profile section on invite and edit pages
- **`profile_set_fields`** — Object mapping field paths to payload operations for the API save
- **`global_attributes_fields`** — Array of form field blocks for the global attributes section (divider provided by template)
- **`app_attributes_fields`** — Array of form field blocks for the app-specific attributes section (divider provided by template)
- **`table_columns`** — Array of AgGrid column definitions appended to the users table
- **`download_columns`** — Array of column definitions appended to the Excel export
- **`filters`** — Array of block definitions added to the filter section on the users list page

### `request_stages`

Type: `object`

Inject additional MongoDB aggregation pipeline stages into the module's requests. Useful for adding custom computed fields, extra match conditions, or projections.

- **`get_all_users`** — Stages appended to the user list aggregation (after default projections)
- **`invite_user`** — Stages appended to the invite upsert operation
- **`update_user`** — Stages appended to the update operation
- **`filter_match`** — Additional `$search` compound filter clauses added to the Atlas Search query

### `filter_requests`

Type: `array`
Default: `[]`

Additional request definitions loaded on the users list page alongside the built-in requests. Use when custom filter components need their own data sources (e.g. a department list for a department filter).

## Data Model

User documents are stored in the `user_contacts` collection. Per-app data is namespaced under `apps.{app_name}`:

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
    picture: "https://api.dicebear.com/6.x/initials/svg?..."
  },
  global_attributes: { ... },
  apps: {
    "my-app": {
      is_user: true,
      disabled: false,
      roles: ["admin"],
      invite: { open: false },
      sign_up: "2026-01-15T10:30:00Z",
      app_attributes: { ... }
    }
  },
  created: { user: { ... }, timestamp: "..." },
  updated: { user: { ... }, timestamp: "..." }
}
```

This structure allows a single `user_contacts` collection to serve multiple apps — each app reads and writes only its own `apps.{app_name}` namespace.

## Event Types

The module logs three audit event types via the events dependency:

| Event Type           | Icon             | Color  | When                           |
| -------------------- | ---------------- | ------ | ------------------------------ |
| `invite-user`        | AiOutlineUserAdd | Blue   | New user invited               |
| `update-user`        | AiOutlineEdit    | Green  | User profile or access updated |
| `resend-user-invite` | AiOutlineSend    | Orange | Invite notification resent     |

## Example

```yaml
modules:
  - id: user-admin
    source: "github:lowdefy/modules-mongodb/modules/user-admin@v1"
    vars:
      app_name: my-app
      app_title: My App
      roles:
        - label: Admin
          value: admin
        - label: Editor
          value: editor
      components:
        form_profile:
          id: form_profile
          type: Box
          blocks:
            - id: user.profile.given_name
              type: TextInput
              properties:
                title: First Name
            - id: user.profile.family_name
              type: TextInput
              properties:
                title: Last Name
            - id: user.profile.title
              type: Selector
              properties:
                title: Title
                options:
                  - Mr
                  - Ms
                  - Dr
```
