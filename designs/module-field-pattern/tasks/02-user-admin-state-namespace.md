# Task 2: Flatten user-admin State Namespace

## Context

Task 1 created the shared `modules/shared/profile/form_core.yaml` with flat `profile.*` field IDs. The user-admin module currently wraps all state under a `user` root: `user.profile.*`, `user.email`, `user.roles`, `user.disabled`, `user.invite.*`, `user.global_attributes`, `user.app_attributes`, `user.is_user`, `user.sign_up`.

This task flattens the state root so all data sits at the page-level state: `profile.*`, `email`, `roles`, `disabled`, `invite.*`, `global_attributes`, `app_attributes`, `is_user`, `sign_up`.

## Task

### 1. Update `form_profile.yaml`

Replace the inline core fields with a `_ref` to the shared `form_core.yaml`. Keep the consumer extension point.

**Current** (`modules/user-admin/components/form_profile.yaml`):

```yaml
id: form_profile
type: Box
layout:
  gap: 8
blocks:
  _build.array.concat:
    - _build.if:  # title
        ...
    - - id: user.profile.given_name
        ...
      - id: user.profile.family_name
        ...
    - _module.var: components.profile_fields
```

**New:**

```yaml
id: form_profile
type: Box
layout:
  gap: 8
blocks:
  _build.array.concat:
    - _ref:
        path: ../shared/profile/form_core.yaml
        vars:
          show_title:
            _module.var: fields.show_title
    - _module.var: fields.profile
```

Note: The var references change from `components.profile_fields` to `fields.profile` and `show_title` to `fields.show_title` (these will be wired in the manifest task, but the code should use the new names now).

### 2. Update form_global_attributes.yaml and form_app_attributes.yaml

Change `_module.var: components.global_attributes_fields` → `_module.var: fields.global_attributes` and `_module.var: components.app_attributes_fields` → `_module.var: fields.app_attributes` throughout both files. The block IDs inside these files don't have `user.*` prefix (they already use `user.global_attributes.*` which matches the consumer field IDs), but the var references need updating.

### 3. Flatten SetState on pages

**users-edit.yaml** — Change the `set_user` action from:

```yaml
- id: set_user
  type: SetState
  params:
    user:
      _request: get_user.0
    disable_save: false
```

To:

```yaml
- id: set_state
  type: SetState
  params:
    profile:
      _request: get_user.0.profile
    global_attributes:
      _request: get_user.0.global_attributes
    app_attributes:
      _request: get_user.0.app_attributes
    email:
      _request: get_user.0.email
    roles:
      _request: get_user.0.roles
    disabled:
      _request: get_user.0.disabled
    invite:
      _request: get_user.0.invite
    is_user:
      _request: get_user.0.is_user
    sign_up:
      _get:
        key:
          _string.concat:
            - "apps."
            - _module.var: app_name
            - ".sign_up"
        from:
          _request: get_user.0
    _id:
      _request: get_user.0._id
    disable_save: false
```

**users-invite.yaml** — Same flattening for the `set_user` action. The existing invite page sets `user:` as a whole object. Flatten to individual fields. Also update `init_avatar_color` from `user.profile.avatar_color` to `profile.avatar_color`.

### 4. Update all `_state: user.*` references

Throughout the edit and invite pages, update state references:

- `_state: user.profile.picture` → `_state: profile.picture`
- `_state: user.profile.name` → `_state: profile.name`
- `_state: user.email` → `_state: email`
- `_state: user.invite.open` → `_state: invite.open`
- `_state: user.is_user` → `_state: is_user`
- `_state: user.sign_up` → `_state: sign_up`
- `_state: user._id` → `_state: _id`
- `_state: user.profile.avatar_color` → `_state: profile.avatar_color`

This affects:

- `modules/user-admin/pages/users-edit.yaml` — identity header, signed_up, resend_invite visibility, resend payload
- `modules/user-admin/pages/users-invite.yaml` — avatar color init
- `modules/user-admin/components/view_user_avatar_preview.yaml` (if it exists) — avatar references

### 5. Update action files

**`actions/save_user.yaml`:**

- Change `user.profile.picture` → `profile.picture` in the generate_avatar SetState
- Change `prefix: user.profile` → `prefix: profile` in the avatar SVG ref vars
- Change the payload from `user: _state: user` to individual flat keys:
  ```yaml
  payload:
    _id:
      _state: _id
    profile:
      _state: profile
    global_attributes:
      _state: global_attributes
    app_attributes:
      _state: app_attributes
    email:
      _state: email
    roles:
      _state: roles
    disabled:
      _state: disabled
    invite:
      _state: invite
  ```

**`actions/invite_user.yaml`:**

- Same avatar changes
- Same payload flattening

### 6. Update users-view.yaml

The view page sets state with `user: _request: get_user.0`. Flatten to individual fields the same way as the edit page. Update `_state: user.*` references throughout.

## Acceptance Criteria

- No `user.profile.*`, `user.email`, `user.roles` etc. state paths remain in user-admin module files
- `form_profile.yaml` uses `_ref` to `../shared/profile/form_core.yaml`
- All SetState actions on edit, invite, and view pages use flat field names
- All `_state` references use flat paths (`profile.*`, `email`, `roles`, etc.)
- Avatar generation uses `prefix: profile`
- API payloads send flat field keys (not nested under `user`)
- Var references use the new names (`fields.profile`, `fields.global_attributes`, `fields.app_attributes`)

## Files

- `modules/user-admin/components/form_profile.yaml` — **modify** — replace inline fields with `_ref` to shared core, update var reference
- `modules/user-admin/components/form_global_attributes.yaml` — **modify** — update var reference to `fields.global_attributes`
- `modules/user-admin/components/form_app_attributes.yaml` — **modify** — update var reference to `fields.app_attributes`
- `modules/user-admin/pages/users-edit.yaml` — **modify** — flatten SetState, update all `_state: user.*` refs
- `modules/user-admin/pages/users-invite.yaml` — **modify** — flatten SetState, update all `_state: user.*` refs
- `modules/user-admin/pages/users-view.yaml` — **modify** — flatten SetState, update all `_state: user.*` refs
- `modules/user-admin/actions/save_user.yaml` — **modify** — flatten payload, update avatar prefix
- `modules/user-admin/actions/invite_user.yaml` — **modify** — flatten payload, update avatar prefix
- `modules/user-admin/components/view_user.yaml` — **modify** — update `_state: user.*` refs to flat paths

## Notes

- The `view_user_avatar_preview.yaml` component (referenced from invite page) may also have `user.profile.*` state refs — check and update.
- The `view_invite_link.yaml` and `view_email.yaml` components may reference `user.email` or `user.invite.*` — check and update.
- The `form_access_edit.yaml` and `form_access_invite.yaml` components reference `user.roles`, `user.disabled`, `user.invite.open` — update to flat paths.
- After this task, the API endpoints still expect the old `_payload: user.*` structure. They will be updated in Task 3.
