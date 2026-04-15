# Task 8: Create user-admin Built-in form_profile Component

## Context

The user-admin module currently has NO built-in form_profile component. The pages (`users-invite.yaml`, `users-edit.yaml`) use `_module.var: components.form_profile` with a default of an empty Box. Consumers are expected to provide the entire form as a module var override.

The design changes this: user-admin gets a built-in `form_profile.yaml` component following the same core + injection pattern as user-account and contacts. The `_module.var: components.form_profile` full-replacement pattern is dropped.

The user-admin form is simpler than user-account/contacts — it has no avatar, no email field (email is shown separately via `view_email.yaml` component above the profile section).

## Task

Create `modules/user-admin/components/form_profile.yaml`:

```yaml
id: form_profile
type: Box
layout:
  gap: 8
blocks:
  _build.array.concat:
    # Title (conditional)
    - _build.if:
        test:
          _module.var: show_title
        then:
          - id: user.profile.title
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
    - - id: user.profile.given_name
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
      - id: user.profile.family_name
        type: TextInput
        required: true
        properties:
          title: Last Name
    # Extended profile fields (injected by consumer)
    - _module.var:
        key: components.profile_fields
        default: []
```

Note: user-admin uses `user.*` field IDs (not `contact.*`) because the page state key is `user` (see `users-invite.yaml:134` — `payload.user: _state: user`). The field IDs here must match what the API expects: `user.profile.given_name`, `user.profile.family_name`, etc. The shared `profile_fields` form uses `contact.profile.*` IDs — but since the user-admin API reads from `_payload: user.profile.*`, and the page sends `payload.user: _state: user`, the field IDs in the form must be `user.profile.*` to match the state path.

**Important:** The shared `form_fields.yaml` uses `contact.profile.*` IDs. For user-admin, the injected fields need `user.profile.*` IDs. This means user-admin may need its own version of form_fields, OR the consumer app needs to provide user-admin-specific form fields with `user.` prefix.

**Resolution:** The design specifies `components.profile_fields` as the injection var. The consumer app provides this var, so the consumer can provide different field definitions for user-admin (with `user.profile.*` IDs) vs the other modules (with `contact.profile.*` IDs). However, the design's intent is for the shared file to be reusable. Check the user-admin API: it reads `_payload: user.profile.given_name`. The page sends `payload.user: _state: user`. So state `user.profile.given_name` becomes `_payload: user.profile.given_name`. If the form field ID is `user.profile.given_name`, state is set at `user.profile.given_name`, and payload receives it at `user.profile.given_name`. This matches.

For the shared `form_fields.yaml` with `contact.profile.*` IDs: if used in user-admin, state would be set at `contact.profile.work_phone`, but the API expects `user.profile.work_phone`. This won't work. The consumer app would need user-admin-specific form fields with `user.` prefix, or the shared form_fields need to use a configurable prefix.

**Practical approach for this task:** Create the built-in form using `user.profile.*` IDs. Note in the consumer app task (task 12) that user-admin needs form_fields with `user.` prefix. The shared `set_fields.yaml` also uses `contact.profile.*` payload paths — user-admin's API uses `user.profile.*` payload paths. So `set_fields.yaml` won't work directly for user-admin either. The consumer app task will need to address this ID mismatch.

## Acceptance Criteria

- New file `modules/user-admin/components/form_profile.yaml` exists
- Uses `_build.array.concat` with: conditional title, core fields, extended field injection
- Title conditional on `_module.var: show_title` with `span: 3`
- Core fields: `user.profile.given_name` (required, span conditional), `user.profile.family_name` (required)
- Extended fields via `_module.var: components.profile_fields` with default `[]`
- Field IDs use `user.profile.*` prefix (not `contact.profile.*`)
- No email field (handled separately by `view_email.yaml`)
- No avatar (handled separately by `view_user_avatar_preview.yaml`)

## Files

- `modules/user-admin/components/form_profile.yaml` — create — built-in profile form with core + injection pattern

## Notes

- user-admin uses `user.*` state paths while user-account/contacts use `contact.*`. The shared `form_fields.yaml` and `set_fields.yaml` use `contact.profile.*`. This means user-admin needs its own version of form fields with `user.profile.*` IDs, or the consumer provides adapted versions. This is addressed in task 12 (consumer app vars).
