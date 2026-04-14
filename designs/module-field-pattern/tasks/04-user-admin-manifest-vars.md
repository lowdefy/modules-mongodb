# Task 4: Restructure user-admin Manifest Vars

## Context

Tasks 2-3 updated the user-admin module internals to use flat state namespace and pipeline APIs. The module code now references `fields.profile`, `fields.global_attributes`, `fields.app_attributes`, and `request_stages.write`. This task updates the module manifest (`module.lowdefy.yaml`) to expose the new var interface.

## Task

### 1. Update `modules/user-admin/module.lowdefy.yaml` vars

Replace the `components` and `request_stages` sections:

**Remove from `components`:**

- `profile_fields` → replaced by `fields.profile`
- `profile_set_fields` → eliminated (whole-object merge)
- `profile_view_config` → eliminated (SmartDescriptions reads blocks)
- `attributes_view_config` → eliminated (SmartDescriptions reads blocks)
- `global_attributes_fields` → replaced by `fields.global_attributes`
- `app_attributes_fields` → replaced by `fields.app_attributes`

**Keep in `components`:**

- `view_extra` (default: `[]`)
- `view_access_tile` (default: `_ref: components/view_access.yaml`)
- `table_columns` (default: `[]`)
- `download_columns` (default: `[]`)
- `filters` (default: `[]`)

**Add `fields` var:**

```yaml
fields:
  type: object
  description: "Field block arrays: profile, global_attributes, app_attributes. Same blocks used for edit forms and SmartDescriptions view."
  properties:
    show_title:
      type: boolean
      default: false
    profile:
      default: []
    global_attributes:
      default: []
    app_attributes:
      default: []
```

Note: `show_title` moves from a top-level var into `fields.show_title`. Update all `_module.var: show_title` references in module code to `_module.var: fields.show_title`.

**Update `request_stages`:**

```yaml
request_stages:
  type: object
  description: "MongoDB pipeline stage overrides: get_all_users, write, filter_match"
  properties:
    filter_match:
      default: []
    get_all_users:
      default:
        - $addFields: {}
    write:
      default: []
```

Remove `update_user` and `invite_user` — both replaced by `write`.

### 2. Update show_title references

Search all user-admin module files for `_module.var: show_title` and change to `_module.var: fields.show_title`. This affects:

- `components/form_profile.yaml` (the `_ref` vars to `form_core.yaml`)
- Any view component that conditionally shows the title field

### 3. Remove the top-level `show_title` var from the manifest

It's now nested under `fields`.

## Acceptance Criteria

- `module.lowdefy.yaml` has a `fields` var with `show_title`, `profile`, `global_attributes`, `app_attributes` properties
- No `components.profile_fields`, `components.profile_set_fields`, `components.profile_view_config`, `components.attributes_view_config`, `components.global_attributes_fields`, or `components.app_attributes_fields` vars remain
- `request_stages` has `write` replacing `update_user` and `invite_user`
- All `_module.var: show_title` references updated to `_module.var: fields.show_title`
- Remaining `components` properties (view_extra, view_access_tile, table_columns, download_columns, filters) are preserved

## Files

- `modules/user-admin/module.lowdefy.yaml` — **modify** — restructure vars section
- `modules/user-admin/components/form_profile.yaml` — **modify** — update `show_title` var reference (if not already done in Task 2)
- Any other files referencing `_module.var: show_title` — **modify** — update to `fields.show_title`
