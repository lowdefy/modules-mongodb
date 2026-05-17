# @lowdefy/modules-mongodb-layout

## 0.5.2

## 0.5.1

## 0.5.0

### Patch Changes

- [#55](https://github.com/lowdefy/modules-mongodb/pull/55) [`eb4971a`](https://github.com/lowdefy/modules-mongodb/commit/eb4971a23841080e6083836053ea2ef3bb5a96e8) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Fetch the notifications unread-count request on mount so the bell badge actually renders.

  The `page` component already wired `notifications/unread-count-request` into its `requests` array (when `hide_notifications` is false), and `notification-config.yaml` reads the count via `_request: notifications_unread_count.0.total`. But the `_request` operator only reads previously-fetched data — it does not auto-trigger a fetch — and the layout never invoked the request, so the count stayed `null`, fell through `_if_none` to `0`, and the badge never appeared regardless of how many unread notifications a user had.

  `onMountAsync` runs the fetch in parallel with the consumer's mount sequence, so it neither blocks render nor delays consumer-supplied mount actions.

## 0.4.2

## 0.4.1

### Patch Changes

- [#47](https://github.com/lowdefy/modules-mongodb/pull/47) [`ee6f903`](https://github.com/lowdefy/modules-mongodb/commit/ee6f903e0c70cef71db1d6502343ad613f8133d0) Thanks [@Saiby100](https://github.com/Saiby100)! - Add `hide_footer` var to the layout `page` component. When set to `true`, the footer slot is omitted entirely (no styled wrapper rendered). Defaults to `false`, preserving existing behavior.

## 0.4.0

## 0.3.0

### Minor Changes

- [#41](https://github.com/lowdefy/modules-mongodb/pull/41) [`5d50cad`](https://github.com/lowdefy/modules-mongodb/commit/5d50cad7c7d67a3c47bf7c206d9a1d690decc064) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Layout module fixes — let the page block own logo and chrome styling instead of overriding it from this module.

  **Logo: read from `public/` folder by convention.** Stop forcing `properties.logo.src` from `_module.var: logo.primary_light` in `page.yaml`; with no `logo.src` set, the page block falls back to `${basePath}/logo-{light,dark}-theme.png` (and `logo-square-{light,dark}-theme.png` for mobile) and auto-swaps with dark mode at runtime via `getDarkMode()`. The previous wiring silently bypassed that swap whenever a consumer set the var.

  **Header / sider style overrides removed.** The `.header` divider is now owned by the page block via [lowdefy/lowdefy#2158](https://github.com/lowdefy/lowdefy/pull/2158); `.sider` was already shipped as a default by `PageSiderMenu` and `PageSidebarLayout`. Consumers must be on a Lowdefy version that includes the upstream `.header` styling fix to get a header divider — older Lowdefy versions will render no header divider after this module bump (the previous override was visually broken on those versions anyway, drawing a partial line under the menu only).

  **Bug fix as a side effect: `logo.style` now actually applies.** The previous wiring went through `properties.logo.style`, which the v5 page-block schema rejects (`logo` has `additionalProperties: false` and no `style` property). Routing the override through the `.logo` cssKey makes the var functional on v5 for the first time.

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

## 0.2.1

### Patch Changes

- [#35](https://github.com/lowdefy/modules-mongodb/pull/35) [`930d7c1`](https://github.com/lowdefy/modules-mongodb/commit/930d7c18d1104fcc03e769907c4cae37ece3b771) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Fix `@lowdefy/modules-mongodb-plugins` peer-version references in module manifests so they track the plugin's actual published version. The previous releases shipped with a hardcoded `^0.1.0` constraint inside every `module.lowdefy.yaml`, which Lowdefy's strict 0.x semver matching rejected once the plugin moved to `0.2.0` — apps that installed `@lowdefy/modules-mongodb-plugins@0.2.0` (the only version compatible with v0.2.0 modules) failed to build with `Module "events" requires plugin "@lowdefy/modules-mongodb-plugins" version "^0.1.0" but the app has version "0.2.0" installed`.

  Modules and the plugin live in the same Changesets `fixed` group, so they're always lockstep on release. `scripts/sync-module-versions.mjs` (run as part of `release:version`) now also rewrites the plugin reference in every module manifest to `^${pluginVersion}`, keeping the manifests' constraint aligned with the plugin's published version on every bump.

## 0.2.0

## 0.1.1

## 0.1.0

### Minor Changes

- [#11](https://github.com/lowdefy/modules-mongodb/pull/11) [`f969cdf`](https://github.com/lowdefy/modules-mongodb/commit/f969cdf833334cdf2182b1784ad8605835788f95) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Initial release.
