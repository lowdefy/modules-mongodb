# Layout Header Menu

Page layout with header menu, title bar, and content area.

## Vars

### `auth_page`

Type: `object`

Overrides for the `auth-page` component (login, email verification, etc.).

- **`brand_panel_background`** (string) — CSS `background` for the left brand panel (visible on md+ screens). Default: `var(--ant-color-primary)`
- **`card_style`** (object) — Inline style object applied to the auth card. Use for shadows, borders, or other overrides. Default: `{}`

#### Layout

Split-panel layout: left brand panel (45% width, `colorPrimary` background) with logo, right form panel with card. On mobile (`< md`), the brand panel hides and the logo appears above the card.

#### Example

```yaml
modules:
  - id: layout
    source: "github:lowdefy/modules-mongodb/modules/layout-header-menu@v1"
    vars:
      logo:
        primary: /logo.png
      auth_page:
        brand_panel_background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
        card_style:
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.12)"
```

#### Theming

The brand panel uses `var(--ant-color-primary)` by default, so it adapts to the app's `brandColor` / `colorPrimary` token. The form panel uses `var(--ant-color-bg-container)`. Both adapt to dark mode.

The logo in the brand panel has `filter: brightness(0) invert(1)` to render white. On mobile, the logo renders in its original colors.

The card uses `bordered: false`, `borderRadiusLG: 12`, and `bodyPadding: 32` by default. App-level Card theme tokens (`theme.antd.components.Card`) apply as normal.
