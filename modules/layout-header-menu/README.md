# Layout Header Menu

Page layout module with header menu, title bar, content area, and auth page components.

## Components

- **page** — PageHeaderMenu layout wrapper with title bar, header slots, and content area
- **card** — Standard content card layout with optional back button and footer
- **floating-actions** — Floating action button bar affixed to bottom of viewport
- **auth-page** — Centered auth/login page layout with branded cover and card

## Vars

### `logo`

Type: `object`

Logo configuration used by both the page header and auth page.

- **`primary_light`** (string) — Logo for light backgrounds (page header, light theme). Default: `/logo-light-theme.png`
- **`primary_dark`** (string) — Logo for dark backgrounds (auth page cover, dark theme header). Default: `/logo-dark-theme.png`
- **`icon`** (string) — Square logo for mobile header. Default: `/logo-square-light-theme.png`
- **`style`** (object) — Inline style for the header logo

### `menu`

Type: `object`

Menu config passed to PageHeaderMenu. Default: `_menu: default`.

### `header_extra`

Type: `object`

Header customization slots.

- **`blocks`** (array) — Blocks rendered in the header slot (right side)
- **`requests`** (array) — Requests loaded with every page that uses the page component

### `title_block`

Type: `object`

Custom title block override. Replaces the default title bar (breadcrumbs, title, page actions) with your own blocks.

### `darkModeToggle`

Type: `boolean`
Default: `false`

Show a dark mode toggle button in the page header.

### `extra_profile_links`

Type: `array`
Default: `[]`

Extra links appended to the profile dropdown menu (after the default profile/logout links from user-account). Can also be overridden per-page via `_ref` vars.

### `profile_on_menu_click`

Type: `array`

Event actions for the `onProfileMenuClick` event. Default: user-account module's `profile-on-menu-click` component (handles logout action).

### `footer`

Type: `array`
Default: `[]`

Footer blocks shown on both page layouts and the auth page. On the auth page, the footer is styled with small font size and secondary text color automatically.

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
    source: "github:lowdefy/modules-mongodb/modules/layout-header-menu@v1"
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
