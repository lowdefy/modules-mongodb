# Task 5: Update `layout-sider-menu` and `user-account` READMEs

## Context

After Task 3 ships, the public contract for the sider-menu layout's profile dropdown has changed:

- The `extra_profile_links` var is gone.
- A new `profile_menu_id` var (default `profile`) names the top-level app-level menu the layout reads at runtime.
- Consumers are responsible for registering a top-level `id: profile` menu in their `menus.yaml`. Two supported shapes:
  - **Zero-config:** `_ref: { module: user-account, menu: profile-default }` — inserts Profile + Divider + Logout.
  - **Custom:** write the whole dropdown inline (module-level fragment mixing is not supported; see design doc decisions 4 and 5).

`modules/layout-sider-menu/README.md` currently documents `extra_profile_links` under the Vars section (around line 58 of the README) and must be updated to describe `profile_menu_id` and the consumer `menus.yaml` registration requirement.

`modules/user-account/README.md` does not currently exist. This task creates it, with at minimum a Menus section documenting the `profile-default` export and examples of both the zero-config and custom consumer configurations. Keep the rest of the README scoped to what already exists in the module manifest (pages, components, vars, connections, secrets, plugins) — do not invent content beyond describing the live surface.

## Task

**1. Update `modules/layout-sider-menu/README.md`:**

- Remove the `### extra_profile_links` section entirely.
- Add a new `### profile_menu_id` section in its place (same ordering position in the Vars list). Describe:
  - Type: `string`
  - Default: `profile`
  - Purpose: names the top-level app-level menu read at runtime for `profile.links`.
  - That the consumer must register a top-level menu with this id in `menus.yaml`.
  - That menu links are filtered server-side by `auth.pages.roles` (mention the RBAC benefit that motivated the change — one sentence).
- Add (or extend an existing) section that shows the two consumer-side snippets for `menus.yaml`:

  Zero-config:

  ```yaml
  - id: profile
    links:
      _ref: { module: user-account, menu: profile-default }
  ```

  Custom (adapt the example from `apps/demo/menus.yaml` — Profile / Release Notes / User Admin / Divider / Logout — or use a simpler custom example that still includes a `MenuDivider` so readers see the pattern).

- Do not touch unrelated sections (logo, menu, header_extra, title_block, darkModeToggle, footer, card, auth_page, Auth Page, Dark mode, Example).

**2. Create `modules/user-account/README.md`:**

Structure it consistently with the other module READMEs in the repo (e.g. `modules/layout-sider-menu/README.md`, `modules/user-admin/README.md` if it exists). At minimum include:

- **Title + 1-line description** — match the `name` and `description` in `module.lowdefy.yaml` ("User Account" / "User account pages — login, email verification, profile view/edit/create").
- **Pages** — list the exported pages (login, verify-email-request, profile, edit-profile, create-profile, logout) with one-line descriptions pulled from `exports.pages` in the manifest.
- **Components** — document `profile-avatar`.
- **Menus** — document both `default` and `profile-default`, with a concrete usage snippet for `profile-default` (zero-config registration in the consumer's `menus.yaml`, same as above).
- **Vars** — document `app_name`, `login_message`, `verify_email_message`, `event_display`, `avatar_colors`, `fields`, `components`, `request_stages` using the existing descriptions in `modules/user-account/module.lowdefy.yaml`.
- **Dependencies** — `layout` and `events` (one line each).
- **Secrets** — `MONGODB_URI`.
- **Plugins** — `@lowdefy/community-plugin-mongodb`, `@lowdefy/modules-mongodb-plugins`.

Keep the tone terse and reference-oriented — match the existing README style in `modules/layout-sider-menu/README.md`. Do not invent features.

## Acceptance Criteria

- `modules/layout-sider-menu/README.md` no longer mentions `extra_profile_links`.
- `modules/layout-sider-menu/README.md` documents `profile_menu_id` (type, default, description, RBAC note).
- `modules/layout-sider-menu/README.md` includes both zero-config and custom `menus.yaml` registration snippets.
- `modules/user-account/README.md` exists and documents pages, `profile-avatar` component, `default` + `profile-default` menus, vars, dependencies, secrets, and plugins, aligning with `module.lowdefy.yaml`.
- `modules/user-account/README.md` includes a concrete snippet showing how a consumer `_ref`s `profile-default` into their top-level `id: profile` menu.
- Markdown renders cleanly (no broken code fences, no stray headings).

## Files

- `modules/layout-sider-menu/README.md` — modify — remove `extra_profile_links` section, add `profile_menu_id` section, add consumer `menus.yaml` snippets.
- `modules/user-account/README.md` — create — full module README documenting pages, components, menus, vars, dependencies, secrets, and plugins.

## Notes

- Prefer reusing descriptions verbatim from the module manifests rather than paraphrasing — keeps the README and manifest in sync and avoids drift.
- If the repo has a README template or another module README (e.g. `modules/user-admin/README.md`) worth mirroring, follow its structure for consistency. Read one before writing.
- Task 4 may or may not have landed when this task runs — the README content is the same either way (both tasks describe the final state), so ordering between 4 and 5 is flexible.
