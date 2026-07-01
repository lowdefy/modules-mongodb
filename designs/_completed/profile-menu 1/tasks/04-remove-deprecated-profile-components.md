# Task 4: Remove Deprecated `profile-links` and `profile-actions` Components

## Context

After Task 3 cuts the sider-menu layout over to `_menu` for the profile dropdown, the `profile-links` and `profile-actions` component exports in `user-account` are no longer referenced by any module or app. They only ever existed to be `_build.array.concat`-ed into `profile.links` in the old build-time composition — a path the new runtime `_menu` flow replaces entirely.

This task deletes the now-orphaned component files and their export declarations.

Files to delete:

- `modules/user-account/components/profile-links.yaml` (2-line `MenuLink` to the Profile page — identical to the `profile` link inside the new `profile-default` menu from Task 2).
- `modules/user-account/components/profile-actions.yaml` (`MenuLink` to Logout with `danger: true` — identical to the `logout` link inside `profile-default`).

Declarations to remove in `modules/user-account/module.lowdefy.yaml`:

- `exports.components` entries with `id: profile-links` and `id: profile-actions`.
- Top-level `components:` entries with `id: profile-links` and `id: profile-actions` (the `_ref` pointers into the files being deleted).

The `profile-avatar` component export stays — it's still `_ref`-ed by the layout's `profile.avatar` slot (avatars aren't menu items).

## Task

**1. Delete the component files:**

- Remove `modules/user-account/components/profile-links.yaml`.
- Remove `modules/user-account/components/profile-actions.yaml`.

**2. Remove the entries from `modules/user-account/module.lowdefy.yaml`:**

Under `exports.components`, keep only the `profile-avatar` entry — remove the `profile-links` and `profile-actions` entries:

```yaml
exports:
  components:
    - id: profile-avatar
      description: Avatar config for PageHeaderMenu profile — user picture with first-letter fallback
```

Under the top-level `components:` list, keep only the `profile-avatar` entry — remove the `profile-links` and `profile-actions` entries:

```yaml
components:
  - id: profile-avatar
    component:
      _ref: components/profile-avatar.yaml
```

Leave the rest of the manifest untouched (dependencies, vars, pages, connections, api, secrets, plugins, and the Task 2 menu exports).

## Acceptance Criteria

- `modules/user-account/components/profile-links.yaml` no longer exists.
- `modules/user-account/components/profile-actions.yaml` no longer exists.
- `modules/user-account/module.lowdefy.yaml` has no references to `profile-links` or `profile-actions` under either `exports.components` or the top-level `components:` list.
- `profile-avatar` remains exported and wired to `components/profile-avatar.yaml`.
- `pnpm ldf:b` succeeds in `apps/demo`.
- Grep for `profile-links` and `profile-actions` across the modules-mongodb repo returns only matches in `designs/` files and commit history — no matches in `modules/`, `apps/`, or any live YAML/JS.

## Files

- `modules/user-account/components/profile-links.yaml` — delete.
- `modules/user-account/components/profile-actions.yaml` — delete.
- `modules/user-account/module.lowdefy.yaml` — modify — remove `profile-links` / `profile-actions` entries from `exports.components` and from the top-level `components:` list.

## Notes

- Run this task only after Task 3 has landed. If the layout's `page.yaml` still references `_ref: { module: user-account, component: profile-links }` at the point these files are deleted, the build will fail.
- Do not delete `modules/user-account/components/profile-avatar.yaml` — it is still referenced by `modules/layout-sider-menu/components/page.yaml` under `profile.avatar`.
