# Task 1: Create Identity Header Component

## Context

The three person view pages (user-account profile, contacts detail, user-admin) each render avatar, name, and email differently — disconnected avatar circles, separate email Descriptions blocks, inconsistent layouts. The design introduces a shared identity header component at `modules/shared/layout/identity-header.yaml` — alongside existing shared layout components (`card.yaml`, `floating-actions.yaml`, `auth-page.yaml`). All pages reference it via file ref (`_ref: { path: modules/shared/layout/identity-header.yaml, vars: {...} }`).

## Task

Create the identity header component at `modules/shared/layout/identity-header.yaml`.

### 1. Create `modules/shared/layout/identity-header.yaml`

This is a `_ref` component that accepts vars for data binding. It renders a horizontal flex row: avatar image on the left, name + email + optional extra blocks on the right.

```yaml
# shared layout component — accepts vars for data binding
id: profile_header
type: Box
style:
  display: flex
  alignItems: center
  gap: 16px
  marginBottom: 16
blocks:
  - id: avatar
    type: Avatar
    layout:
      flex: 0 0 auto
    properties:
      size: 80
      src:
        _var: avatar_src
      icon: UserOutlined
  - id: identity_text
    type: Box
    layout:
      flex: 1 1 auto
    blocks:
      _build.array.concat:
        - - id: display_name
            type: Title
            style:
              marginBottom: 0
            properties:
              level: 4
              content:
                _var: name
          - id: email
            type: Paragraph
            style:
              marginBottom: 0
            properties:
              type: secondary
              content:
                _var: email
        - _var:
            key: extra
            default: []
```

The `extra` var accepts an array of Lowdefy blocks rendered below the email line. Modules pass contextual secondary info here (signed-up date, invite link).

The `_var` references are build-time substitutions — the operator expressions (`_user:`, `_request:`, `_state:`) passed by consumers are substituted as-is and resolved at runtime.

## Acceptance Criteria

- `modules/shared/layout/identity-header.yaml` exists with the Box + Avatar + Title + Paragraph + extra structure
- The Avatar block renders a `UserOutlined` icon fallback when `avatar_src` is null (handles users without a saved profile picture)
- The component accepts four vars: `avatar_src`, `name`, `email`, `extra`
- `extra` defaults to an empty array when not provided
- The component can be referenced as `_ref: { path: modules/shared/layout/identity-header.yaml, vars: {...} }`

## Files

- `modules/shared/layout/identity-header.yaml` — **create** — shared identity header component
