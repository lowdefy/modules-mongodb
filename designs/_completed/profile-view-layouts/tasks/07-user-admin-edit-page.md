# Task 7: Update User-Admin Edit Page with Identity Header

## Context

After task 1, the identity header component exists. After task 6, the view page and view_access component exist, and `view_signed_up.yaml` content has been incorporated into `view_access.yaml`.

The user-admin edit page (`modules/user-admin/pages/users-edit.yaml`) currently shows a vertical stack at the top of the Card:

1. `view_user_avatar_preview.yaml` — centered 100px circular avatar with SVG initials
2. `view_signed_up.yaml` — "Signed up at YYYY-MM-DD HH:mm" paragraph
3. `view_invite_link.yaml` — copyable invite link paragraph
4. `view_email.yaml` — disabled TextInput for email

These are replaced by a single identity header `_ref` with the signed-up date and invite link passed via `extra`. The disabled email TextInput is removed — email is now in the header.

## Task

### 1. Modify `modules/user-admin/pages/users-edit.yaml`

Replace the four `_ref` components at the top of the Card blocks with a single identity header reference.

**Remove** these four lines (lines 75-78):

```yaml
- _ref: ../components/view_user_avatar_preview.yaml
- _ref: ../components/view_signed_up.yaml
- _ref: ../components/view_invite_link.yaml
- _ref: ../components/view_email.yaml
```

**Replace with:**

```yaml
- _ref:
    path: modules/shared/layout/identity-header.yaml
    vars:
      avatar_src:
        _state: user.profile.picture
      name:
        _state: user.profile.name
      email:
        _state: user.email
      extra:
        - id: signed_up
          type: Paragraph
          visible:
            _eq:
              - _state: user.is_user
              - true
          style:
            marginBottom: 0
          properties:
            type: secondary
            content:
              _nunjucks:
                template: "Signed up {{ date | date('YYYY-MM-DD') }}"
                on:
                  date:
                    _state: user.sign_up.timestamp
        - id: invite_link
          type: Paragraph
          visible:
            _eq:
              - _state: user.invite.open
              - true
          style:
            marginBottom: 0
          properties:
            type: secondary
            code: true
            copyable: true
            content:
              _nunjucks:
                template: "{{ origin }}/login?hint={{ hint }}"
                on:
                  origin:
                    _if_none:
                      - _module.var: app_domain
                      - _location: origin
                  hint:
                    _if_none:
                      - _state: user.lowercase_email
                      - ""
```

Everything after the identity header (Profile divider, form_profile, Access divider, attribute forms, access edit form, floating actions) stays unchanged.

### 2. Delete replaced component files

These components are no longer referenced by any page:

- **Delete** `modules/user-admin/components/view_user_avatar_preview.yaml` — avatar is now in the identity header
- **Delete** `modules/user-admin/components/view_email.yaml` — email is now in the identity header
- **Delete** `modules/user-admin/components/view_signed_up.yaml` — signed-up date is now in the identity header `extra` (and in `view_access.yaml` for the view page)
- **Delete** `modules/user-admin/components/view_invite_link.yaml` — invite link is now in the identity header `extra` (and in `view_access.yaml` for the view page)

Before deleting, verify these files are not referenced anywhere else:

- Search for `view_user_avatar_preview` across the codebase
- Search for `view_email` in user-admin module
- Search for `view_signed_up` across the codebase
- Search for `view_invite_link` across the codebase

The only reference should be `users-edit.yaml` which is being updated in this task.

## Acceptance Criteria

- Edit page shows identity header with avatar, name, email, signed-up date, and invite link in a horizontal layout
- The old vertical stack (centered avatar, signed-up paragraph, invite link paragraph, disabled email input) is removed
- Profile divider and form fields appear directly after the identity header (no gap from removed components)
- Four component files are deleted: `view_user_avatar_preview.yaml`, `view_email.yaml`, `view_signed_up.yaml`, `view_invite_link.yaml`
- No other files reference the deleted components
- The rest of the edit page (form fields, access section, floating actions) is unchanged
- Lowdefy build succeeds with no errors

## Files

- `modules/user-admin/pages/users-edit.yaml` — **modify** — replace four component refs with identity header
- `modules/user-admin/components/view_user_avatar_preview.yaml` — **delete** — replaced by identity header
- `modules/user-admin/components/view_email.yaml` — **delete** — replaced by identity header
- `modules/user-admin/components/view_signed_up.yaml` — **delete** — content moved to identity header extra and view_access
- `modules/user-admin/components/view_invite_link.yaml` — **delete** — content moved to identity header extra and view_access

## Notes

- The `view_invite_link.yaml` had no `visible` condition — it always rendered. The new identity header `extra` version adds `visible: _eq: [_state: user.invite.open, true]` so the invite link only shows when the invite is pending. This is an intentional improvement from the design.
- The signed-up date format changes from `'YYYY-MM-DD HH:mm'` (current `view_signed_up.yaml`) to `'YYYY-MM-DD'` (design spec). This is intentional — the design specifies the shorter format. Also note the current file references `_state: user.sign_up` directly (the timestamp object) while the design references `_state: user.sign_up.timestamp` — verify which is correct by checking the data shape in `get_user` request.
