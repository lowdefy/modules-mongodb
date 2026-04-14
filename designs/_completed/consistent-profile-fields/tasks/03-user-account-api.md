# Task 3: Refactor user-account API to Core + Injection Pattern

## Context

`modules/user-account/api/profile-set-fields.yaml` is a YAML object (not a full API file) that defines `$set` field mappings. It's referenced by both `create-profile.yaml` and `update-profile.yaml` via `_ref: profile-set-fields.yaml`. The current file hardcodes: profile.name, profile.picture, profile.title, profile.given_name, profile.family_name, profile.work_phone, profile.mobile_phone, profile.birthday, profile.job_title, profile.department, profile.company_name, and updated.

After this task, the file will use `_object.assign` to merge core fields + conditional title + injected extended fields. The hardcoded extended fields and orphaned `company_name` are removed.

## Task

Rewrite `modules/user-account/api/profile-set-fields.yaml` to use `_build.object.assign` for field composition:

```yaml
_build.object.assign:
  # Core fields (always present)
  - profile.name:
      _string.trim:
        _string.concat:
          - _string.trim:
              _if_none:
                - _payload: contact.profile.given_name
                - ""
          - " "
          - _string.trim:
              _if_none:
                - _payload: contact.profile.family_name
                - ""
    profile.picture:
      _string.concat:
        - https://api.dicebear.com/6.x/initials/svg?backgroundType=gradientLinear&scale=75&seed=
        - _string.trim:
            _string.concat:
              - _string.trim:
                  _if_none:
                    - _payload: contact.profile.given_name
                    - ""
              - " "
              - _string.trim:
                  _if_none:
                    - _payload: contact.profile.family_name
                    - ""
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
    updated:
      _ref:
        module: events
        component: change_stamp
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
```

Key changes:

1. Wrap everything in `_build.object.assign` with three entries: core, conditional title, injected fields
2. **Remove** hardcoded `profile.work_phone`, `profile.mobile_phone`, `profile.birthday`, `profile.job_title`, `profile.department`
3. **Remove** orphaned `profile.company_name` (form doesn't collect it, it's dead data)
4. **Keep** `profile.name`, `profile.picture`, `profile.given_name`, `profile.family_name`, `updated` as core fields
5. **Make title conditional** on `_module.var: show_title`

Note: The referencing files (`create-profile.yaml` and `update-profile.yaml`) use `_ref: profile-set-fields.yaml` to include this as part of their `$set` operation. The current file returns a flat object. The new file uses `_build.object.assign`, which resolves to a flat object at build time. This is critical — `create-profile.yaml` uses `_build.object.assign` to merge the ref result with `{profile.profile_created: true}`. If we used runtime `_object.assign` instead, the ref would resolve to `{_object.assign: [...]}` at build time, and `profile.profile_created` would be silently dropped. The reference pattern does NOT need to change.

## Acceptance Criteria

- File uses `_build.object.assign` with three entries: core fields, conditional title, injected extended fields
- Core fields: profile.name (computed), profile.picture (computed), profile.given_name, profile.family_name, updated
- Title conditional on `_module.var: show_title`
- Extended fields via `_module.var: components.profile_set_fields` with default `{}`
- `profile.company_name` removed
- `profile.work_phone`, `profile.mobile_phone`, `profile.birthday`, `profile.job_title`, `profile.department` removed
- `create-profile.yaml` and `update-profile.yaml` continue to work with `_ref: profile-set-fields.yaml` (no changes needed)

## Files

- `modules/user-account/api/profile-set-fields.yaml` — modify — replace hardcoded fields with core + injection pattern
