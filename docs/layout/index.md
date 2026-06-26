---
title: Layout
module: layout
type: index
---

# Layout

Page layout module — header / sider / menu chrome, profile dropdown, notification bell, dark mode toggle, plus a centered auth-page wrapper for login flows.

Three page block variants are selectable via `page_type`:

- **`header-menu`** (default) — `PageHeaderMenu`: top header bar with the menu inline (no sider).
- **`sider-menu`** — `PageSiderMenu`: top header bar plus a collapsible sider beneath it.
- **`sidebar`** — `PageSidebarLayout`: full-height sider on the left containing the logo, menu, profile, notifications, and dark mode toggle.

Per-page overrides are supported via `_ref` vars when a single app needs more than one variant.

## Dependencies

| Module                                     | Why                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [user-account](../user-account/index.md)   | Profile dropdown — uses the `profile-avatar` component                                   |
| [notifications](../notifications/index.md) | Notification bell — uses the `notification-config` and `unread-count-request` components |

## When to use

`layout` is a required dependency of almost every other module — it provides the shared page chrome. Add it as a module entry and declare a dependency on it from any module that wraps pages in the layout `page` component.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: layout
    source: "github:lowdefy/modules-mongodb/modules/layout@v0.8.1"
    vars:
      page_type: header-menu
      footer:
        - id: footer-text
          type: Html
          properties:
            html: <p>© 2026 My Company</p>
```

Place `logo-light-theme.png`, `logo-dark-theme.png`, `logo-square-light-theme.png`, and `logo-square-dark-theme.png` in the app's `public/` folder — the page block reads them by convention and auto-swaps with dark mode.

Wrap pages with the `page` component:

```yaml
_ref:
  module: layout
  component: page
  vars:
    id: contacts
    title: Contacts
    blocks: [...]
```

See `apps/demo/modules/layout/vars.yaml` for a worked example.

## Title bar props

The `page` component renders a shared title bar above the content. Key per-page props (passed via `_ref` vars, not module vars):

| Prop               | Type    | Default | Purpose                                                                                                                                |
| ------------------ | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `title`            | string  | `null`  | Entity name/identifier — the `<h2>` heading. Never concatenate type + name here.                                                       |
| `type`             | string  | `null`  | Entity-type "eyebrow" rendered uppercase above the title. Convention: view → entity type; edit → `Edit {type}`; create → `New {type}`. |
| `status`           | string  | `null`  | Status slug looked up in `status_enum`.                                                                                                |
| `status_enum`      | object  | `null`  | Status-enum map with `{ color, borderColor, titleColor, title }` entries.                                                              |
| `doc`              | object  | `null`  | Change-stamp doc (`{ created, updated }`) for the subtitle line.                                                                       |
| `loading`          | boolean | `false` | Shimmer skeletons on title/subtitle/pill while data loads.                                                                             |
| `page_actions`     | array   | `[]`    | Action blocks to the right of the title.                                                                                               |
| `show_back_button` | boolean | `false` | Back button to the left of the title.                                                                                                  |

## Profile dropdown

Two supported shapes:

**Zero-config** — use `user-account`'s bundled Profile + Divider + Logout dropdown:

```yaml
# apps/{app}/menus.yaml
- id: profile
  links:
    _ref:
      module: user-account
      menu: profile-default
```

**Custom** — write the whole dropdown inline when you need extra links. Module-level fragment mixing is not supported.

```yaml
- id: profile
  links:
    - id: profile
      type: MenuLink
      pageId: user-account/view
      properties:
        title: Profile
        icon: AiOutlineUser
    - id: settings
      type: MenuLink
      pageId: settings/all
      properties:
        title: Settings
        icon: AiOutlineSetting
    - id: logout-divider
      type: MenuDivider
    - id: logout
      type: MenuLink
      pageId: user-account/logout
      properties:
        title: Logout
        icon: AiOutlineLogout
        danger: true
```

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions
