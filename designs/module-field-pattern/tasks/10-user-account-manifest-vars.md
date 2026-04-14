# Task 10: Restructure user-account Manifest Vars

## Context

Tasks 8-9 updated the user-account module internals to use flat state namespace and pipeline APIs. The module code now references `fields.profile`, `fields.show_title`, and `request_stages.write`. This task updates the module manifest to expose the new var interface.

## Task

### 1. Update `modules/user-account/module.lowdefy.yaml` vars

**Remove from `components`:**

- `profile_fields` → replaced by `fields.profile`
- `profile_set_fields` → eliminated (whole-object merge)
- `profile_view_config` → eliminated (SmartDescriptions reads blocks)
- `attributes_view_config` → eliminated (SmartDescriptions reads blocks)

**Keep in `components`:**

- `view_extra` (default: `[]`)

**Add `fields` var:**

```yaml
fields:
  type: object
  description: "Field block arrays: profile. Same blocks used for edit forms and SmartDescriptions view."
  properties:
    show_title:
      type: boolean
      default: false
    profile:
      default: []
```

Note: user-account doesn't expose global_attributes or app_attributes in its form — those are managed by user-admin. The `show_title` moves from top-level into `fields.show_title`.

**Add `request_stages` var:**

```yaml
request_stages:
  type: object
  description: "MongoDB pipeline stage overrides: write"
  properties:
    write:
      default: []
```

The user-account module currently has no `request_stages` in its manifest. Add it for consistency with the other modules.

### 2. Update show_title references

Search all user-account module files for `_module.var: show_title` and change to `_module.var: fields.show_title`. This affects:

- `components/form_profile.yaml`
- `components/view_profile.yaml`

### 3. Remove the top-level `show_title` var from the manifest

It's now nested under `fields`.

## Acceptance Criteria

- `module.lowdefy.yaml` has a `fields` var with `show_title` and `profile` properties
- No `components.profile_fields`, `components.profile_set_fields`, `components.profile_view_config`, or `components.attributes_view_config` vars remain
- `request_stages` section added with `write` property
- All `_module.var: show_title` references updated to `_module.var: fields.show_title`
- Remaining `components` properties (view_extra) preserved

## Files

- `modules/user-account/module.lowdefy.yaml` — **modify** — restructure vars section
- `modules/user-account/components/form_profile.yaml` — **modify** — update `show_title` var reference (if not already done in Task 8)
- `modules/user-account/components/view_profile.yaml` — **modify** — update `show_title` var reference (if not already done in Task 8)
