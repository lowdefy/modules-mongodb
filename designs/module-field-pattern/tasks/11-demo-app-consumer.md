# Task 11: Rewrite Demo App Consumer Files for New Interface

## Context

Tasks 2-10 restructured all three modules to use the flat namespace and the new `fields` / `request_stages.write` var interface. The demo app at `apps/demo/` needs to be updated to wire the new vars and rewrite its field files to use the flat `profile.*` namespace.

## Task

### 1. Create shared field file with flat namespace

**Create `apps/demo/modules/shared/profile/fields.yaml`:**

```yaml
- id: profile.phone_number
  type: PhoneNumberInput
  properties:
    title: Phone Number

- id: profile.department
  type: TextInput
  properties:
    title: Department

- id: profile.job_title
  type: TextInput
  properties:
    title: Job Title
```

This replaces both:

- `apps/demo/modules/user-admin/components/profile_fields.yaml` (used `user.profile.*`)
- `apps/demo/modules/shared/profile/form_fields.yaml` (used `contact.profile.*`)

One file, shared across all modules. No module-specific prefix.

### 2. Rewrite user-admin consumer vars

**Update `apps/demo/modules/user-admin/vars.yaml`:**

```yaml
app_name:
  _ref:
    path: app_config.yaml
    key: app_name
roles:
  _ref: modules/user-admin/roles.yaml
fields:
  show_title: true
  profile:
    _ref: modules/shared/profile/fields.yaml
  global_attributes:
    _ref: modules/user-admin/global_attributes_fields.yaml
  app_attributes:
    _ref: modules/user-admin/app_attributes_fields.yaml
request_stages:
  write: []
```

Key changes:

- `components.profile_fields` → `fields.profile`
- `components.profile_set_fields` → **eliminated** (no replacement needed)
- `components.profile_view_config` → **eliminated** (no replacement needed)
- `components.global_attributes_fields` → `fields.global_attributes`
- `components.app_attributes_fields` → `fields.app_attributes`
- `show_title: true` added under `fields`
- `request_stages.write` added (empty — demo doesn't need custom stages)

### 3. Rewrite global_attributes and app_attributes field files

**Update `apps/demo/modules/user-admin/global_attributes_fields.yaml`:**

Was at `apps/demo/modules/user-admin/components/global_attributes_fields.yaml` (move out of `components/` dir since it's now a field definition, not a component):

```yaml
- id: global_attributes.notes
  type: TextArea
  properties:
    title: Notes
    rows: 3
```

Note: The existing file has `label:` instead of `title:` — standardize to `title:` for consistency.

**Update `apps/demo/modules/user-admin/app_attributes_fields.yaml`:**

Was at `apps/demo/modules/user-admin/components/app_attributes_fields.yaml`:

```yaml
- id: app_attributes.team
  type: Selector
  properties:
    title: Team
    options:
      - label: Alpha
        value: alpha
      - label: Beta
        value: beta
      - label: Gamma
        value: gamma
```

Note: Change `label:` to `title:` for consistency.

Both files already use `user.global_attributes.*` and `user.app_attributes.*` IDs. Since the flat namespace drops the `user.` prefix, the IDs become `global_attributes.*` and `app_attributes.*` — which is what they already are. No ID changes needed.

### 4. Rewrite contacts consumer vars

**Update `apps/demo/modules/contacts/vars.yaml`:**

```yaml
app_name:
  _ref:
    path: app_config.yaml
    key: app_name
fields:
  profile:
    _ref: modules/shared/profile/fields.yaml
  global_attributes:
    _ref: modules/contacts/global_attributes_fields.yaml
request_stages:
  write: []
```

Key changes:

- `components.profile_fields` → `fields.profile` (now uses shared file, same as user-admin)
- `components.profile_set_fields` → **eliminated**
- `components.profile_view_config` → **eliminated**
- `components.attributes_view_config` → **eliminated**
- `components.form_attributes` → `fields.global_attributes`
- `components.attributes_set_fields` → **eliminated**

**Create `apps/demo/modules/contacts/global_attributes_fields.yaml`:**

Was at `apps/demo/modules/contacts/attributes_form_fields.yaml`:

```yaml
- id: global_attributes.internal_details
  type: TextArea
  properties:
    title: Notes
    rows: 3
```

ID was `contact.global_attributes.internal_details` → now `global_attributes.internal_details`.

### 5. Delete obsolete consumer files

- `apps/demo/modules/user-admin/components/profile_fields.yaml` — **delete** (replaced by shared `fields.yaml`)
- `apps/demo/modules/user-admin/components/profile_set_fields.yaml` — **delete** (eliminated)
- `apps/demo/modules/shared/profile/form_fields.yaml` — **delete** (replaced by shared `fields.yaml`)
- `apps/demo/modules/shared/profile/set_fields.yaml` — **delete** (eliminated)
- `apps/demo/modules/shared/profile/profile_view_config.yaml` — **delete** (eliminated)
- `apps/demo/modules/contacts/attributes_form_fields.yaml` — **delete** (replaced by `global_attributes_fields.yaml`)
- `apps/demo/modules/contacts/attributes_set_fields.yaml` — **delete** (eliminated)
- `apps/demo/modules/contacts/attributes_view_config.yaml` — **delete** (eliminated)

### 6. Update user-account consumer vars (if any)

Check `apps/demo/modules/user-account/vars.yaml`. If it exists and references `components.profile_fields` or `components.profile_set_fields`, update to:

```yaml
fields:
  profile:
    _ref: modules/shared/profile/fields.yaml
```

The current demo user-account vars only has `app_name` — no component overrides. Add `fields` if the demo wants extended fields on the user-account profile.

## Acceptance Criteria

- One shared `fields.yaml` file at `apps/demo/modules/shared/profile/fields.yaml` with `profile.*` field IDs
- user-admin vars use `fields.profile`, `fields.global_attributes`, `fields.app_attributes`, `fields.show_title`
- contacts vars use `fields.profile`, `fields.global_attributes`
- No `components.profile_fields`, `components.profile_set_fields`, `components.profile_view_config`, `components.attributes_view_config`, `components.form_attributes`, or `components.attributes_set_fields` remain in any vars file
- All obsolete consumer files deleted
- No `user.profile.*` or `contact.profile.*` field IDs remain in consumer files
- `request_stages.write` wired (even if empty) in consumer vars

## Files

- `apps/demo/modules/shared/profile/fields.yaml` — **create** — shared profile fields with flat namespace
- `apps/demo/modules/user-admin/vars.yaml` — **modify** — restructure to new var interface
- `apps/demo/modules/user-admin/global_attributes_fields.yaml` — **create** (moved from `components/`)
- `apps/demo/modules/user-admin/app_attributes_fields.yaml` — **create** (moved from `components/`)
- `apps/demo/modules/contacts/vars.yaml` — **modify** — restructure to new var interface
- `apps/demo/modules/contacts/global_attributes_fields.yaml` — **create** (moved/renamed from `attributes_form_fields.yaml`)
- `apps/demo/modules/user-admin/components/profile_fields.yaml` — **delete**
- `apps/demo/modules/user-admin/components/profile_set_fields.yaml` — **delete**
- `apps/demo/modules/shared/profile/form_fields.yaml` — **delete**
- `apps/demo/modules/shared/profile/set_fields.yaml` — **delete**
- `apps/demo/modules/shared/profile/profile_view_config.yaml` — **delete**
- `apps/demo/modules/contacts/attributes_form_fields.yaml` — **delete**
- `apps/demo/modules/contacts/attributes_set_fields.yaml` — **delete**
- `apps/demo/modules/contacts/attributes_view_config.yaml` — **delete**

## Notes

- Verify that the demo `modules.yaml` doesn't need changes — it references `vars: { _ref: modules/{module}/vars.yaml }` which stays the same.
- The `apps/demo/modules/user-admin/components/` directory may be empty after deleting the profile files. If empty, remove the directory.
