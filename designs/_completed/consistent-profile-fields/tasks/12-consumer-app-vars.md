# Task 12: Wire Shared Profile Files into Consumer App Vars

## Context

The consumer app (`apps/demo`) configures each module's vars in `apps/demo/modules.yaml` (which references `modules/user-account/vars.yaml` and `modules/user-admin/vars.yaml`). The refactored modules expect `show_title` and `components.profile_fields/set_fields/view_fields` vars.

The shared profile files in `modules/shared/profile/` use `contact.profile.*` field IDs and `_payload: contact.profile.*` paths. This works for user-account and contacts (which use `contact.*` state/payload paths), but **NOT for user-admin** (which uses `user.*` state/payload paths).

## Task

### `apps/demo/modules/user-account/vars.yaml`

Add profile vars:

```yaml
app_name:
  _ref:
    path: app_config.yaml
    key: app_name
show_title: true
components:
  profile_fields:
    _ref: ../../../../modules/shared/profile/form_fields.yaml
  profile_set_fields:
    _ref: ../../../../modules/shared/profile/set_fields.yaml
  profile_view_fields:
    _ref: ../../../../modules/shared/profile/view_fields.yaml
```

The `_ref` paths are relative from `apps/demo/modules/user-account/vars.yaml` to `modules/shared/profile/*.yaml`. Count the directory levels: `user-account/` -> `modules/` -> `demo/` -> `apps/` -> project root -> `modules/shared/profile/`. That's `../../../../modules/shared/profile/`.

### `apps/demo/modules/user-admin/vars.yaml`

Add profile vars. **Important:** user-admin uses `user.*` field IDs and payload paths. The shared files use `contact.*`. Two options:

**Option A (recommended):** Create user-admin-specific profile files in `apps/demo/modules/user-admin/` that mirror the shared files but with `user.` prefix:

`apps/demo/modules/user-admin/profile_form_fields.yaml`:

```yaml
- id: user.profile.work_phone
  type: PhoneNumberInput
  layout:
    span: 12
  properties:
    title: Work Number
- id: user.profile.mobile_phone
  type: PhoneNumberInput
  layout:
    span: 12
  properties:
    title: Mobile Number
- id: user.profile.department
  type: TextInput
  properties:
    title: Department
- id: user.profile.job_title
  type: TextInput
  properties:
    title: Job Title
- id: user.profile.birthday
  type: DateSelector
  properties:
    title: Birthday
```

`apps/demo/modules/user-admin/profile_set_fields.yaml`:

```yaml
profile.work_phone:
  _payload: user.profile.work_phone
profile.mobile_phone:
  _payload: user.profile.mobile_phone
profile.birthday:
  _payload: user.profile.birthday
profile.job_title:
  _string.trim:
    _if_none:
      - _payload: user.profile.job_title
      - ""
profile.department:
  _string.trim:
    _if_none:
      - _payload: user.profile.department
      - ""
```

Then update vars.yaml:

```yaml
app_name:
  _ref:
    path: app_config.yaml
    key: app_name
roles:
  _ref: roles.yaml
show_title: true
components:
  profile_fields:
    _ref: profile_form_fields.yaml
  profile_set_fields:
    _ref: profile_set_fields.yaml
```

**Option B:** Inline the field definitions directly in vars.yaml. Less DRY but fewer files.

Go with **Option A** — it keeps vars.yaml clean and the field definitions are easy to maintain alongside the shared versions.

### `apps/demo/modules.yaml`

No structural changes needed — the module entries already reference vars.yaml files via `_ref`. The contacts module is not yet configured in modules.yaml (it's not listed), so when contacts is added in the future, include the same shared refs pattern.

## Acceptance Criteria

- `apps/demo/modules/user-account/vars.yaml` includes `show_title: true` and `components.profile_fields/set_fields/view_fields` referencing shared files
- `apps/demo/modules/user-admin/vars.yaml` includes `show_title: true` and `components.profile_fields/set_fields` referencing user-admin-specific files
- `apps/demo/modules/user-admin/profile_form_fields.yaml` exists with `user.profile.*` field IDs
- `apps/demo/modules/user-admin/profile_set_fields.yaml` exists with `_payload: user.profile.*` paths
- `_ref` paths are correct relative to each vars.yaml file location
- user-admin does NOT include `profile_view_fields` (no view page)

## Files

- `apps/demo/modules/user-account/vars.yaml` — modify — add show_title and profile component vars
- `apps/demo/modules/user-admin/vars.yaml` — modify — add show_title and profile component vars
- `apps/demo/modules/user-admin/profile_form_fields.yaml` — create — user-admin-specific form fields with `user.*` IDs
- `apps/demo/modules/user-admin/profile_set_fields.yaml` — create — user-admin-specific set fields with `user.*` payload paths

## Notes

- The `contact.*` vs `user.*` field ID mismatch is inherent to how user-admin was built — its pages use `user` as the state key. The shared profile files can't be reused directly for user-admin. The consumer app provides adapted versions.
- When the contacts module is added to `apps/demo/modules.yaml`, it should follow the same pattern as user-account with `_ref` to the shared files in `modules/shared/profile/`.
