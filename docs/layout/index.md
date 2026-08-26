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

| Prop               | Type    | Default | Purpose                                                                                                                                        |
| ------------------ | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`            | string  | `null`  | Entity name/identifier — the `<h2>` heading. Never concatenate type + name here.                                                               |
| `type`             | string  | `null`  | Entity-type "eyebrow" rendered uppercase above the title. Convention: view → entity type; edit → `Edit {type}`; create → `New {type}`.         |
| `avatar_src`       | string  | `null`  | Image src for a 48px subject avatar left of the status pill. Wire it on pages about a person; falls back to a user icon when the src is empty. |
| `status`           | string  | `null`  | Status slug looked up in `status_enum`.                                                                                                        |
| `status_enum`      | object  | `null`  | Status-enum map with `{ color, borderColor, titleColor, title }` entries.                                                                      |
| `doc`              | object  | `null`  | Change-stamp doc (`{ created, updated }`) for the subtitle line.                                                                               |
| `loading`          | boolean | `false` | Shimmer skeletons on title/subtitle/pill while data loads.                                                                                     |
| `page_actions`     | array   | `[]`    | Action blocks to the right of the title.                                                                                                       |
| `show_back_button` | boolean | `false` | Back button to the left of the title.                                                                                                          |

## App-wide seams

Four module vars splice into every page that uses the `page` component, so an app can hang app-wide behaviour in one place instead of on each page:

| Var                          | Where it lands                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `global_events.onInit`       | Appended to every page's `onInit`, after the page's own — a page's initial state is already set when these run.                                       |
| `global_events.onMountAsync` | Appended to every page's `onMountAsync`, after the `header_extra` request fetches (their `_request:` values have resolved) and before the page's own. |
| `global_blocks`              | Blocks appended after the consumer content on every page — for floating widgets (an assistant launcher, a help beacon, a "what's new" button).        |
| `global_requests`            | Requests declared on every page for `global_blocks` to use. Unlike `header_extra.requests` they are not auto-fired on mount.                          |

`global_events.onMountAsync` is the seam for app-wide guards: an onboarding gate that redirects until the caller's organization is set up, for example, reads the header requests that have just resolved and issues a `Link` — no page opts in, and pages outside the layout (auth pages, a wizard) are exempt by construction.

The header blocks themselves (`header_extra.blocks`) are module-wide, but a page may replace them with the `header_blocks` `_ref` var — `header_blocks: []` for a bare header, or a shorter list to keep only some of them.

See `apps/demo/modules/layout/vars.yaml` for a floating "What's new" launcher wired through `global_events.onInit` + `global_blocks`, and `apps/demo/pages/user-components-demo.yaml` for a page that clears its header blocks.

## Auth page

The `auth-page` component is the centered card shell the auth pages render on. Its
look is set by the `auth_page` module vars, but the card width can be overridden
per page via an `_ref` var when a page carries a wider form:

```yaml
_ref:
  module: layout
  component: auth-page
  vars:
    id: onboarding
    max_width: 560 # defaults to the `auth_page.max_width` module var
    blocks: [...]
```

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
