# Consistent Profile Fields

## Problem

The user-account, user-admin, and contacts modules each define their own profile fields independently. The same fields (title, given_name, family_name, phones, department, job_title, birthday) are hardcoded in three places: form components, view components, and API save logic. This leads to:

- **Inconsistency** — field labels, layouts, and options can drift between modules.
- **Rigidity** — adding or removing a profile field requires editing every module.
- **Duplication** — the same field definitions and API save logic exist in multiple files.

All three modules operate on the same underlying `user-contacts` collection, so the profile schema must be consistent.

## Current State

### Profile fields per module

| Field            | user-account |  contacts  | user-admin |
| ---------------- | :----------: | :--------: | :--------: |
| title            |  form + API  | form + API |  API only  |
| given_name       |  form + API  | form + API |  API only  |
| family_name      |  form + API  | form + API |  API only  |
| email            |  form + API  | form + API |  API only  |
| work_phone       |  form + API  | form + API |     -      |
| mobile_phone     |  form + API  | form + API |     -      |
| department       |  form + API  | form + API |     -      |
| job_title        |  form + API  | form + API |     -      |
| birthday         |  form + API  | form + API |     -      |
| company_name     |   API only   |     -      |     -      |
| internal_details |      -       | form + API |     -      |
| company_ids      |      -       | form + API |     -      |

### How each module handles profile fields

**user-account** — Hardcoded `form_profile.yaml` with all fields. API save logic in `profile-set-fields.yaml`. The `components.form_profile` and `components.view_profile` vars allow full replacement, but no partial injection.

**contacts** — Hardcoded `form_contact.yaml` with profile fields + contacts-specific fields (notes, companies). API save logic hardcoded in `create-contact.yaml` and `update-contact.yaml`. Has a `components.form_attributes` injection point, but only for fields _after_ the profile section.

**user-admin** — No built-in profile form. Pages use `_module.var: components.form_profile` with a default of an empty Box. The invite/update APIs hardcode saving only `title`, `given_name`, and `family_name`. Extended profile fields (phones, department, etc.) are not saved even if the consumer provides a form that collects them.

### Key inconsistencies

1. **user-admin API gap** — If the consumer provides a form_profile that includes work_phone, the API doesn't save it. The form and API are decoupled.
2. **company_name** — user-account's API saves `profile.company_name` but the form doesn't collect it (orphaned field).
3. **Title options** — Both modules hardcode `[Mr, Ms, Mrs, Dr, Prof]` independently.
4. **Avatar URL** — contacts uses a slightly different DiceBear URL format than user-account and user-admin (missing `backgroundType=gradientLinear&scale=75`).
5. **Email display** — user-account uses a disabled TextInput to show the non-editable email. This is an accessibility anti-pattern (low contrast, no copy-paste, not in tab order, ambiguous why it's disabled).

## Solution

### Core principle

Each module has a minimal built-in profile form (given_name, family_name, email) with injection points for additional fields. The consumer app defines additional fields in a shared file and passes them to every module.

### Shared files live in `modules/shared/`

The `modules/shared/` directory is the established location for cross-module shared config (layout components, enum aggregations). Profile field definitions go here:

```
modules/shared/
  profile/
    form_fields.yaml        # Form blocks for extended profile fields
    set_fields.yaml          # API $set operations for extended fields
    view_fields.yaml         # Description items for view display
```

Modules reference these via relative path: `_ref: ../shared/profile/form_fields.yaml`. Consumer apps pass them as module vars.

### Built-in fields (always present)

- `given_name` — TextInput, required
- `family_name` — TextInput, required
- `email` — displayed as plain text (see [Email Display](#email-display))

### Title field — controlled by flag

A `show_title` module var (default: `false`) toggles the title Selector. When enabled, the title field appears before given_name and is saved by the API.

```yaml
# Module var declaration
vars:
  show_title:
    type: boolean
    default: false
    description: Show the title/honorific field (Mr, Ms, Dr, etc.)
```

Why a flag instead of putting title in the extended fields var? Title has layout implications — it shares a row with given_name (span 3 + span 9). Injected fields are appended sequentially and can't control sibling layout. A flag keeps the built-in layout clean.

### Extended fields — via module var

A `components.profile_fields` var injects additional form field blocks after the core fields. A matching `components.profile_set_fields` var provides the API save operations. A `components.profile_view_fields` var provides view/detail display items.

```yaml
# Module var declaration (all three modules)
vars:
  components:
    description: >
      profile_fields: Additional form field blocks appended after core profile fields.
      profile_set_fields: API $set fields for additional profile data.
      profile_view_fields: Description items for profile detail/view display.
```

### Consumer app — shared file references

The consumer app references the shared files from `modules/shared/profile/` in each module's vars. **Note:** user-admin uses `user.*` state/payload paths (not `contact.*`), so it needs its own profile field files with `user.profile.*` IDs and `_payload: user.profile.*` paths. The shared files only work directly for user-account and contacts.

```yaml
# apps/demo/modules.yaml
- id: user-account
  source: "file:../../modules/user-account"
  vars:
    app_name: demo
    show_title: true
    components:
      profile_fields:
        _ref: ../../modules/shared/profile/form_fields.yaml
      profile_set_fields:
        _ref: ../../modules/shared/profile/set_fields.yaml
      profile_view_fields:
        _ref: ../../modules/shared/profile/view_fields.yaml

- id: user-admin
  source: "file:../../modules/user-admin"
  vars:
    app_name: demo
    show_title: true
    roles:
      _ref: roles.yaml
    components:
      profile_fields:
        _ref: modules/user-admin/profile_form_fields.yaml
      profile_set_fields:
        _ref: modules/user-admin/profile_set_fields.yaml

- id: contacts
  source: "file:../../modules/contacts"
  vars:
    app_name: demo
    show_title: true
    components:
      profile_fields:
        _ref: ../../modules/shared/profile/form_fields.yaml
      profile_set_fields:
        _ref: ../../modules/shared/profile/set_fields.yaml
      profile_view_fields:
        _ref: ../../modules/shared/profile/view_fields.yaml
```

### Shared file contents

**modules/shared/profile/form_fields.yaml:**

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

**modules/shared/profile/set_fields.yaml:**

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

**modules/shared/profile/view_fields.yaml:**

Pure data — label + key pairs. Each module maps these into description items using `_array.map` with its own data source.

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

### Email Display

The disabled TextInput pattern for email is an accessibility anti-pattern: low contrast text, removed from tab order, no copy-paste, and ambiguous about why it's disabled.

**Approach: Plain text with label, matching Ant Design form layout.**

Each module displays email as static, selectable text styled to sit within the form's visual rhythm — not an input at all. This makes it immediately clear the value is informational, keeps it fully legible and copyable, and works for screen readers.

In Lowdefy, this means using a `Descriptions` component with a single item, or an `Html` block styled to match form label/value spacing. The exact block type depends on what fits each module's context:

```yaml
# Option A: Single-item Descriptions (clean, consistent with view pages)
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

# Option B: Html block matching Ant Design form item styling
- id: email_display
  type: Html
  properties:
    html:
      _nunjucks:
        template: |
          <div class="ant-form-item" style="margin-bottom: 8px;">
            <div class="ant-form-item-label"><label>Email</label></div>
            <div class="ant-form-item-control">
              <span style="line-height: 32px;">{{ email }}</span>
            </div>
          </div>
        on:
          email:
            _state: contact.email
```

**Per-module email behavior:**

| Context                       | Email behavior                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| user-account (edit-profile)   | Plain text display. User can't change their own email.                                                                                                |
| user-account (create-profile) | Plain text display. Email comes from auth, already set.                                                                                               |
| contacts (contact-new)        | Editable TextInput with validation. Email is set on creation.                                                                                         |
| contacts (contact-edit)       | Plain text display. Email is immutable after creation.                                                                                                |
| user-admin (users-invite)     | Not shown in profile section — email is set in a prior step (check-invite-email page). Displayed as a separate view component above the profile form. |
| user-admin (users-edit)       | Plain text display. Email shown as separate view component above profile form.                                                                        |

**Decision: Email is NOT part of the shared profile form fields.** Each module handles email display in its own context because the behavior varies too much (editable on create, read-only on edit, absent from the form in user-admin). The core built-in form contains only given_name and family_name. Email display is handled per-module outside the shared profile fields section.

This is actually cleaner — it separates identity (email) from profile (name, phone, department, etc.). The profile section is purely about editable personal details.

### Module form composition

Each module's form uses `_build.array.concat` to combine built-in fields + injected fields:

```yaml
# Pattern for all three modules' form components
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
              options: [Mr, Ms, Mrs, Dr, Prof]
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
    # Extended profile fields (injected by consumer)
    - _module.var:
        key: components.profile_fields
        default: []
```

### user-admin: built-in profile form (no full-replacement)

The user-admin module drops the `components.form_profile` full-replacement var. Instead, it gets the same built-in form as user-account and contacts — core fields always shown, `components.profile_fields` for additions.

```yaml
# users-invite.yaml / users-edit.yaml — replaces the old _module.var override
- _ref: ../components/form_profile.yaml
```

Where `form_profile.yaml` is a new file in user-admin following the standard core + injection pattern. All three modules now work identically: standard fields are always present, consumers can only add fields.

### Module API composition

Each module's API save logic merges core fields + injected set_fields:

```yaml
# Pattern for API $set operations
$set:
  _build.object.assign:
    - profile.name:
      # ... computed from given_name + family_name
      profile.picture:
        # ... computed avatar URL (normalized across modules)
      profile.given_name:
        _string.trim:
          _if_none:
            - _payload: contact.profile.given_name
            - ""
      profile.family_name:
        _string.trim:
          _if_none:
            - _payload: contact.profile.family_name
            - ""
    # Title (conditional)
    - _build.if:
        test:
          _module.var: show_title
        then:
          profile.title:
            _payload: contact.profile.title
        else: {}
    # Extended profile fields (injected by consumer)
    - _module.var:
        key: components.profile_set_fields
        default: {}
    # Audit timestamp (always present)
    - updated:
        _ref:
          module: events
          component: change_stamp
```

### Module view composition

Each module maps the shared view fields into description items using `_array.map` with `_get`, providing its own data source as the `from` context. The shared `view_fields.yaml` contains pure data (label + key pairs), making it genuinely shareable.

**user-account** reads from `_user:`:

```yaml
items:
  _build.array.concat:
    - _build.if:
        test:
          _module.var: show_title
        then:
          - label: Title
            value:
              _user: profile.title
        else: []
    - - label: Name
        value:
          _user: profile.name
      - label: Email
        value:
          _user: email
    - _array.map:
        on:
          _module.var:
            key: components.profile_view_fields
            default: []
        callback:
          _function:
            label:
              __args: 0.label
            value:
              _get:
                key:
                  __args: 0.key
                from:
                  _user: true
```

**contacts** reads from `_request:`:

```yaml
items:
  _build.array.concat:
    - _build.if:
        test:
          _module.var: show_title
        then:
          - label: Title
            value:
              _request: get_contact.0.profile.title
        else: []
    - - label: Name
        value:
          _request: get_contact.0.profile.name
      - label: Email
        value:
          _request: get_contact.0.email
    - _array.map:
        on:
          _module.var:
            key: components.profile_view_fields
            default: []
        callback:
          _function:
            label:
              __args: 0.label
            value:
              _get:
                key:
                  __args: 0.key
                from:
                  _request: get_contact.0
    - - label: Notes
        value:
          _request: get_contact.0.global_attributes.internal_details
        span: 2
```

## Changes Required

### New files

| File                                              | Description                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `modules/shared/profile/form_fields.yaml`         | Shared form field blocks for extended profile fields.                |
| `modules/shared/profile/set_fields.yaml`          | Shared API $set operations for extended profile fields.              |
| `modules/shared/profile/view_fields.yaml`         | Shared view description items for extended profile fields.           |
| `modules/user-admin/components/form_profile.yaml` | New built-in profile form for user-admin (core + injection pattern). |

### user-account module

| File                           | Change                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module.lowdefy.yaml`          | Add `show_title` var. Add `components.profile_fields`, `profile_set_fields`, `profile_view_fields` to var descriptions.                                                                                                                                                                                  |
| `components/form_profile.yaml` | Replace hardcoded fields with core + `_build.array.concat` pattern. Remove work_phone, mobile_phone, department, job_title, birthday. Add `_module.var: components.profile_fields` injection. Conditional title via `_module.var: show_title`. Replace disabled email TextInput with plain text display. |
| `components/view_profile.yaml` | Replace `_object.assign` dump with structured core items + `_module.var: components.profile_view_fields` injection. Conditional title.                                                                                                                                                                   |
| `api/profile-set-fields.yaml`  | Remove hardcoded extended fields. Add `_module.var: components.profile_set_fields` merge. Conditional title. Remove orphaned `company_name`. Uses `_build.object.assign` so the result is a flat object at build time.                                                                                   |

### contacts module

| File                           | Change                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module.lowdefy.yaml`          | Add `show_title` var. Add `components.profile_fields`, `profile_set_fields`, `profile_view_fields` to var descriptions.                                                                                                                                                                                                                                   |
| `components/form_contact.yaml` | Replace hardcoded profile section with core + injection pattern. Keep contacts-specific fields (notes, companies) below. Replace disabled email with plain text on edit (email remains editable on create via `_var: email_disabled`).                                                                                                                    |
| `components/view_contact.yaml` | Replace hardcoded profile items with core + injection pattern. Keep Notes at bottom.                                                                                                                                                                                                                                                                      |
| `api/create-contact.yaml`      | Restructure from `MongoDBInsertOne` to `MongoDBUpdateOne` with `upsert: true` and `$set` aggregation pipeline stage, following the `invite-user.yaml` pattern. Use `$ifNull` for insert-only fields (`_id`, `created`). Flat dot-notation keys allow reusing shared `set_fields.yaml` directly. Preserve `request_stages.insert_contact` injection point. |
| `api/update-contact.yaml`      | Replace hardcoded profile fields with core + `_module.var: components.profile_set_fields` merge. Preserve `request_stages.update_contact` injection point.                                                                                                                                                                                                |

### user-admin module

| File                           | Change                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module.lowdefy.yaml`          | Add `show_title` var. Add `components.profile_fields`, `profile_set_fields` to var descriptions. Remove `components.form_profile` full-replacement var. |
| `components/form_profile.yaml` | New file — built-in profile form using core + injection pattern.                                                                                        |
| `pages/users-invite.yaml`      | Replace `_module.var: components.form_profile` with `_ref: ../components/form_profile.yaml`.                                                            |
| `pages/users-edit.yaml`        | Same as invite.                                                                                                                                         |
| `api/invite-user.yaml`         | Add `_module.var: components.profile_set_fields` merge to the $set operation. Conditional title.                                                        |
| `api/update-user.yaml`         | Same as invite.                                                                                                                                         |

### Consumer app (apps/demo)

| File                                        | Change                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/user-account/vars.yaml`            | Add `show_title`, `components.profile_fields/set_fields/view_fields` referencing shared files.                                                          |
| `modules/user-admin/vars.yaml`              | Add `show_title`, `components.profile_fields/set_fields` referencing shared files.                                                                      |
| Add contacts module entry in `modules.yaml` | Future/planned — the demo consumer app does not currently include the contacts module. When contacts is added, include same shared profile field refs. |

### Additional cleanup

- Normalize the DiceBear avatar URL across all modules (contacts uses a different format — missing `backgroundType=gradientLinear&scale=75`).
- Remove orphaned `profile.company_name` from user-account's `profile-set-fields.yaml`.

## Decisions

1. **Title as a flag, not an injected field.** Title shares a layout row with given_name (3+9 column split). Injected fields are appended sequentially. A flag preserves the built-in layout coupling.

2. **Shared profile files live in `modules/shared/profile/`.** This follows the established pattern — `modules/shared/` already contains cross-module layout components and enum aggregations. Modules reference via `_ref: ../shared/profile/...`.

3. **Three separate shared files (form, set, view)** rather than a single field schema. This follows existing module patterns (`_build.array.concat` for forms, `_object.assign` for APIs). A field schema that auto-generates all three would be cleaner but requires framework changes.

4. **`components.profile_set_fields` as an object merged via `_object.assign`**, not pipeline stages via `request_stages`. Object merge is simpler for flat field-to-value mappings. Pipeline stages are for complex operations (aggregation, conditional logic).

5. **Keep contacts-specific fields (notes, companies) in the contacts module.** These aren't profile fields — they're domain-specific data. The contacts form will have: core profile + injected profile fields + divider + contacts-specific fields + `form_attributes` injection.

6. **user-admin drops `components.form_profile` full-replacement var.** All three modules use the same pattern: standard fields always shown, consumers can only add fields via `components.profile_fields`. No escape hatch — consistency is the point.

7. **Email is NOT part of the shared profile fields.** Email behavior varies too much by context (editable on contact creation, read-only everywhere else, absent from user-admin form). Each module handles email display independently. Where email is non-editable, display as plain text instead of a disabled input — this is more accessible (full contrast, selectable, copyable) and clearer to users.

8. **Phone field labels normalized to "Work Number" / "Mobile Number".** user-account used these labels; contacts used "Work Phone" / "Mobile Phone". The shared file standardizes on user-account's labels. This is an intentional user-facing label change in the contacts module.

9. **View fields: shared as pure data, mapped per-module.** The shared `view_fields.yaml` contains label + key pairs (no operators). Each module uses `_array.map` with `_get` to resolve the keys against its own data source (`_user: true` for user-account, `_request: get_contact.0` for contacts). The shared file is genuinely shared — same file, all modules.

## Non-Goals

- **Custom title options** — Not adding a var for the title option list. Hardcoded `[Mr, Ms, Mrs, Dr, Prof]` is sufficient for now.
- **Schema-driven field generation** — Not building a framework to auto-generate forms/APIs from a field schema. That's a larger abstraction change.
- **Table column consistency** — The user-admin and contacts table columns are different by design (user-admin shows roles/status; contacts shows department/job_title). This design focuses on form/view/API fields.
