# Task 7: Restructure contacts Manifest Vars

## Context

Tasks 5-6 updated the contacts module internals to use flat state namespace and pipeline APIs. The module code now references `fields.profile`, `fields.global_attributes`, `fields.show_title`, and `request_stages.write`. This task updates the module manifest to expose the new var interface.

## Task

### 1. Update `modules/contacts/module.lowdefy.yaml` vars

**Remove from `components`:**

- `profile_fields` → replaced by `fields.profile`
- `profile_set_fields` → eliminated (whole-object merge)
- `profile_view_config` → eliminated (SmartDescriptions reads blocks)
- `attributes_view_config` → eliminated (SmartDescriptions reads blocks)
- `form_attributes` → replaced by `fields.global_attributes`
- `attributes_set_fields` → eliminated (whole-object merge)

**Keep in `components`:**

- `detail_fields` (default: `_ref: components/view_contact.yaml`)
- `form_fields` (default: `_ref: components/form_contact.yaml`)
- `view_extra` (default: `[]`)
- `table` (default: `_ref: components/table_contacts.yaml`)
- `table_columns` (default: `[]`)
- `filters` (default: `_ref: components/filter_contacts.yaml`)
- `main_tiles` (default: `[]`)
- `sidebar_tiles` (default: `[]`)
- `download_columns` (default: `[]`)

**Add `fields` var:**

```yaml
fields:
  type: object
  description: "Field block arrays: profile, global_attributes. Same blocks used for edit forms and SmartDescriptions view."
  properties:
    show_title:
      type: boolean
      default: false
    profile:
      default: []
    global_attributes:
      default: []
```

Note: contacts doesn't have `app_attributes` (that's user-admin only). The `show_title` moves from top-level into `fields.show_title`.

**Update `request_stages`:**

```yaml
request_stages:
  type: object
  description: "MongoDB pipeline stage overrides: get_all_contacts, write, selector, filter_match"
  properties:
    get_all_contacts:
      default:
        - $addFields: {}
    selector:
      default: []
    filter_match:
      default: []
    write:
      default: []
```

Remove `insert_contact` and `update_contact` — both replaced by `write`.

### 2. Update show_title references

Search all contacts module files for `_module.var: show_title` and change to `_module.var: fields.show_title`. This affects:

- `components/form_contact.yaml` (the `_ref` vars to `form_core.yaml`)

### 3. Remove the top-level `show_title` var from the manifest

It's now nested under `fields`.

## Acceptance Criteria

- `module.lowdefy.yaml` has a `fields` var with `show_title`, `profile`, `global_attributes` properties
- No `components.profile_fields`, `components.profile_set_fields`, `components.profile_view_config`, `components.attributes_view_config`, `components.form_attributes`, or `components.attributes_set_fields` vars remain
- `request_stages` has `write` replacing `insert_contact` and `update_contact`
- All `_module.var: show_title` references updated to `_module.var: fields.show_title`
- Remaining `components` properties are preserved

## Files

- `modules/contacts/module.lowdefy.yaml` — **modify** — restructure vars section
- `modules/contacts/components/form_contact.yaml` — **modify** — update `show_title` var reference (if not already done in Task 5)
