# Task 4: Refactor user-account View to Core + Injection Pattern

## Context

`modules/user-account/components/view_profile.yaml` currently uses `_object.assign` to dump all profile fields + email into a Descriptions component. This produces unstructured key-value pairs with raw field names as labels (e.g., `given_name` instead of "First Name").

After this task, the view will display structured items: conditional title, name, email as core items, plus injected extended field items via `_module.var: components.profile_view_fields` mapped with `_array.map` + `_get` against `_user: true`.

The component is referenced from `pages/profile.yaml` via `_module.var: components.view_profile` with default `_ref: ../components/view_profile.yaml`.

## Task

Rewrite `modules/user-account/components/view_profile.yaml`:

```yaml
id: view_contact_profile
type: Box
blocks:
  - id: user_avatar
    type: Img
    style:
      textAlign: center
      marginBottom: 42
      .element:
        width: 100px
        borderRadius: 50%
    properties:
      src:
        _user: profile.picture
  - id: profile_data
    type: Descriptions
    properties:
      bordered: true
      column: 1
      size: small
      items:
        _build.array.concat:
          - _build.if:
              test:
                _module.var: show_title
              then:
                - label: Title
                  value:
                    _user: profile.title
              else: []
          - - label: Name
              value:
                _user: profile.name
            - label: Email
              value:
                _user: email
          - _array.map:
              on:
                _module.var:
                  key: components.profile_view_fields
                  default: []
              callback:
                _function:
                  label:
                    __args: 0.label
                  value:
                    _get:
                      key:
                        __args: 0.key
                      from:
                        _user: true
```

Key changes:

1. **Keep** the avatar block and Box wrapper
2. **Replace** `_object.assign` dump with structured `items` using `_build.array.concat`
3. **Add conditional title** via `_build.if` on `_module.var: show_title`
4. **Core items:** Name and Email with proper labels
5. **Extended items:** `_array.map` over `_module.var: components.profile_view_fields`, using `_get` to resolve each key against `_user: true`

## Acceptance Criteria

- Avatar block unchanged
- Descriptions `items` use `_build.array.concat` with three parts: conditional title, core items, mapped extended items
- Title item appears only when `_module.var: show_title` is true
- Core items show "Name" (from `_user: profile.name`) and "Email" (from `_user: email`)
- Extended items use `_array.map` with `_function` + `_get` to resolve `key` from `_user: true`
- No hardcoded extended field items (work_phone, department, etc.)
- `bordered: true`, `column: 1`, `size: small` preserved on Descriptions

## Files

- `modules/user-account/components/view_profile.yaml` — modify — replace field dump with structured core + injection pattern
