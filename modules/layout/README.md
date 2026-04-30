# Layout

Page layout module with title bar, content area, and auth page components. Supports three page block variants — `PageHeaderMenu` (default), `PageSiderMenu`, and `PageSidebarLayout` — selected via the `page_type` var.

## Components

- **page** — Page layout wrapper. Renders `PageHeaderMenu`, `PageSiderMenu`, or `PageSidebarLayout` depending on `page_type`. Provides title bar, header/sider slots, menu, profile, notifications, dark mode toggle, and content area.
- **card** — Standard content card layout with optional back button and footer
- **floating-actions** — Floating action button bar affixed to bottom of viewport
- **auth-page** — Centered auth/login page layout with branded cover and card

## Vars

### `page_type`

Type: `string` (`header-menu` | `sider-menu` | `sidebar`)
Default: `header-menu`

Selects the page block type. Can also be overridden per page via `_ref` vars.

- **`header-menu`** (default) — `PageHeaderMenu`: top header bar with the menu inline (no sider). Simplest chrome; works for small menus and marketing-style pages.
- **`sider-menu`** — `PageSiderMenu`: top header bar (logo, profile, notifications, dark mode toggle) with a collapsible sider below it.
- **`sidebar`** — `PageSidebarLayout`: full-height sider on the left containing the logo, menu, profile, notifications, and dark mode toggle. Content area spans the rest of the viewport.

The `sider` and `sider_storage_key` vars are ignored when `page_type: header-menu` (PageHeaderMenu has no sider).

### `sider`

Type: `object`
Default: `{}`

Sider properties forwarded to the page block.

- **`width`** (number | string) — Width of the expanded sider.
- **`initialCollapsed`** (boolean) — Initial collapsed state. Overridden by localStorage on subsequent visits.
- **`collapsible`** (boolean) — Whether the sider can be collapsed. **PageSidebarLayout only.**
- **`hideToggleButton`** (boolean) — Hide the toggle button in the sider.
- **`collapsedWidth`** (integer) — Width of the collapsed sider.

Note: the common keys (`width`, `initialCollapsed`, `hideToggleButton`, `collapsedWidth`) work for `page_type: sider-menu` and `sidebar`. `collapsible` only applies to `page_type: sidebar`. All of `sider` is ignored for `page_type: header-menu` (PageHeaderMenu has no sider).

### `sider_open_blocks`

Type: `array`
Default: `[]`

Blocks rendered in the `siderOpen` slot of `PageSidebarLayout` (below the menu, visible when the sider is expanded). Only used when `page_type: sidebar`.

### `sider_closed_blocks`

Type: `array`
Default: `[]`

Blocks rendered in the `siderClosed` slot of `PageSidebarLayout` (visible when the sider is collapsed). Only used when `page_type: sidebar`.

### `sider_storage_key`

Type: `string`
Default: `layout-sider`

`localStorage` key suffix for sider collapsed-state persistence. Produces key `lf-{sider_storage_key}-open`. Set a unique value per app if multiple layouts would otherwise collide. Ignored for `page_type: header-menu` (no sider to persist).

### `logo`

Type: `object`

Logo configuration used by both the page header and auth page.

- **`primary_light`** (string) — Logo for light backgrounds (page header, light theme). Default: `/logo-light-theme.png`
- **`primary_dark`** (string) — Logo for dark backgrounds (auth page cover, dark theme header). Default: `/logo-dark-theme.png`
- **`icon`** (string) — Square logo for mobile header. Default: `/logo-square-light-theme.png`
- **`style`** (object) — Inline style for the header logo

### `menu`

Type: `object`

Menu config passed to the page block (rendered inline in the header for `header-menu`, in the sider for `sider-menu` and `sidebar`). Default: `_menu: default`.

### `header_extra`

Type: `object`

Header customization slots.

- **`blocks`** (array) — Blocks rendered in the header slot (right side)
- **`requests`** (array) — Requests loaded with every page that uses the page component

### `title_block`

Type: `object`

Custom title block override. Replaces the default title bar (breadcrumbs, title, page actions) with your own blocks.

### `dark_mode_toggle`

Type: `boolean`
Default: `true`

Show a dark mode toggle button in the page block. Rendered in the header for `page_type: header-menu` and `sider-menu`, and in the sider for `page_type: sidebar`.

### `profile_menu_id`

Type: `string`
Default: `profile`

Id of the app-level menu used for the profile dropdown. The layout reads this menu at runtime via `_menu`, so menu links are filtered server-side by page access (`auth.pages.roles`) — links pointing to pages the user can't access are dropped before the dropdown renders.

The app must register a top-level menu with this id in its `menus.yaml`. Two supported shapes:

**Zero-config** — use `user-account`'s bundled Profile + Divider + Logout dropdown:

```yaml
# apps/{app}/menus.yaml
- id: profile
  links:
    _ref:
      module: user-account
      menu: profile-default
```

**Custom** — write the whole dropdown inline when you need extra links. Module-level fragment mixing is not supported:

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

### `footer`

Type: `array`
Default: `[]`

Footer blocks shown on all page variants and the auth page. On the auth page, the footer is styled with small font size and secondary text color automatically.

### `card`

Type: `object`

Custom card component override. Replaces the default Card layout wrapper.

### `auth_page`

Type: `object`

Overrides for the auth-page component (login, email verification, etc.).

- **`cover_background`** (string) — CSS `background` for the card cover area. Default: `colorPrimary` gradient (auto-adapts to dark mode with reduced saturation)
- **`card_style`** (object) — Inline style object applied to the auth card. Use for shadows, borders, or other overrides. Default: `{}`
- **`max_width`** (number) — Max width of the auth card container in pixels. Default: `360`
- **`logo_max_width`** (number) — Max width of the logo in the cover area in pixels. Default: `160`

## Auth Page

Centered login/auth layout with a branded card cover and form body.

### Layout

- Full viewport height, card centered horizontally and vertically
- Card cover area with `colorPrimary` gradient background and dark-theme logo
- Card body with title, form content, and action buttons
- Optional footer below the card (small, centered, secondary color)

### Dark mode

- Card cover gradient automatically reduces saturation in dark mode
- Logo always uses `logo.primary_dark` (designed for dark backgrounds)
- Card body, inputs, and footer adapt via Ant Design dark algorithm

### Example

```yaml
modules:
  - id: layout
    source: "github:lowdefy/modules-mongodb/modules/layout@v1"
    vars:
      logo:
        primary_light: /my-logo.png
        primary_dark: /my-logo-white.png
      footer:
        - id: footer-text
          type: Html
          properties:
            html: <p>© 2026 My Company</p>
      auth_page:
        cover_background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
```

### Using the auth-page component

```yaml
# In a module page (e.g. login.yaml)
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
