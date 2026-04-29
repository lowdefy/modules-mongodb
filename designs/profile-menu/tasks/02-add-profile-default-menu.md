# Task 2: Add `profile-default` Menu Export to `user-account`

## Context

This task is purely additive in the `user-account` module — it introduces a new menu export without modifying any existing references. No other module or the demo app depends on it yet; that wiring lands in Task 3.

`user-account` owns the Profile and Logout pages (see `modules/user-account/pages/profile.yaml` and `modules/user-account/pages/logout.yaml`, registered in `modules/user-account/module.lowdefy.yaml`). Because it owns both pages, it also owns the default profile dropdown composition — Profile, Divider, Logout.

`user-account` already exports a `default` menu at `modules/user-account/menu.yaml`:

```yaml
id: default
links:
  - id: profile
    type: MenuLink
    pageId:
      _module.pageId: profile
    properties:
      title: Profile
      icon: AiOutlineUser
```

Registered in `modules/user-account/module.lowdefy.yaml`:

```yaml
exports:
  menus:
    - id: default
      description: User account navigation links

menus:
  - _ref: menu.yaml
```

This task adds a second exported menu — `profile-default` — living in a new file at `modules/user-account/menus/profile-default.yaml`, alongside the existing `menu.yaml` (the `menus/` subdirectory may need to be created).

## Task

**1. Create `modules/user-account/menus/profile-default.yaml`:**

```yaml
id: profile-default
links:
  - id: profile
    type: MenuLink
    pageId:
      _module.pageId: profile
    properties:
      title: Profile
      icon: AiOutlineUser
  - id: logout-divider
    type: MenuDivider
  - id: logout
    type: MenuLink
    pageId:
      _module.pageId: logout
    properties:
      title: Logout
      icon: AiOutlineLogout
      danger: true
```

**2. Register the new menu in `modules/user-account/module.lowdefy.yaml`:**

- Under `exports.menus`, add a second entry with `id: profile-default` and a description matching the one below.
- Under the top-level `menus:` list, add a second `_ref` entry for the new file.

Patch (both snippets are additions alongside the existing entries):

```yaml
exports:
  menus:
    - id: default
      description: User account navigation links
    - id: profile-default
      description: >
        Default profile dropdown (Profile + Divider + Logout). Drop into the
        app's `id: profile` menu for zero-config use, or define your own menu
        inline when you need custom links.

menus:
  - _ref: menu.yaml
  - _ref: menus/profile-default.yaml
```

Do **not** touch the existing `exports.components` entries for `profile-links` / `profile-actions` or the corresponding `components:` entries — those are removed in Task 4.

## Acceptance Criteria

- `modules/user-account/menus/profile-default.yaml` exists with the contents shown above.
- `modules/user-account/module.lowdefy.yaml` declares `profile-default` under both `exports.menus` and the `menus:` list.
- The existing `id: default` menu export remains unchanged.
- The existing `exports.components` entries for `profile-links` / `profile-actions` and the components themselves are untouched.
- `pnpm ldf:b` (or the equivalent build command) succeeds in `apps/demo` — the new menu is parsed and registered without errors, even though no consumer references it yet.

## Files

- `modules/user-account/menus/profile-default.yaml` — create — new menu with Profile link, divider, Logout link (danger-styled).
- `modules/user-account/module.lowdefy.yaml` — modify — add `profile-default` under `exports.menus` and `_ref: menus/profile-default.yaml` under `menus:`.

## Notes

- The `_module.pageId` operator resolves `profile` and `logout` to the scoped page IDs (e.g. `user-account/profile` when the module entry id is `user-account`), so consumers don't need to hard-code the entry id.
- The link `id`s (`profile`, `logout-divider`, `logout`) are internal to the menu — consumers can `_ref` the menu as a whole via `_ref: { module: user-account, menu: profile-default }` without caring about these ids. Keep them short and descriptive.
