# Task 5: Decouple internal_details from Contacts Form and APIs

## Context

After task 2, the shared attribute config files exist at `apps/demo/modules/shared/profile/`:

- `attributes_form_fields.yaml` — the `internal_details` TextArea block
- `attributes_set_fields.yaml` — the `internal_details` API set field mapping

The contacts module currently hardcodes `internal_details` in three places:

1. **Form** (`modules/contacts/components/form_contact.yaml`, lines 72-80): A "Details" divider followed by an `internal_details` TextArea, hardcoded directly in the form component
2. **Create API** (`modules/contacts/api/create-contact.yaml`, line 111-112): `global_attributes.internal_details: _payload: contact.global_attributes.internal_details`
3. **Update API** (`modules/contacts/api/update-contact.yaml`, line 88-89): Same hardcoded set field

The design decouples all three: the contacts module shouldn't have special knowledge of `internal_details` — it's a consumer-defined global attribute. The consumer injects it via module vars.

The contacts module already has a `components.form_attributes` injection point in `form_contact.yaml` (line 82-84), but it's after the hardcoded Details section. The form_attributes injection currently receives nothing from the demo consumer.

## Task

### 1. Modify `modules/contacts/components/form_contact.yaml`

Remove the hardcoded "Details" divider and `internal_details` TextArea. Replace with a conditional "Details" divider that only shows when the consumer provides `form_attributes`, wrapping the existing `form_attributes` injection point.

**Current structure (lines 71-84):**

```yaml
# Contacts-specific fields
- - id: divider_details
    type: Divider
    properties:
      title: Details
  - id: contact.global_attributes.internal_details
    type: TextArea
    properties:
      title: Notes
      rows: 3
# form_attributes injection point (existing)
- _module.var:
    key: components.form_attributes
    default: []
```

**New structure:**

```yaml
# Attributes section (conditional — only when consumer provides form_attributes)
- _build.if:
    test:
      _build.ne:
        - _module.var:
            key: components.form_attributes
            default: null
        - null
    then:
      _build.array.concat:
        - - id: divider_details
            type: Divider
            properties:
              title: Details
        - _module.var:
            key: components.form_attributes
            default: []
    else: []
```

This follows the same conditional divider pattern used by `form_global_attributes.yaml` and `form_app_attributes.yaml` in user-admin — divider shows only when the consumer provides fields.

### 2. Modify `modules/contacts/api/create-contact.yaml`

Remove the hardcoded `internal_details` set field and add the `attributes_set_fields` injection point.

**Remove** from the `$set._object.assign` array (around line 111-112):

```yaml
global_attributes.internal_details:
  _payload: contact.global_attributes.internal_details
```

**Add** a new `_object.assign` entry for consumer attribute set fields, after the existing `profile_set_fields` injection:

```yaml
# Attribute set fields (injected by consumer)
- _module.var:
    key: components.attributes_set_fields
    default: {}
```

Place this in the `_object.assign` array alongside the existing injections (`profile_set_fields`, title conditional, etc.). The exact position should be after the `profile_set_fields` entry and before the `request_stages` section.

### 3. Modify `modules/contacts/api/update-contact.yaml`

Same change as create-contact:

**Remove** the hardcoded `internal_details` set field (around line 88-89):

```yaml
global_attributes.internal_details:
  _payload: contact.global_attributes.internal_details
```

**Add** the same `attributes_set_fields` injection:

```yaml
# Attribute set fields (injected by consumer)
- _module.var:
    key: components.attributes_set_fields
    default: {}
```

### 4. Update `modules/contacts/module.lowdefy.yaml`

Add `attributes_set_fields` to the components var description:

```yaml
components:
  description: "Overrides: detail_fields, form_fields, form_attributes, attributes_set_fields, profile_fields, profile_set_fields, profile_view_config, attributes_view_config, view_extra, table, filters, main_tiles, sidebar_tiles, download_columns"
```

### 5. Update `apps/demo/modules/contacts/vars.yaml`

Add the `form_attributes` and `attributes_set_fields` references. If this file was created in task 4, add to the existing `components` section:

```yaml
components:
  # ... existing entries from task 4 ...
  form_attributes:
    _ref: modules/shared/profile/attributes_form_fields.yaml
  attributes_set_fields:
    _ref: modules/shared/profile/attributes_set_fields.yaml
```

If the vars file doesn't exist yet (task 4 hasn't run), create it with all needed entries.

## Acceptance Criteria

- `form_contact.yaml` no longer contains `contact.global_attributes.internal_details` TextArea or the hardcoded "Details" divider
- "Details" divider only appears when `components.form_attributes` is provided
- `create-contact.yaml` no longer contains `global_attributes.internal_details` in the hardcoded set fields
- `update-contact.yaml` no longer contains `global_attributes.internal_details` in the hardcoded set fields
- Both APIs accept `components.attributes_set_fields` for consumer-injected attribute fields
- The demo consumer provides `form_attributes` (internal_details TextArea) and `attributes_set_fields` (internal_details mapping) via vars
- `internal_details` still saves and loads correctly for existing contacts
- `company_ids` remains hardcoded in the APIs (it's a core contacts concept, not a consumer attribute)
- Lowdefy build succeeds with no errors

## Files

- `modules/contacts/components/form_contact.yaml` — **modify** — remove hardcoded internal_details, wrap form_attributes with conditional divider
- `modules/contacts/api/create-contact.yaml` — **modify** — remove hardcoded internal_details set field, add attributes_set_fields injection
- `modules/contacts/api/update-contact.yaml` — **modify** — same as create-contact
- `modules/contacts/module.lowdefy.yaml` — **modify** — update components var description (may already be done in task 4)
- `apps/demo/modules/contacts/vars.yaml` — **modify** — add form_attributes and attributes_set_fields refs

## Notes

- This is a **breaking change** for existing consumers that rely on `internal_details` working out of the box. Any consumer that currently uses the contacts module gets `internal_details` automatically. After this change, they must explicitly provide it via `form_attributes` and `attributes_set_fields` vars.
- `company_ids` stays hardcoded — it powers the company sidebar tile, has a MongoDB index, and the contacts module declares `companies` as a dependency. It has structural significance unlike `internal_details`.
