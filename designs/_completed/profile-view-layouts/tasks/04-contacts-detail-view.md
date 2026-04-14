# Task 4: Update Contacts Detail View

## Context

After tasks 1 and 2, the identity header component and shared attribute configs exist.

The contacts detail view (`modules/contacts/components/view_contact.yaml`) currently has:

- A `Descriptions` block for email (no avatar — contacts detail has never shown an avatar)
- A `DataView` for profile fields
- A conditional `Descriptions` block for `global_attributes.internal_details` (hardcoded "Notes")

Data comes from `_request: get_contact.0` which returns the full contact document including `profile`, `email`, `global_attributes`, and `apps.{app}.app_attributes`.

The contacts detail page (`modules/contacts/pages/contact-detail.yaml`) uses a two-column layout with a main column (span 14) and sidebar (span 10). The main column contains a Card with the view component. The sidebar has company and event tiles. This page structure stays the same — only the view component content changes.

There is currently no `apps/demo/modules/contacts/vars.yaml` — the contacts module uses its defaults. This task creates it.

## Task

### 1. Rewrite `modules/contacts/components/view_contact.yaml`

Replace the entire content with the new layout:

```yaml
id: contact_details
type: Box
blocks:
  _build.array.concat:
    # Identity header
    - - _ref:
          path: modules/shared/layout/identity-header.yaml
          vars:
            avatar_src:
              _request: get_contact.0.profile.picture
            name:
              _request: get_contact.0.profile.name
            email:
              _request: get_contact.0.email
    # Profile DataDescriptions
    - - id: profile_data
        type: DataDescriptions
        properties:
          bordered: true
          column: 1
          size: small
          title: Profile
          data:
            _object.assign:
              - _request: get_contact.0.profile
              - profile_created: null
              - picture: null
              - name: null
          formConfig:
            _build.if:
              test:
                _build.ne:
                  - _module.var:
                      key: components.profile_view_config
                      default: null
                  - null
              then:
                _build.array.concat:
                  - _build.if:
                      test:
                        _module.var: show_title
                      then:
                        - key: title
                          title: Title
                      else: []
                  - - key: given_name
                      title: First Name
                    - key: family_name
                      title: Last Name
                  - _module.var:
                      key: components.profile_view_config
                      default: []
              else: null
    # Attributes DataDescriptions (optional)
    - - id: attributes_data
        type: DataDescriptions
        visible:
          _build.ne:
            - _module.var:
                key: components.attributes_view_config
                default: null
            - null
        properties:
          bordered: true
          column: 1
          size: small
          title: Attributes
          data:
            _object.assign:
              - _if_none:
                  - _request: get_contact.0.global_attributes
                  - {}
              - _if_none:
                  - _get:
                      key:
                        _string.concat:
                          - "apps."
                          - _module.var: app_name
                          - ".app_attributes"
                      from:
                        _if_none:
                          - _request: get_contact.0
                          - {}
                  - {}
          formConfig:
            _module.var:
              key: components.attributes_view_config
              default: []
    # Extra content slot
    - _module.var:
        key: components.view_extra
        default: []
```

Key changes from current file:

- Added: identity header with avatar (contacts finally gets an avatar on the detail page)
- Removed: standalone `Descriptions` email block — email moves into the identity header
- Changed: `DataView` → `DataDescriptions` with `bordered: true`, `column: 1`, `size: small`, `title: Profile`
- **Removed:** hardcoded `notes_display` Descriptions block for `global_attributes.internal_details` — this is now a consumer-defined attribute in the optional attributes section. Consumers include it in `attributes_view_config` (e.g., `{key: "internal_details", title: "Notes", component: "text_area"}`). The `component: text_area` hint forces `longText` rendering with `span: "filled"` regardless of content length.
- Added: optional attributes DataDescriptions section
- Added: `components.view_extra` injection point
- No `extra` on the identity header for contacts — contacts don't have sign-up data
- The `formConfig` logic is identical to the current DataView pattern

### 2. Create `apps/demo/modules/contacts/vars.yaml`

This file does not currently exist. Create it with the attribute config references:

```yaml
app_name:
  _ref:
    path: app_config.yaml
    key: app_name
show_title: true
components:
  profile_fields:
    _ref: modules/shared/profile/form_fields.yaml
  profile_set_fields:
    _ref: modules/shared/profile/set_fields.yaml
  profile_view_config:
    _ref: modules/shared/profile/view_config.yaml
  attributes_view_config:
    _ref: modules/shared/profile/attributes_view_config.yaml
```

Check the existing app config pattern from `apps/demo/modules/user-account/vars.yaml` for the correct `app_name` reference and `show_title` value. If contacts previously received these via a different mechanism (e.g., the module's own defaults or top-level app config), mirror that pattern.

**Important:** Check `apps/demo/lowdefy.yaml` or the app's module configuration to see how contacts module vars are currently provided. If they're inline in the app config rather than a separate vars file, add the `attributes_view_config` there instead. The goal is to provide `components.attributes_view_config` to the contacts module.

### 3. Update `modules/contacts/module.lowdefy.yaml`

Update the `components` var description to include the new vars:

```yaml
components:
  description: "Overrides: detail_fields, form_fields, form_attributes, profile_fields, profile_set_fields, profile_view_config, attributes_view_config, view_extra, table, filters, main_tiles, sidebar_tiles, download_columns"
```

## Acceptance Criteria

- Contacts detail view shows identity header with avatar, name, and email in a horizontal row
- Email Descriptions block is removed — email is in the header
- Profile fields render in a bordered DataDescriptions table with "Profile" title
- Hardcoded notes section (`notes_display`) is removed
- `internal_details` appears via the attributes section when `attributes_view_config` is provided (which the demo consumer does provide)
- Attributes section merges `global_attributes` and app attributes into one DataDescriptions block
- `components.view_extra` injection point renders consumer blocks after attributes
- Existing sidebar tiles (companies, events) are unaffected
- Lowdefy build succeeds with no errors

## Files

- `modules/contacts/components/view_contact.yaml` — **modify** — full rewrite with identity header + DataDescriptions + attributes + view_extra
- `apps/demo/modules/contacts/vars.yaml` — **create** — consumer vars with attribute config refs
- `modules/contacts/module.lowdefy.yaml` — **modify** — update components var description
