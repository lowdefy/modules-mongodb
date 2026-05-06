---
"@lowdefy/modules-mongodb-layout": minor
---

Layout module fixes — let the page block own logo and chrome styling instead of overriding it from this module.

**Logo: read from `public/` folder by convention.** Stop forcing `properties.logo.src` from `_module.var: logo.primary_light` in `page.yaml`; with no `logo.src` set, the page block falls back to `${basePath}/logo-{light,dark}-theme.png` (and `logo-square-{light,dark}-theme.png` for mobile) and auto-swaps with dark mode at runtime via `getDarkMode()`. The previous wiring silently bypassed that swap whenever a consumer set the var.

**Header / sider style overrides removed (no behavior change).** The page block (`PageHeaderMenu` / `PageSiderMenu` / `PageSidebarLayout`) now ships the same `.header` and `.sider` border styling we previously layered on top — `.header` via [lowdefy/lowdefy#2158](https://github.com/lowdefy/lowdefy/pull/2158), `.sider` already shipped as a default. Both overrides were redundant and have been removed; consumers see the same divider rendered by the upstream block.

**Removed vars (breaking for apps that set them):**

- `logo.primary_light` — page-header logo on light theme.
- `logo.icon` — square mobile-header logo.

Lowdefy's manifest validation does not reject unknown vars, so apps still passing these values won't error — but the values will be silently ignored and the public-folder logos will render instead.

**Migration:**

1. Drop `logo.primary_light` and `logo.icon` from your layout module-entry `vars`.
2. Place the corresponding image files under the app's `public/` folder using the conventional names:
   - `public/logo-light-theme.png` — desktop logo on light theme.
   - `public/logo-dark-theme.png` — desktop logo on dark theme.
   - `public/logo-square-light-theme.png` — mobile (square) logo on light theme.
   - `public/logo-square-dark-theme.png` — mobile (square) logo on dark theme.

`logo.primary_dark` (auth-page cover) and `logo.primary` (auth-page brand panel / mobile auth view) are unchanged. `logo.style` is unchanged but is now wired through the page block's `.logo` cssKey instead of `properties.logo.style`, matching the v5 styling API.
