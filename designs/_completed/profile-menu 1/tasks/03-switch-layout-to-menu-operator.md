# Task 3: Switch Layout `profile.links` to `_menu` Operator (Cutover)

## Context

Tasks 1 and 2 are prerequisites:

- Task 1 (Lowdefy API) ensures `MenuDivider` items survive `filterMenuList`, so the divider between consumer links and Logout renders.
- Task 2 adds the `profile-default` menu export in `user-account`, so the demo app can reference it via `_ref: { module: user-account, menu: profile-default }`.

This task is the cutover that replaces the build-time `extra_profile_links` concatenation with a runtime `_menu` lookup against a top-level app-level menu (`id: profile`). It changes three things atomically:

1. `modules/layout-sider-menu/module.lowdefy.yaml` — swap the `extra_profile_links` module var for `profile_menu_id`.
2. `modules/layout-sider-menu/components/page.yaml` — drive `profile.links` via `_menu`, drop the TODO comment, delete the `_build.array.concat` block.
3. `apps/demo/menus.yaml` + `apps/demo/modules/layout/vars.yaml` — register `id: profile` with inline links and remove the deprecated var usage.

Current state — `modules/layout-sider-menu/components/page.yaml:25-50`:

```yaml
profile:
  _build.if:
    test:
      _build.not:
        _var:
          key: hide_profile
          default: false
    then:
      avatar:
        _ref:
          module: user-account
          component: profile-avatar
      # TODO: Use menu for profile links
      links:
        _build.array.concat:
          - _ref:
              module: user-account
              component: profile-links
          - _var:
              key: extra_profile_links
              default:
                _module.var: extra_profile_links
          - _ref:
              module: user-account
              component: profile-actions
    else: null
```

Current `extra_profile_links` var declaration in `modules/layout-sider-menu/module.lowdefy.yaml:58-61`:

```yaml
extra_profile_links:
  type: array
  default: []
  description: Additional profile menu links
```

Current demo usage in `apps/demo/modules/layout/vars.yaml:1-15`:

```yaml
extra_profile_links:
  - id: release-notes-link
    type: MenuLink
    pageId: release-notes/release-notes
    properties:
      title: Release Notes
      icon: AiOutlineFileText
  - id: admin-divider
    type: MenuDivider
  - id: users
    type: MenuLink
    pageId: user-admin/users
    properties:
      title: User Admin
      icon: AiOutlineTeam
```

Current demo `apps/demo/menus.yaml` has only `id: default` (no `id: profile`).

The demo is a **custom** consumer (it wants Release Notes and User Admin in the dropdown, not just Profile + Logout), so per the design it writes the whole `id: profile` menu inline rather than `_ref`-ing `user-account`'s `profile-default`.

## Task

**1. Replace `extra_profile_links` var with `profile_menu_id` in `modules/layout-sider-menu/module.lowdefy.yaml`:**

Delete the existing `extra_profile_links` entry (lines 58-61 in the current file) and add in its place:

```yaml
profile_menu_id:
  type: string
  default: profile
  description: >
    Id of the app-level menu used for the profile dropdown. Menu links are
    filtered server-side by page access (auth.pages.roles). The app must
    register a menu with this id in its menus list.
```

**2. Rewrite the `profile.links` block in `modules/layout-sider-menu/components/page.yaml`:**

Inside the `profile._build.if.then` block, replace the entire `# TODO: Use menu for profile links` comment plus the `links:` block below it with:

```yaml
links:
  _menu:
    _module.var: profile_menu_id
```

Keep the `avatar:` branch above it unchanged. The `_build.if` wrapper controlling `hide_profile` also stays as-is. After this change, the `profile:` block should read:

```yaml
profile:
  _build.if:
    test:
      _build.not:
        _var:
          key: hide_profile
          default: false
    then:
      avatar:
        _ref:
          module: user-account
          component: profile-avatar
      links:
        _menu:
          _module.var: profile_menu_id
    else: null
```

Do not leave the `# TODO: Use menu for profile links` comment behind.

**3. Register `id: profile` in `apps/demo/menus.yaml`:**

Append a second top-level menu entry alongside the existing `id: default`. Use the custom-consumer variant (inline Profile / Release Notes / User Admin / Divider / Logout), since the demo wants more than the `profile-default` fragment provides:

```yaml
- id: profile
  links:
    - id: profile
      type: MenuLink
      pageId: user-account/profile
      properties:
        title: Profile
        icon: AiOutlineUser
    - id: release-notes
      type: MenuLink
      pageId: release-notes/release-notes
      properties:
        title: Release Notes
        icon: AiOutlineFileText
    - id: users
      type: MenuLink
      pageId: user-admin/users
      properties:
        title: User Admin
        icon: AiOutlineTeam
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

**4. Remove the deprecated `extra_profile_links` entry from `apps/demo/modules/layout/vars.yaml`:**

Delete lines 1-15 (the entire `extra_profile_links` array). Leave the `footer:` entry and any other vars intact.

## Acceptance Criteria

- `modules/layout-sider-menu/module.lowdefy.yaml` no longer declares `extra_profile_links`; it declares `profile_menu_id` with `type: string` and `default: profile`.
- `modules/layout-sider-menu/components/page.yaml` has no references to `extra_profile_links`, no `_build.array.concat` for `profile.links`, and no `# TODO: Use menu for profile links` comment. `profile.links` resolves via `_menu: { _module.var: profile_menu_id }`.
- `apps/demo/menus.yaml` declares a top-level `id: profile` menu with Profile / Release Notes / User Admin / Divider / Logout MenuLinks in that order, exactly matching the snippet above.
- `apps/demo/modules/layout/vars.yaml` no longer contains an `extra_profile_links` key.
- `pnpm ldf:b` (or equivalent build command) succeeds in `apps/demo`.
- Running the demo app locally and opening the profile dropdown in the header:
  - As a user with the `user-admin` role: shows Profile → Release Notes → User Admin → divider → Logout.
  - As a user without the `user-admin` role (but with access to `release-notes`): shows Profile → Release Notes → divider → Logout (the User Admin link is filtered out server-side, and the divider survives because Logout still separates from the preceding link).
- No visual regression on Profile or Logout link behaviour (clicking Profile navigates to the Profile page; clicking Logout navigates to the Logout page).

## Files

- `modules/layout-sider-menu/module.lowdefy.yaml` — modify — remove `extra_profile_links`, add `profile_menu_id` string var.
- `modules/layout-sider-menu/components/page.yaml` — modify — replace `_build.array.concat` links block with `_menu: { _module.var: profile_menu_id }`, drop the TODO comment.
- `apps/demo/menus.yaml` — modify — add `id: profile` inline menu with Profile / Release Notes / User Admin / divider / Logout.
- `apps/demo/modules/layout/vars.yaml` — modify — remove the `extra_profile_links` entry.

## Notes

- After this task, `modules/user-account/components/profile-links.yaml` and `modules/user-account/components/profile-actions.yaml` are no longer referenced by the layout but still exported from `user-account`. They are removed in Task 4, not here — keeping this task focused on the cutover makes it easier to review.
- If `id: profile` is not registered in the consumer's `menus.yaml`, `_menu` returns `undefined` and `PageSiderMenu` renders just the avatar with no dropdown (see `blocks-antd/src/blocks/headerActions.js:133-140` for the `prof.links ?? []` fallback). This is intentional per the design — no `_if` wrapping is needed in `page.yaml`, and no hard-coded fallback is added.
- Server-side RBAC relies on `auth.pages.roles` configured on the pages referenced by the menu links. This task does not change any page auth config — existing configuration on `user-admin/users`, `release-notes/release-notes`, etc. keeps doing the filtering. Verify those configs exist before testing.
- The `MenuDivider` in the `id: profile` menu only renders correctly if the Lowdefy version in `package.json` includes the `filterMenuList` fix from Task 1. If not yet released, pin a local build or wait for the release before validating the RBAC behaviour end-to-end.
