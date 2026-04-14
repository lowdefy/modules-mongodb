# Task 10: Refactor user-admin APIs to Core + Injection Pattern

## Context

`modules/user-admin/api/invite-user.yaml` and `modules/user-admin/api/update-user.yaml` both hardcode only `profile.title`, `profile.given_name`, and `profile.family_name` in their `$set` operations. Extended profile fields (work_phone, department, etc.) are NOT saved even if the consumer provides a form that collects them. This is the "user-admin API gap" identified in the design.

After this task, both APIs will include `_module.var: components.profile_set_fields` injection so that any extended fields provided by the consumer are saved.

Both APIs already use `_object.assign` inside their `$set` operations and already have `request_stages.invite_user` / `request_stages.update_user` injection points. The profile set_fields injection is a new, separate injection point.

Note: user-admin APIs use `_payload: user.profile.*` (not `contact.profile.*`). The shared `set_fields.yaml` uses `_payload: contact.profile.*`. This means the shared file won't work directly. The consumer app task (task 12) will need to provide user-admin-specific set_fields.

## Task

### `modules/user-admin/api/invite-user.yaml`

In the `invite` step's `$set._object.assign` array, add the conditional title and profile_set_fields injection. The current `_object.assign` has entries for: core fields, app-specific fields (disabled, roles, invite.open, app_attributes), and request_stages injection.

1. **Make title conditional** on `_module.var: show_title`:

Replace the hardcoded:

```yaml
profile.title:
  _payload: user.profile.title
```

With a `_build.if` entry in the `_object.assign` array:

```yaml
- _build.if:
    test:
      _module.var: show_title
    then:
      profile.title:
        _payload: user.profile.title
    else: {}
```

2. **Add profile_set_fields injection** as a new entry in `_object.assign`:

```yaml
- _module.var:
    key: components.profile_set_fields
    default: {}
```

The updated `_object.assign` array becomes:

```yaml
_object.assign:
  # Core fields (profile.name, profile.picture, profile.given_name, profile.family_name, email, etc.)
  - _id: ...
    email: ...
    lowercase_email: ...
    global_attributes: ...
    profile.name: ...
    profile.picture: ...
    profile.given_name: ...
    profile.family_name: ...
    updated: ...
    created: ...
  # Title (conditional)
  - _build.if:
      test:
        _module.var: show_title
      then:
        profile.title:
          _payload: user.profile.title
      else: {}
  # Extended profile fields (injected by consumer)
  - _module.var:
      key: components.profile_set_fields
      default: {}
  # App-specific fields (existing)
  - _object.defineProperty: ... # apps.*.disabled
  - _object.defineProperty: ... # apps.*.roles
  - _object.defineProperty: ... # apps.*.invite.open
  - _object.defineProperty: ... # apps.*.app_attributes
```

3. **Remove** the hardcoded `profile.title` from the core fields object (it's now conditional).

### `modules/user-admin/api/update-user.yaml`

Same pattern as invite-user:

1. **Make title conditional** — remove `profile.title` from the first `_object.assign` entry, add as `_build.if`
2. **Add `_module.var: components.profile_set_fields`** injection
3. Keep everything else unchanged

## Acceptance Criteria

- Both APIs have `profile.title` conditional on `_module.var: show_title`
- Both APIs include `_module.var: components.profile_set_fields` with default `{}`
- Core fields (profile.name, profile.picture, profile.given_name, profile.family_name) unchanged
- App-specific fields (disabled, roles, invite.open, app_attributes) unchanged
- Event logging sections unchanged
- `request_stages.invite_user` and `request_stages.update_user` injection points preserved
- Notification dispatch in invite-user unchanged

## Files

- `modules/user-admin/api/invite-user.yaml` — modify — add conditional title and profile_set_fields injection
- `modules/user-admin/api/update-user.yaml` — modify — add conditional title and profile_set_fields injection

## Notes

- user-admin APIs use `_payload: user.profile.*` while the shared `set_fields.yaml` uses `_payload: contact.profile.*`. The consumer app (task 12) must provide user-admin-specific set_fields with `user.profile.*` payload paths.
