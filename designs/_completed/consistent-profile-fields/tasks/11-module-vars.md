# Task 11: Update module.lowdefy.yaml Vars for All Three Modules

## Context

Each module's `module.lowdefy.yaml` declares available vars and their descriptions. The refactored modules now consume new vars (`show_title`, `components.profile_fields`, `components.profile_set_fields`, `components.profile_view_fields`) that need to be documented in the var declarations.

## Task

### `modules/user-account/module.lowdefy.yaml`

Add `show_title` var and update `components` description:

```yaml
vars:
  app_name:
    required: true
    description: App name for event metadata
  login_message:
    default: <p>Welcome. Please provide your work email to sign in.</p>
    description: HTML message shown on the login page
  verify_email_message:
    default: A sign in link has been sent to your email. Follow the link to sign in.
    description: Message shown on the verify email request page
  event_display:
    default:
      _ref: defaults/event_display.yaml
    description: "Per-app event display templates. Keys are app identifiers, values map event types to Nunjucks title templates."
  show_title:
    type: boolean
    default: false
    description: Show the title/honorific field (Mr, Ms, Dr, etc.)
  components:
    description: "Overrides: form_profile, view_profile, profile_fields, profile_set_fields, profile_view_fields"
```

Changes:

1. Add `show_title` var with type, default, description
2. Add `profile_fields`, `profile_set_fields`, `profile_view_fields` to components description

### `modules/contacts/module.lowdefy.yaml`

Add `show_title` var and update `components` description:

```yaml
vars:
  # ... existing vars unchanged ...
  show_title:
    type: boolean
    default: false
    description: Show the title/honorific field (Mr, Ms, Dr, etc.)
  components:
    description: "Overrides: detail_fields, form_fields, form_attributes, profile_fields, profile_set_fields, profile_view_fields, table, filters, main_tiles, sidebar_tiles, download_columns"
```

Changes:

1. Add `show_title` var
2. Add `profile_fields`, `profile_set_fields`, `profile_view_fields` to components description

### `modules/user-admin/module.lowdefy.yaml`

Add `show_title` var, update `components` description, remove `form_profile` from components list:

```yaml
vars:
  # ... existing vars unchanged ...
  show_title:
    type: boolean
    default: false
    description: Show the title/honorific field (Mr, Ms, Dr, etc.)
  components:
    description: "Component overrides: profile_fields, profile_set_fields, form_global_attributes, form_app_attributes, table_columns, download_columns, filters"
```

Changes:

1. Add `show_title` var
2. **Remove** `form_profile` from components description (no longer a full-replacement var)
3. Add `profile_fields`, `profile_set_fields` to components description
4. Note: user-admin does NOT have `profile_view_fields` — it has no profile view page

## Acceptance Criteria

- All three modules declare `show_title` var with `type: boolean`, `default: false`, and description
- user-account components description includes `profile_fields`, `profile_set_fields`, `profile_view_fields`
- contacts components description includes `profile_fields`, `profile_set_fields`, `profile_view_fields`
- user-admin components description includes `profile_fields`, `profile_set_fields` (no view_fields)
- user-admin components description does NOT include `form_profile`
- All existing vars unchanged

## Files

- `modules/user-account/module.lowdefy.yaml` — modify — add show_title var, update components description
- `modules/contacts/module.lowdefy.yaml` — modify — add show_title var, update components description
- `modules/user-admin/module.lowdefy.yaml` — modify — add show_title var, update components description
