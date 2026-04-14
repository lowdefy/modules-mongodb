# Task 2: Create Shared Attribute Configuration Files

## Context

Attributes (global and app) are currently only visible as editable form fields on the user-admin edit page. The design adds read-only attribute display to all view pages via an optional `attributes_view_config` module var.

The contacts module currently hardcodes `internal_details` in its view (`view_contact.yaml`), form (`form_contact.yaml`), and APIs (`create-contact.yaml`, `update-contact.yaml`). The design decouples this — `internal_details` becomes a consumer-defined attribute. The consumer provides it via shared config files.

The existing shared profile configs live at `apps/demo/modules/shared/profile/` and include `view_config.yaml`, `form_fields.yaml`, and `set_fields.yaml`. Three new files follow the same pattern for attributes.

## Task

Create three new shared configuration files in `apps/demo/modules/shared/profile/`.

### 1. Create `apps/demo/modules/shared/profile/attributes_view_config.yaml`

DataDescriptions formConfig items for read-only attribute display. Covers both global and app attributes:

```yaml
# Global attributes
- key: preferred_language
  title: Preferred Language
- key: timezone
  title: Timezone
- key: employee_number
  title: Employee Number
- key: internal_details
  title: Notes
  component: text_area
# App attributes
- key: cost_centre
  title: Cost Centre
- key: region
  title: Region
- key: access_level
  title: Access Level
- key: can_approve
  title: Can Approve
```

Note: `internal_details` (previously hardcoded as "Notes" in contacts view) is now a consumer-defined attribute alongside others. The `component: text_area` hint forces `longText` rendering with `span: "filled"` in DataDescriptions, regardless of content length — without it, short notes (under 200 chars with no newlines) would render as inline `string` type.

### 2. Create `apps/demo/modules/shared/profile/attributes_form_fields.yaml`

Form fields for the contacts form's `form_attributes` injection point. This replaces the hardcoded `internal_details` TextArea from `form_contact.yaml`:

```yaml
- id: contact.global_attributes.internal_details
  type: TextArea
  properties:
    title: Notes
    rows: 3
```

This is an array of Lowdefy blocks that the contacts module injects via `components.form_attributes`.

### 3. Create `apps/demo/modules/shared/profile/attributes_set_fields.yaml`

API set field mappings for consumer-defined attributes. This replaces the hardcoded `global_attributes.internal_details` set field from `create-contact.yaml` and `update-contact.yaml`:

```yaml
global_attributes.internal_details:
  _payload: contact.global_attributes.internal_details
```

This is an object that gets merged into the `$set` operation via `_object.assign` through the `components.attributes_set_fields` module var.

## Acceptance Criteria

- `apps/demo/modules/shared/profile/attributes_view_config.yaml` exists with all 8 attribute keys (preferred_language, timezone, employee_number, internal_details, cost_centre, region, access_level, can_approve)
- `apps/demo/modules/shared/profile/attributes_form_fields.yaml` exists with the internal_details TextArea block
- `apps/demo/modules/shared/profile/attributes_set_fields.yaml` exists with the internal_details set field mapping
- Files follow the same format conventions as existing `view_config.yaml`, `form_fields.yaml`, `set_fields.yaml`

## Files

- `apps/demo/modules/shared/profile/attributes_view_config.yaml` — **create** — read-only attribute display config
- `apps/demo/modules/shared/profile/attributes_form_fields.yaml` — **create** — contacts form attribute fields
- `apps/demo/modules/shared/profile/attributes_set_fields.yaml` — **create** — API set field mappings for attributes
