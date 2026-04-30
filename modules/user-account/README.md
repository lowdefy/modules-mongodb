# User Account

Self-service account pages — passwordless login, email-verification confirmation, profile view/edit, first-time profile creation, and logout. The end-user side of the user/contact schema; the operator side lives in [`user-admin`](../user-admin/README.md).

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | Page wrapper, auth-page wrapper, profile dropdown |
| [events](../events/README.md) | Audit logging and `change_stamp` |

## How to Use

```yaml
modules:
  - id: user-account
    source: "github:lowdefy/modules-mongodb/modules/user-account@v0.1.1"
    vars:
      app_name: my-app
      fields:
        show_honorific: true
        profile:
          _ref: modules/shared/profile/fields.yaml
```

`app_name` is required — see [App name scoping](../../docs/idioms.md#app-name). Drop the `profile-default` menu into your app's `id: profile` menu for a zero-config dropdown:

```yaml
# apps/{app}/menus.yaml
- id: profile
  links:
    _ref:
      module: user-account
      menu: profile-default
```

See `apps/demo/modules/user-account/vars.yaml` for a worked example.

## Exports

### Pages

| ID | Description | Path |
|---|---|---|
| `login` | Email-based passwordless login | `/{entryId}/login` |
| `verify-email-request` | Confirmation page after sign-in link is sent | `/{entryId}/verify-email-request` |
| `profile` | View profile details | `/{entryId}/profile` |
| `edit-profile` | Edit profile fields | `/{entryId}/edit-profile` |
| `create-profile` | First-time profile creation after sign-up | `/{entryId}/create-profile` |
| `logout` | Logs the user out and shows the login link | `/{entryId}/logout` |

### Components

- **`profile-avatar`** — Avatar config consumed by the layout module's profile dropdown. Renders the user's picture with a first-letter fallback.

### API Endpoints

| ID | Description |
|---|---|
| `create-profile` | Create a new user profile record. Logs `create-profile`. |
| `update-profile` | Update existing user profile fields. Logs `update-profile`. |

### Connections

| ID | Collection |
|---|---|
| `user-contacts-collection` | `user-contacts` |

### Menus

| ID | Contents |
|---|---|
| `default` | Profile link |
| `profile-default` | Profile + Divider + Logout — drop into the app's `id: profile` menu for zero-config use |

## Vars

### `app_name` (required)

`string` — App identifier used in event metadata and per-app field paths. See [App name scoping](../../docs/idioms.md#app-name).

### `login_message`

`string` — Default `<p>Welcome. Please provide your work email to sign in.</p>`. HTML message shown on the login page above the email input.

### `verify_email_message`

`string` — Default `A sign in link has been sent to your email. Follow the link to sign in.`. Message shown on the verify-email-request page.

### `event_display`

`object` — See [Event display](../../docs/idioms.md#event-display). Defaults from `defaults/event_display.yaml`. Event types: `create-profile`, `update-profile`.

### `avatar_colors`

`array` — Default loaded from `modules/shared/profile/avatar_colors.yaml`. See [Avatar colors](../../docs/idioms.md#avatar-colors).

### `fields`

`object` — Field-block slot. See [Slots](../../docs/idioms.md#slots).

- **`show_honorific`** — `boolean`, default `false`. Show the honorific (Mr/Ms/Dr) selector in the profile form.
- **`profile`** — Profile field blocks; ids prefixed with `profile.`.

### `components`

`object`

- **`main_slots`** — Default `[]`. Extra blocks appended to the main column on the profile page.

### `request_stages`

`object` — See [Slots](../../docs/idioms.md#slots).

- **`write`** — Default `[]`. Update stages appended to both `create-profile` and `update-profile` flows.

## Secrets

| Name | Used for |
|---|---|
| `MONGODB_URI` | MongoDB connection |

## Plugins

- `@lowdefy/community-plugin-mongodb`
- `@lowdefy/modules-mongodb-plugins` — `SmartDescriptions`, `EventsTimeline`

## Notes

The login and verify-email-request pages render through the layout module's `auth-page` component. Auth chrome (cover gradient, max width, logo) is configured on the `layout` module entry — see [Layout — Auth page](../layout/README.md#auth-page).
