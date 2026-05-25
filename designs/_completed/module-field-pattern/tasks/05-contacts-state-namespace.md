# Task 5: Flatten contacts State Namespace

## Context

Task 1 created the shared `modules/shared/profile/form_core.yaml` with flat `profile.*` field IDs. The contacts module currently wraps all state under a `contact` root: `contact.profile.*`, `contact.email`, `contact.global_attributes.*`, `contact.updated.*`, `contact._id`.

This task flattens the state root so all data sits at the page-level state: `profile.*`, `email`, `global_attributes.*`, `updated.*`, `_id`.

## Task

### 1. Update `components/form_contact.yaml`

Replace the inline core fields with a `_ref` to `form_core.yaml`. Update all `contact.*` state refs.

**Current state paths to change:**

- `contact.profile.title` → `profile.title`
- `contact.profile.given_name` → `profile.given_name`
- `contact.profile.family_name` → `profile.family_name`
- `contact.email` → `email`

**New structure:**

```yaml
id: form_contact
type: Box
blocks:
  _build.array.concat:
    # Avatar preview
    - - id: avatar_preview
        type: Avatar
        style:
          textAlign: center
          marginBottom: 16
        properties:
          src:
            _js:
              _ref:
                path: ../shared/profile/generate-avatar-svg.js.njk
                vars:
                  prefix: profile
          size: 100
    # Core profile fields (shared)
    - _ref:
        path: ../shared/profile/form_core.yaml
        vars:
          show_title:
            _module.var: fields.show_title
    # Email
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
                    _state: email
        else:
          - id: email
            type: TextInput
            required: true
            properties:
              title: Email
              placeholder: name@company.com
            validate:
              _ref: validate/email.yaml
    # Consumer extended fields
    - _module.var: fields.profile
    # Attributes section (conditional)
    - _build.if:
        test:
          _build.ne:
            - _module.var: fields.global_attributes
            - null
        then:
          _build.array.concat:
            - - id: divider_details
                type: Divider
                properties:
                  title: Details
            - _module.var: fields.global_attributes
        else: []
```

Key changes:

- Avatar SVG prefix: `contact.profile` → `profile`
- Core fields replaced with `_ref` to `form_core.yaml`
- Email input ID: `contact.email` → `email`
- `_state: contact.email` → `_state: email`
- `components.profile_fields` → `fields.profile`
- `components.form_attributes` → `fields.global_attributes` (conditional section)
- `show_title` → `fields.show_title`

### 2. Flatten SetState on pages

**contact-edit.yaml** — Change:

```yaml
- id: set_state
  type: SetState
  params:
    contact:
      _request: get_contact.0
```

To:

```yaml
- id: set_state
  type: SetState
  params:
    profile:
      _request: get_contact.0.profile
    global_attributes:
      _request: get_contact.0.global_attributes
    email:
      _request: get_contact.0.email
    updated:
      _request: get_contact.0.updated
    _id:
      _request: get_contact.0._id
```

**contact-new.yaml** — Update `init_avatar_color`:

```yaml
- id: init_avatar_color
  type: SetState
  params:
    profile.avatar_color:
      _get:
        from:
          _module.var: avatar_colors
        key: ...
```

(was `contact.profile.avatar_color`)

### 3. Update action sequences in pages

**contact-edit.yaml onClick:**

- `contact.profile.picture` → `profile.picture` in generate_avatar SetState
- `prefix: contact.profile` → `prefix: profile` in avatar SVG ref vars
- API payload: `contact: _state: contact` → flat keys:
  ```yaml
  payload:
    _id:
      _state: _id
    profile:
      _state: profile
    global_attributes:
      _state: global_attributes
    updated:
      _state: updated
  ```

**contact-new.yaml onClick:**

- Same avatar changes
- API payload: `contact: _state: contact` → flat keys:
  ```yaml
  payload:
    _id:
      _uuid: true
    email:
      _state: email
    profile:
      _state: profile
    global_attributes:
      _state: global_attributes
  ```

### 4. Update view component

**`components/view_contact.yaml`:**

- `_request: get_contact.0.profile.picture` — this reads from the request, not state, so it stays as-is
- `_request: get_contact.0.profile.name` — same, stays
- `_request: get_contact.0.email` — same, stays
- `_request: get_contact.0.profile` — same, stays
- `_request: get_contact.0.global_attributes` — same, stays
- These are read from the request object, not state, so they don't change

The view_contact component reads data via `_request` not `_state`, so most refs don't change. But check for any `_state: contact.*` refs and update them.

### 5. Update contact-detail.yaml page

This page doesn't use `_state: contact.*` (it uses `_request: get_contact.0.*` directly). Verify and leave unchanged.

## Acceptance Criteria

- No `contact.profile.*`, `contact.email`, `contact.global_attributes.*` state paths remain in contacts module files
- `form_contact.yaml` uses `_ref` to `../shared/profile/form_core.yaml`
- All SetState actions use flat field names
- Avatar generation uses `prefix: profile`
- API payloads send flat field keys (not nested under `contact`)
- Var references use new names (`fields.profile`, `fields.global_attributes`, `fields.show_title`)

## Files

- `modules/contacts/components/form_contact.yaml` — **modify** — replace inline fields with shared ref, flatten state paths
- `modules/contacts/pages/contact-edit.yaml` — **modify** — flatten SetState, update actions, update avatar prefix
- `modules/contacts/pages/contact-new.yaml` — **modify** — flatten SetState, update actions, update avatar prefix
- `modules/contacts/components/view_contact.yaml` — **modify** — update any `_state: contact.*` refs (if any)

## Notes

- The contacts module also has `contact.updated.timestamp` used as a conflict detection filter in the API. The payload key changes from `contact.updated.timestamp` to `updated.timestamp`.
- The `contact-selector.yaml` component may have `contact.*` refs — check and leave alone if it reads from requests rather than state.
- The `form_contact.yaml` previously used `_module.var: components.form_attributes` — this should now use `_module.var: fields.global_attributes` since global_attributes fields are what the consumer provides here.
