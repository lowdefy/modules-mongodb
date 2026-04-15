# Task 5: Refactor contacts Form to Core + Injection Pattern

## Context

`modules/contacts/components/form_contact.yaml` uses `_build.array.concat` to assemble fields. Currently it hardcodes all profile fields in a single array, followed by a "Details" divider with department/job_title/birthday/notes, then `components.form_attributes` injection, then a "Companies" section.

After this task, the profile section will use core + injection pattern: conditional title, core fields (given_name, family_name), email (editable on create, plain text on edit via existing `_var: email_disabled`), injected extended fields. The contacts-specific fields (notes, companies) remain in the contacts module below the profile section.

The form is referenced with vars — `contact-new.yaml` uses `_ref: ../components/form_contact.yaml` directly, and `contact-edit.yaml` uses `_ref` with `vars: { email_disabled: true }`.

## Task

Rewrite the `blocks._build.array.concat` in `modules/contacts/components/form_contact.yaml`:

```yaml
id: form_contact
type: Box
blocks:
  _build.array.concat:
    # Title (conditional)
    - _build.if:
        test:
          _module.var: show_title
        then:
          - id: contact.profile.title
            type: Selector
            layout:
              span: 3
            properties:
              title: Title
              options:
                - Mr
                - Ms
                - Mrs
                - Dr
                - Prof
        else: []
    # Core fields
    - - id: contact.profile.given_name
        type: TextInput
        required: true
        layout:
          span:
            _build.if:
              test:
                _module.var: show_title
              then: 9
              else: 12
        properties:
          title: First Name
      - id: contact.profile.family_name
        type: TextInput
        required: true
        properties:
          title: Last Name
    # Email (editable on create, plain text on edit)
    - _build.if:
        test:
          _var:
            key: email_disabled
            default: false
        then:
          - id: email_display
            type: Descriptions
            properties:
              bordered: false
              column: 1
              size: small
              items:
                - label: Email
                  value:
                    _state: contact.email
        else:
          - id: contact.email
            type: TextInput
            required: true
            properties:
              title: Email
              placeholder: "name@company.com"
            validate:
              _ref: ../validate/email.yaml
    # Extended profile fields (injected by consumer)
    - _module.var:
        key: components.profile_fields
        default: []
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
    # Companies section
    - - id: divider_companies
        type: Divider
        properties:
          title: Companies
      - _ref:
          module: companies
          component: company-selector
        vars:
          label: Linked Companies
          mode: MultipleSelector
          field_id: contact.global_attributes.company_ids
```

Key changes:

1. **Make title conditional** on `_module.var: show_title` with `span: 3`
2. **Make given_name span conditional** — 9 when title shown, 12 when not
3. **Email conditional rendering** — use `_build.if` on `_var: email_disabled`. When false (create): editable TextInput with validation. When true (edit): plain text `Descriptions` display. Email is NOT part of the shared profile fields because its behavior differs by context.
4. **Add `components.profile_fields` injection** after email, before the Details divider
5. **Remove** hardcoded work_phone, mobile_phone, department, job_title, birthday from the main array
6. **Keep** the Details divider with Notes, form_attributes injection, and Companies section unchanged
7. **Remove** the old title field from its non-conditional position

## Acceptance Criteria

- Title conditional on `_module.var: show_title`
- `given_name` span adjusts based on `show_title` (9 vs 12)
- Email uses `_build.if` on `_var: email_disabled`: plain text `Descriptions` on edit, editable TextInput on create
- `components.profile_fields` injected after core fields, before Details divider
- No hardcoded work_phone, mobile_phone, department, job_title, birthday
- Notes (`contact.global_attributes.internal_details`) stays in contacts section
- `components.form_attributes` injection point preserved
- Companies section unchanged
- `contact-new.yaml` and `contact-edit.yaml` references still work (no changes to those files needed)

## Files

- `modules/contacts/components/form_contact.yaml` — modify — replace hardcoded profile fields with core + injection pattern
