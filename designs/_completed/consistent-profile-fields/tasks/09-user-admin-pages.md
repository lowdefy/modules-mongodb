# Task 9: Update user-admin Pages to Use Built-in form_profile

## Context

`modules/user-admin/pages/users-invite.yaml` (line 77-81) and `modules/user-admin/pages/users-edit.yaml` (line 83-87) currently use:

```yaml
- _module.var:
    key: components.form_profile
    default:
      id: form_profile
      type: Box
```

This full-replacement pattern allows consumers to provide the entire profile form. The design replaces this with a built-in `_ref` to the new `form_profile.yaml` component created in task 8.

## Task

### `modules/user-admin/pages/users-invite.yaml`

Replace lines 77-81:

```yaml
- _module.var:
    key: components.form_profile
    default:
      id: form_profile
      type: Box
```

With:

```yaml
- _ref: ../components/form_profile.yaml
```

### `modules/user-admin/pages/users-edit.yaml`

Replace lines 83-87:

```yaml
- _module.var:
    key: components.form_profile
    default:
      id: form_profile
      type: Box
```

With:

```yaml
- _ref: ../components/form_profile.yaml
```

Everything else on these pages stays unchanged — the card layout, avatar preview, email display, dividers, access sections, floating actions, event handling.

## Acceptance Criteria

- `users-invite.yaml` uses `_ref: ../components/form_profile.yaml` instead of `_module.var: components.form_profile`
- `users-edit.yaml` uses `_ref: ../components/form_profile.yaml` instead of `_module.var: components.form_profile`
- The "Profile" divider above and "Access" divider below remain unchanged
- All other page content unchanged (avatar, email, invite link, access forms, floating actions)

## Files

- `modules/user-admin/pages/users-invite.yaml` — modify — replace `_module.var` form override with `_ref` to built-in component
- `modules/user-admin/pages/users-edit.yaml` — modify — replace `_module.var` form override with `_ref` to built-in component
