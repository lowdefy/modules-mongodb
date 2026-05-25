# Task 1: Create Shared Profile Core Fields

## Context

Today each module duplicates the core profile fields (title, given_name, family_name) inline in its own form component:

- `modules/user-admin/components/form_profile.yaml` — fields prefixed `user.profile.*`
- `modules/contacts/components/form_contact.yaml` — fields prefixed `contact.profile.*`
- `modules/user-account/components/form_profile.yaml` — fields prefixed `contact.profile.*`

The Module Field Pattern design extracts these into a single shared file at `modules/shared/profile/form_core.yaml` with the new flat `profile.*` namespace. All three modules will `_ref` this file instead of defining the fields inline.

## Task

Create `modules/shared/profile/form_core.yaml` containing the core profile fields with the flat `profile.*` namespace. The file accepts a `show_title` var to conditionally include the title/honorific field.

```yaml
# modules/shared/profile/form_core.yaml
_build.array.concat:
  - _build.if:
      test:
        _var: show_title
      then:
        - id: profile.title
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
  - - id: profile.given_name
      type: TextInput
      required: true
      layout:
        span:
          _build.if:
            test:
              _var: show_title
            then: 9
            else: 12
      properties:
        title: First Name
    - id: profile.family_name
      type: TextInput
      required: true
      layout:
        span: 12
      properties:
        title: Last Name
```

Key differences from the existing inline definitions:

- IDs use `profile.*` (not `user.profile.*` or `contact.profile.*`)
- `show_title` comes from `_var` (passed via `_ref` vars), not `_module.var` directly
- No avatar preview or email field — those remain module-specific

Also update the `generate-avatar-svg.js.njk` template at `modules/shared/profile/generate-avatar-svg.js.njk`. The template uses a `prefix` var for `state()` calls. The new default prefix will be `profile` (not `contact.profile` or `user.profile`). **Do not change the template itself** — it already works with any prefix. Just note that callers will pass `prefix: profile` going forward (this happens in later tasks).

## Acceptance Criteria

- `modules/shared/profile/form_core.yaml` exists with the exact structure above
- Field IDs are `profile.title`, `profile.given_name`, `profile.family_name` (flat namespace)
- `_var: show_title` controls the title field visibility and given_name span
- File can be referenced via `_ref` with `vars: { show_title: true/false }`
- No module-specific state roots (`user.*`, `contact.*`) appear in the file

## Files

- `modules/shared/profile/form_core.yaml` — **create** — shared core profile fields with flat namespace
