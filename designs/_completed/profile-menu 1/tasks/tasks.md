# Implementation Tasks — Profile Menu

## Overview

Replace the build-time `extra_profile_links` concatenation in the sider-menu layout with a runtime app-level `id: profile` menu resolved via the `_menu` operator, so server-side RBAC (`filterMenuList`) can filter profile dropdown links by `auth.pages.roles`. Derived from `designs/profile-menu/design.md`.

## Tasks

| #   | File                                          | Summary                                                                                    | Depends On |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-lowdefy-filter-menu-dividers.md`          | Lowdefy API: pass `MenuDivider` through `filterMenuList`, add `cleanDividers` post-pass, tests | —          |
| 2   | `02-add-profile-default-menu.md`              | `user-account`: add `profile-default` menu export (Profile + Divider + Logout)             | —          |
| 3   | `03-switch-layout-to-menu-operator.md`        | `layout-sider-menu` + demo cutover: replace `extra_profile_links` with `profile_menu_id` + `_menu`  | 1, 2       |
| 4   | `04-remove-deprecated-profile-components.md`  | Delete `profile-links` / `profile-actions` components and their exports                    | 3          |
| 5   | `05-update-readmes.md`                        | Document the new pattern in `layout-sider-menu/README.md` and create `user-account/README.md` | 3          |

## Ordering Rationale

Task 1 lands in the upstream Lowdefy repo and must be released before the modules-mongodb work can ship — without the `MenuDivider` fix, every divider in the `id: profile` menu is stripped server-side and the dropdown loses its visual separation. It is ordered first but lives in a separate repository and PR.

Task 2 is additive in `user-account` (a new menu export, no existing references change) and can be implemented in parallel with Task 1.

Task 3 is the cutover: it swaps the `extra_profile_links` module var for `profile_menu_id`, rewrites `layout-sider-menu/components/page.yaml` to drive `profile.links` via `_menu`, and updates `apps/demo` to register `id: profile` inline and drop the deprecated var. It depends on Task 2 because the demo references `user-account`'s `profile-default` menu, and on Task 1 because the divider in `profile-default` only survives with the `filterMenuList` fix.

Task 4 removes the now-orphaned `profile-links.yaml` and `profile-actions.yaml` component files plus their manifest entries. It must follow Task 3 because those components are still `_ref`-ed by the old `page.yaml` until the cutover lands.

Task 5 updates user-facing docs to describe the final pattern; it can run in parallel with Task 4 once Task 3 is merged.

Tasks 4 and 5 can be executed in parallel after Task 3 lands.

## Scope

**Source:** `designs/profile-menu/design.md`
**Context files considered:** `designs/profile-menu/design.md` (no sibling non-review context files present)
**Review files skipped:** `designs/profile-menu/review/` (contents intentionally not read)
