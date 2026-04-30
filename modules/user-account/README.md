# User Account

User account pages — login, email verification, profile view/edit/create.

## Dependencies

| Dependency | Purpose                               |
| ---------- | ------------------------------------- |
| **layout** | Page layout wrapper                   |
| **events** | Audit event logging and change stamp  |

## Pages

### `login`

Email-based passwordless login page.

### `verify-email-request`

Confirmation page after the sign-in link is sent.

### `view`

View user profile details.

### `edit`

Edit user profile fields.

### `new`

First-time profile creation after sign-up.

### `logout`

Logout page — logs the user out and shows the login link.

## Components

### `profile-avatar`

Avatar config for the `PageSiderMenu` / `PageHeaderMenu` profile slot — user picture with first-letter fallback.

## Menus

### `default`

User account navigation links (single Profile link).

### `profile-default`

Default profile dropdown: Profile + Divider + Logout. Drop into the app's top-level `id: profile` menu for zero-config use:

```yaml
# apps/{app}/menus.yaml
- id: profile
  links:
    _ref:
      module: user-account
      menu: profile-default
```

For a custom dropdown (extra links, per-role differences), write the whole `id: profile` menu inline in the app's `menus.yaml` instead of referencing `profile-default`.

## API Endpoints

### `create-profile`

Create a new user profile record.

### `update-profile`

Update existing user profile fields.

## Connections

### `user-contacts-collection`

MongoDB connection for user contact records.

## Vars

### `app_name` (required)

Type: `string`

App name for event metadata.

### `login_message`

Type: `string`
Default: `<p>Welcome. Please provide your work email to sign in.</p>`

HTML message shown on the login page.

### `verify_email_message`

Type: `string`
Default: `A sign in link has been sent to your email. Follow the link to sign in.`

Message shown on the verify email request page.

### `event_display`

Type: `object`

Per-app event display templates. Keys are app identifiers, values map event types to Nunjucks title templates.

### `avatar_colors`

Type: `array`

Gradient pairs for avatar backgrounds. Each entry: `{ from, to }`.

### `fields`

Type: `object`

Field block arrays: `profile`. Same blocks used for edit forms and SmartDescriptions view. `show_title` toggles the title/honorific field.

- **`show_title`** (boolean) — Default: `false`
- **`profile`** (array) — Default: `[]`

### `components`

Type: `object`

Component overrides.

- **`view_extra`** (array) — Default: `[]`

### `request_stages`

Type: `object`

MongoDB pipeline stage overrides. `write` stages are appended to both create and update profile flows.

- **`write`** (array) — Default: `[]`

## Secrets

| Secret          | Purpose                 |
| --------------- | ----------------------- |
| `MONGODB_URI`   | MongoDB connection URI  |

## Plugins

- `@lowdefy/community-plugin-mongodb` (`^2`)
- `@lowdefy/modules-mongodb-plugins`
