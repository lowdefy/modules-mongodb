# Layout

Page layout module — header / sider / menu chrome, profile dropdown, notification bell, dark mode toggle, plus a centered auth-page wrapper for login flows.

Three page block variants are selectable via `page_type`:

- **`header-menu`** (default) — `PageHeaderMenu`: top header bar with the menu inline (no sider).
- **`sider-menu`** — `PageSiderMenu`: top header bar plus a collapsible sider beneath it.
- **`sidebar`** — `PageSidebarLayout`: full-height sider on the left containing the logo, menu, profile, notifications, and dark mode toggle.

Per-page overrides are supported via `_ref` vars when a single app needs more than one variant.

## Dependencies

| Module | Why |
|---|---|
| [user-account](../user-account/README.md) | Profile dropdown — uses the `profile-avatar` component |
| [notifications](../notifications/README.md) | Notification bell — uses the `notification-config` and `unread-count-request` components |

The dependency cycle (`user-account → layout → user-account`) is intentional and resolved at runtime.

## How to Use

```yaml
modules:
  - id: layout
    source: "github:lowdefy/modules-mongodb/modules/layout@v0.2.0"
    vars:
      page_type: header-menu
      logo:
        primary_light: /logo-light.png
        primary_dark: /logo-dark.png
      footer:
        - id: footer-text
          type: Html
          properties:
            html: <p>© 2026 My Company</p>
```

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

## Exports

### Components

- **`page`** — Page layout wrapper. Renders `PageHeaderMenu`, `PageSiderMenu`, or `PageSidebarLayout` depending on `page_type`. Provides title bar, header / sider slots, menu, profile, notifications, dark mode toggle, and content area.
- **`card`** — Standard content card layout with optional back button and footer.
- **`floating-actions`** — Floating action button bar affixed to the bottom of the viewport.
- **`auth-page`** — Centered auth/login page layout with branded cover and card. See [Notes](#notes).

## Vars

### `page_type`

`string`, default `header-menu`. One of `header-menu`, `sider-menu`, `sidebar`. Can also be overridden per page via `_ref` vars. The `sider`, `sider_*_blocks`, and `sider_storage_key` vars are ignored when `page_type` is `header-menu`.

### `sider`

`object`, default `{}`. Sider properties forwarded to the page block.

- **`width`** — Width of the expanded sider (px or CSS length string).
- **`initialCollapsed`** — Initial collapsed state on first load (later visits read the persisted state from `localStorage`).
- **`collapsible`** — Whether the sider can be collapsed by the user. **PageSidebarLayout only.**
- **`hideToggleButton`** — Hide the collapse toggle button.
- **`collapsedWidth`** — Width of the collapsed sider in pixels.

### `sider_open_blocks` / `sider_closed_blocks`

`array`, defaults `[]`. Blocks rendered in the `siderOpen` / `siderClosed` slots of `PageSidebarLayout`. Only used when `page_type: sidebar`.

### `sider_storage_key`

`string`, default `layout-sider`. `localStorage` key suffix for sider collapsed-state persistence — produces key `lf-{sider_storage_key}-open`. Set unique per app when multiple layouts would otherwise collide.

### `logo`

`object` — Logo config used by both the page header and auth page.

- **`primary_light`** — Logo for light backgrounds (page header on light theme). Consumers must set this — there is no default.
- **`primary_dark`** — Default `/logo-dark-theme.png`. Logo for dark backgrounds (auth-page cover, dark-theme header).
- **`primary`** — Default `/logo-light-theme.png`. Logo rendered in the auth-page brand panel and mobile auth view.
- **`icon`** — Square icon logo for the mobile header.
- **`style`** — Inline style object applied to the header logo.

### `menu`

`object`, default `_menu: default`. Menu config passed to the page block.

### `header`

`object`, default `{}`. Page-block header properties: `{ theme, contentStyle }`.

### `header_extra`

`object` — Header customization slots.

- **`requests`** — Default `[]`. Requests loaded with every page that uses the page component (e.g. shared header data).
- **`blocks`** — Default `[]`. Blocks rendered in the header slot on the right side.

### `title_block`

`object`, default `null`. Custom title block override (replaces the default title bar).

### `footer`

`array`, default `[]`. Footer blocks shown on all page variants and the auth page. On the auth page, the footer is auto-styled with small font size and secondary text color.

### `card`

`object`, default `null`. Custom card component override (replaces the default Card layout).

### `dark_mode_toggle`

`boolean`, default `true`. Show a dark mode toggle. Rendered in the header for `header-menu` and `sider-menu`, in the sider for `sidebar`.

### `profile_menu_id`

`string`, default `profile`. Id of the app-level menu used for the profile dropdown. The layout reads this menu at runtime via `_menu`, so links are filtered by `auth.pages.roles`. The app must register a top-level menu with this id in its `menus.yaml`. See [Notes — Profile dropdown](#profile-dropdown).

### `auth_page`

`object` — Auth-page overrides.

- **`max_width`** — Default `360`. Max width of the auth card container in pixels.
- **`card_style`** — Default `{}`. Inline style object applied to the auth card.
- **`cover_background`** — Default a `colorPrimary` gradient that auto-adapts to dark mode. CSS `background` for the auth card cover area.
- **`logo_max_width`** — Default `160`. Max width of the logo in the cover area in pixels.
- **`brand_panel_background`** — Default a `colorPrimary` gradient. CSS `background` for the auth-page brand panel (alternate auth layout).

## Secrets

None.

## Plugins

None.

## Notes

### Auth page

Centered login/auth layout with a branded card cover and form body. Used by `user-account/login` and `user-account/verify-email-request`.

- Full viewport height, card centered horizontally and vertically.
- Card cover area with `colorPrimary` gradient background and dark-theme logo.
- Card body with title, form content, and action buttons.
- Optional `footer` below the card (small, centered, secondary color).
- Card cover gradient automatically reduces saturation in dark mode; the logo always uses `logo.primary_dark`.

Drop the auth-page component into a module page:

```yaml
_ref:
  module: layout
  component: auth-page
  vars:
    id: login
    title: Login
    blocks:
      - id: email
        type: TextInput
        properties:
          placeholder: Work Email
    actions:
      - id: login_button
        type: Button
        properties:
          title: Login
          block: true
```

### Profile dropdown

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
