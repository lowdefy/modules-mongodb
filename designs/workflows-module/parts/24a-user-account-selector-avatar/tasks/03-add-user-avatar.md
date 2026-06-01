# Task 3: Ship `user-avatar` component in user-account

## Context

Render an arbitrary user's avatar + name from a user-contacts doc. This is **distinct** from two
existing widgets, and must not be merged with either:

- **`profile-avatar`** (user-account) — a one-liner config fragment bound to the logged-in user
  (`src: { _user: profile.picture }`), used by the layout module's profile-menu slot. Stays as-is.
- **`identity-header`** (`modules/shared/layout/identity-header.yaml`) — a shared **file-path
  fragment** (not a module export) taking **flat** vars (`avatar_src`, `name`, `email`, `extra`),
  rendering a heavy 64px header with email and card chrome at the top of detail/edit pages.

`user-avatar` is a user-account **module export**, **doc-shaped** (callers pass a user-contacts doc),
rendering a compact inline chip (avatar + name, no email/card) for assignee lists and timelines. It
must be an export because its first consumer (Part 24) lives in a *different module* and needs
`_ref: { module: user-account, component: user-avatar }`. The shared `icon: UserOutlined` fallback is
a coincidence of both using the Avatar block, not reuse.

**Scope — block-level surfaces only.** `user-avatar` is for non-table surfaces (timelines, assignee
chips, detail panels). For **table** cells, use AG Grid's built-in
`cell: { type: avatar, nameField, srcField, idField }` renderer (see
`modules/user-admin/components/table_users.yaml` and `modules/contacts/components/table_contacts.yaml`)
— do **not** `_ref` `user-avatar` into a grid cell.

**How avatar images work here (no render-time computation needed).** When a profile/contact is
created, `modules/shared/profile/generate-avatar-svg.js.njk` builds a first-letter-on-gradient SVG
(color from `avatar_colors`, stored in `profile.avatar_color`) and stores it as a
`data:image/svg+xml` URI in `profile.picture`. So `profile.picture` is already a populated image for
any created user; `user-avatar` just renders it. For the rare doc with no generated SVG, it falls
back to the Avatar block's `icon: UserOutlined`. The colored-initials render-time fallback that the
`EventsTimeline` plugin does (hashing `user.name`) is React-internal to that plugin and is
intentionally **not** replicated here.

## Task

**1. Create `modules/user-account/components/user-avatar.yaml`:**

```yaml
id: user_avatar
type: Box
layout:
  contentGap: 8
  contentAlign: center
blocks:
  - id: avatar
    type: Avatar
    properties:
      src:
        _var: user.profile.picture
      icon: UserOutlined
  - id: name
    type: Title
    visible:
      _var:
        key: show_name
        default: true
    properties:
      level: 5
      content:
        _var: user.profile.name
```

Vars contract:

| Var         | Type    | Default | Description                                                                  |
| ----------- | ------- | ------- | ---------------------------------------------------------------------------- |
| `user`      | object  | —       | A user-contacts doc (or projection) — needs `profile.picture` and `profile.name`. Required. |
| `show_name` | boolean | `true`  | Render the name beside the avatar. Set `false` for compact / avatar-only displays. |

**2. Register in `modules/user-account/module.lowdefy.yaml`:**

- Under the top-level `components:` block:

  ```yaml
    - id: user-avatar
      component:
        _ref: components/user-avatar.yaml
  ```

- Under `exports.components:`:

  ```yaml
      - id: user-avatar
        description: Inline avatar + name chip rendered from a user-contacts doc
  ```

  (No new request — callers `_ref` it inline with a user record they already loaded.)

**3. Document in `modules/user-account/README.md`:** add a `user-avatar` bullet to the **Components**
section, noting it is doc-shaped (`user` var), block-level only (use AG Grid's `avatar` cell type for
tables), and supports `show_name`. Example:

```yaml
_ref:
  module: user-account
  component: user-avatar
  vars:
    user:
      _state: some.user.doc
    show_name: true
```

## Acceptance Criteria

- `modules/user-account/components/user-avatar.yaml` exists with the YAML above (block id is
  `user_avatar`; export id is `user-avatar`).
- `user-avatar` is listed under both `components:` and `exports.components` in user-account's manifest.
- README Components section documents it, including the table-cell caveat and `show_name`.
- Build is clean (`pnpm ldf:b` in `apps/demo`).

## Files

- `modules/user-account/components/user-avatar.yaml` — create
- `modules/user-account/module.lowdefy.yaml` — modify — add component + export
- `modules/user-account/README.md` — modify — add Components bullet

## Notes

- The export id (kebab `user-avatar`) differs from the internal block id (snake `user_avatar`) — this
  matches the design verbatim; keep both as written.
- Do not add gradient/initials computation — it is not needed (see Context).
