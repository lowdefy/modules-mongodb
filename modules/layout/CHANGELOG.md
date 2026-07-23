# @lowdefy/modules-mongodb-layout

## 0.17.0

## 0.16.0

## 0.15.0

## 0.14.1

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

## 0.9.2

## 0.9.1

## 0.9.0

### Minor Changes

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`163529c`](https://github.com/lowdefy/modules-mongodb/commit/163529cd6063914ff715b37934feea595967ee86) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking:** the `layout` `floating-actions` component now lays its buttons out with `direction: row` + `justify: flex-end` + `wrap: nowrap` instead of `direction: row-reverse`. Buttons are now listed in natural left-to-right order (the last one renders rightmost), and the bar never wraps onto a second line.

  Migration: reverse the order of buttons in each `floating-actions` `actions:` array — what used to be listed first (and rendered rightmost under `row-reverse`) must now be listed last. Every action button must set `layout: { flex: 0 1 auto }` so it is content-sized rather than a full-width grid column; a button without it stretches full width and stacks onto its own line. Any `spacer` Box or `width` var previously used to coax right-alignment is no longer needed and should be removed.

  All in-repo callers (contacts, activities, companies, user-account, user-admin) have been updated to the new order. The workflows action-page templates (edit/view/review/error) and the shared `check-action-surface` signal bar (used by the in-context action modal and the `workflow-action-*` pages) now set `flex: 0 1 auto` on every signal button and order them so the primary action lands rightmost, fixing buttons that previously stacked onto multiple lines and left-aligned. The signal bar's `justify` was also corrected from the invalid `flex-end` token to `end` (Lowdefy's justify map only accepts `end`; `flex-end` silently fell back to left alignment).

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`c4e1000`](https://github.com/lowdefy/modules-mongodb/commit/c4e100087969a67336fc071a0183198c57fd46c2) Thanks [@SamTolmay](https://github.com/SamTolmay)! - The shared page title bar (`modules/shared/layout/title-block.yaml`, threaded through the `layout` `page` component) gains three capabilities:

  - **`type` eyebrow** — a small uppercase entity-type label rendered directly above the title (e.g. `COMPANY`, `EDIT COMPANY`, `INVITE ACME USER`). The `title` prop now holds just the entity name; pages stop hand-concatenating `"{type}: {name}"` into the heading. The eyebrow renders immediately and is never skeletoned.
  - **`status` + `status_enum` pill** — the caller passes a status slug (runtime) and a status-enum map (build-time `_ref`); the title block resolves the label and the three-colour contract (`color`→fill, `borderColor`→border, `titleColor`→text) internally and renders a chunky, vertically-centred pill. Status resolution lives in the component now, not in each caller.
  - **opt-in `loading` skeleton** — when `loading` is truthy, the title, subtitle, and status pill render as shimmer skeletons (via Lowdefy's native `loading:`/`skeleton:` pair). Defaults to `false`, so static list/index titles are untouched.

  **Breaking:** the raw `badge_text` / `badge_color` props are **removed** (replaced by `status` + `status_enum`). Any external/consumer title-bar override that passed `badge_*` silently loses its badge and must migrate to a status enum with the standard `{ color, borderColor, titleColor, title }` entry shape. The wholesale `title_block` override path is unaffected — it replaces the block entirely and never used these props.

  All in-repo callers are migrated: workflow overview and group overview (badge → status pill), and contacts / activities / user-admin view, edit, and new pages (entity type split out of the title into the eyebrow; `loading` added on the request-backed view pages). A new `modules/workflows/enums/action_group_statuses.yaml` enum backs the group-overview rollup status (done / in-progress / blocked), preserving its previous green / blue / grey colours. The title-bar prop interface is now documented in the layout module README.

### Patch Changes

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`3dbbbdf`](https://github.com/lowdefy/modules-mongodb/commit/3dbbbdfd5c5fa930671c82dda7a8933d41feebb8) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Follow-on to the title-block eyebrow/status-pill work: wire two modules the first pass missed, fix a title-bar layout bug, and relocate the user record stamp.

  - **layout** — the title bar's change-stamp subtitle now **wraps** instead of being a single `nowrap`/ellipsis line. The previous styling gave the title column a min-content width equal to the full subtitle, which on narrower bars pushed the page actions (e.g. the Edit button) onto a new row. The title column is now `flex: 1 1 0` and the page-actions block `flex: 0 0 auto`, so the actions always hold the right edge and the subtitle wraps within the remaining width. (Verified in a headless-browser render of the exact DOM.)
  - **user-admin** gains a status pill on the view and edit pages. A new `modules/user-admin/enums/user_statuses.yaml` enum (active / open invite / disabled) backs it, and `get_user` now emits a `status` slug derived the same way as the list table's `active` column (disabled > open invite > active). The enum uses the antd preset green / blue / red colour families so the title pill matches the existing AgGrid Tag in the list — the table tag mechanism is unchanged. The view page no longer renders the created/modified stamp as a title subtitle; that audit info moves into the **Access** sidebar card (next to "Signed up"), and the Access card's status Tag is removed since the title pill now shows status.
  - **companies** view / edit / new pages are migrated to the eyebrow + title shape (entity type moved out of the hand-concatenated `"{label}: {name}"` heading into the `type` eyebrow; `loading` added on the request-backed view page). These pages used the title bar before the redesign but were not migrated with the other modules.

## 0.8.1

## 0.8.0

## 0.7.0

## 0.6.0

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
