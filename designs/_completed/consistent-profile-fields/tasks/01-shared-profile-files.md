# Task 1: Create Shared Profile Field Definitions

## Context

The `modules/shared/` directory already contains cross-module shared config (`enums/`, `layout/`). This task creates a new `profile/` subdirectory with three files that define the extended profile fields shared across user-account, contacts, and user-admin modules.

These shared files are the foundation for all subsequent tasks — every module will reference them via `_module.var` injection.

## Task

Create the directory `modules/shared/profile/` with three files:

### `modules/shared/profile/form_fields.yaml`

Form field blocks for extended profile fields (work_phone, mobile_phone, department, job_title, birthday). These are appended after core fields via `_build.array.concat` in each module's form.

```yaml
- id: contact.profile.work_phone
  type: PhoneNumberInput
  layout:
    span: 12
  properties:
    title: Work Number
- id: contact.profile.mobile_phone
  type: PhoneNumberInput
  layout:
    span: 12
  properties:
    title: Mobile Number
- id: contact.profile.department
  type: TextInput
  properties:
    title: Department
- id: contact.profile.job_title
  type: TextInput
  properties:
    title: Job Title
- id: contact.profile.birthday
  type: DateSelector
  properties:
    title: Birthday
```

### `modules/shared/profile/set_fields.yaml`

API `$set` operations for extended profile fields. These are merged into each module's API save logic via `_object.assign`.

```yaml
profile.work_phone:
  _payload: contact.profile.work_phone
profile.mobile_phone:
  _payload: contact.profile.mobile_phone
profile.birthday:
  _payload: contact.profile.birthday
profile.job_title:
  _string.trim:
    _if_none:
      - _payload: contact.profile.job_title
      - ""
profile.department:
  _string.trim:
    _if_none:
      - _payload: contact.profile.department
      - ""
```

### `modules/shared/profile/view_fields.yaml`

Pure data — label + key pairs for description items. Each module uses `_array.map` with `_get` to resolve these against its own data source.

```yaml
- label: Work Number
  key: profile.work_phone
- label: Mobile Number
  key: profile.mobile_phone
- label: Department
  key: profile.department
- label: Job Title
  key: profile.job_title
- label: Birthday
  key: profile.birthday
```

## Acceptance Criteria

- `modules/shared/profile/form_fields.yaml` exists with 5 field blocks (work_phone, mobile_phone, department, job_title, birthday)
- `modules/shared/profile/set_fields.yaml` exists with 5 field-to-payload mappings, with `_string.trim` on text fields
- `modules/shared/profile/view_fields.yaml` exists with 5 label+key pairs
- Field IDs use `contact.profile.*` prefix consistently
- No module-specific operators (no `_user:`, `_request:`, `_state:`) — these files are data only

## Files

- `modules/shared/profile/form_fields.yaml` — create — shared form field blocks
- `modules/shared/profile/set_fields.yaml` — create — shared API $set operations
- `modules/shared/profile/view_fields.yaml` — create — shared view description data
