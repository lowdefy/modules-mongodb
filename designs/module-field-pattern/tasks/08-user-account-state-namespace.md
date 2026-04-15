# Task 8: Flatten user-account State Namespace

## Context

Task 1 created the shared `modules/shared/profile/form_core.yaml`. The user-account module currently uses the `contact` state root: `contact.profile.*`, `contact.email`. This is inconsistent with user-admin (which uses `user.*`) but both need to flatten to the same result: `profile.*`, `email`.

The user-account module is simpler than user-admin and contacts — it only handles profile editing for the current user. No global_attributes or app_attributes in the form.

## Task

### 1. Update `components/form_profile.yaml`

Replace the inline core fields with a `_ref` to `form_core.yaml`. Update all state refs.

**Current state paths to change:**

- `contact.profile.title` → `profile.title`
- `contact.profile.given_name` → `profile.given_name`
- `contact.profile.family_name` → `profile.family_name`
- `contact.email` → `email`
- `contact.profile.avatar_color` → `profile.avatar_color`

**New structure:**

```yaml
id: form_profile
type: Box
layout:
  gap: 8
style:
  margin: auto
blocks:
  _build.array.concat:
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
      - id: shuffle_color
        type: Button
        style:
          textAlign: center
          marginBottom: 16
        properties:
          icon: AiOutlineSync
          shape: round
          variant: outlined
          title: Change color
        events:
          onClick:
            - id: next_color
              type: SetState
              params:
                profile.avatar_color:
                  _get:
                    from:
                      _module.var: avatar_colors
                    key:
                      _math.floor:
                        _product:
                          - _math.random: true
                          - _array.length:
                              _module.var: avatar_colors
    # Core profile fields (shared)
    - _ref:
        path: ../shared/profile/form_core.yaml
        vars:
          show_title:
            _module.var: fields.show_title
    # Email (read-only display for user-account)
    - - id: email_display
        type: Descriptions
        properties:
          bordered: false
          column: 1
          size: small
          items:
            - label: Email
              value:
                _state: email
    # Consumer extended fields
    - _module.var: fields.profile
```

### 2. Flatten SetState on pages

**edit-profile.yaml** — Change:

```yaml
- id: init
  type: SetState
  params:
    contact.profile:
      _user: profile
    contact.email:
      _user: email
```

To:

```yaml
- id: init
  type: SetState
  params:
    profile:
      _user: profile
    email:
      _user: email
```

**create-profile.yaml** — Same change, plus update the birthday handling and avatar color init:

```yaml
- id: init
  type: SetState
  params:
    profile:
      _user: profile
    email:
      _user: email
    profile.birthday:
      _if:
        test:
          _ne:
            - _user: profile.birthday
            - null
        then:
          _date:
            _if_none:
              - _user: profile.birthday
              - 2099-01-01
        else: null
```

Avatar color init:

```yaml
- id: init_avatar_color
  type: SetState
  params:
    profile.avatar_color:
      _if_none:
        - _state: profile.avatar_color
        - ...random color...
```

(was `contact.profile.avatar_color`)

### 3. Update action sequences in pages

**edit-profile.yaml onClick:**

- `contact.profile.picture` → `profile.picture`
- `prefix: contact.profile` → `prefix: profile`
- Payload: `contact: _state: contact` → flat keys:
  ```yaml
  payload:
    profile:
      _state: profile
  ```

**create-profile.yaml onClick:**

- Same avatar changes
- Validate regex: `^contact\.` → `^profile\.` (or remove regex filter entirely since flat namespace means all fields need validation)
- Payload: `contact: _state: contact` → flat keys:
  ```yaml
  payload:
    profile:
      _state: profile
  ```

### 4. Update view component

**`components/view_profile.yaml`:**

- This component uses `_user:` context, not `_state:`. The `_user: profile.*` and `_user: email` references stay as-is — they read from the auth session, not page state.
- Update var references: `components.profile_view_config` → this will be handled by SmartDescriptions later (Task 12). For now, keep the DataDescriptions pattern but update `_module.var: show_title` → `_module.var: fields.show_title`.
- `_module.var: components.profile_view_config` → keep for now (view page update is Task 12)
- `_module.var: components.attributes_view_config` → keep for now
- `_module.var: components.view_extra` → keep

## Acceptance Criteria

- No `contact.profile.*` or `contact.email` state paths remain in user-account module files
- `form_profile.yaml` uses `_ref` to `../shared/profile/form_core.yaml`
- All SetState actions use flat field names (`profile`, `email`, not `contact.profile`, `contact.email`)
- Avatar generation uses `prefix: profile`
- API payloads send `profile` (not `contact`)
- Var references use new names where applicable (`fields.profile`, `fields.show_title`)

## Files

- `modules/user-account/components/form_profile.yaml` — **modify** — replace inline fields, flatten state paths
- `modules/user-account/pages/edit-profile.yaml` — **modify** — flatten SetState, update actions
- `modules/user-account/pages/create-profile.yaml` — **modify** — flatten SetState, update actions, update validate regex
- `modules/user-account/components/view_profile.yaml` — **modify** — update `show_title` var reference

## Notes

- The user-account profile page (`pages/profile.yaml`) reads from `_user:` context and `_request:`, not `_state:`, so it doesn't need state namespace changes.
- The `create-profile.yaml` has a Validate action with `regex: ^contact\.` — this must change to match the new namespace. Consider `^profile\.` or removing the regex entirely.
