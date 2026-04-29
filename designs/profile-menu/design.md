# Profile Menu

## Problem

The header profile dropdown (in `PageSiderMenu.profile.links`) is currently assembled at build time by concatenating three pieces in `modules/layout-sider-menu/components/page.yaml`:

```yaml
links:
  _build.array.concat:
    - _ref: { module: user-account, component: profile-links }   # Profile link
    - _var: { key: extra_profile_links, default: { _module.var: extra_profile_links } }
    - _ref: { module: user-account, component: profile-actions } # Logout link
```

The `extra_profile_links` module var accepts a plain array of menu items. In the demo app (`apps/demo/modules/layout/vars.yaml`), the consumer adds:

- `release-notes-link` → `release-notes/release-notes`
- `admin-divider`
- `users` → `user-admin/users`

**This is the "hard-coded default that works"** — but it has two problems:

1. **No RBAC filtering.** The User Admin link is visible to every logged-in user, even those without the `user-admin` role. Lowdefy filters menu links by `auth.pages.roles` at render time (`packages/api/src/routes/rootConfig/menus/filterMenuList.js`) — but only for links that belong to a registered top-level menu (`menus:` in the app config). A plain array concatenated into `profile.links` never reaches that filter.

2. **Imperative composition.** The consumer has to know the build-time layout of the dropdown (Profile first, Logout last, extras sandwiched between with a manual divider). The `extra_profile_links` var forces the consumer to restate boilerplate that the layout module already knows (Profile + Logout are universal).

The author flagged intent to move off this pattern — `page.yaml:37` carries a `# TODO: Use menu for profile links` comment.

## Solution

Two shifts, working together:

1. Drive `profile.links` at runtime via the `_menu` operator, reading from an **app-level Lowdefy menu** (conventionally `id: profile`). Lowdefy's server-side RBAC filter (`filterMenuList`) runs automatically on top-level menus — pages the user isn't authorised to see drop out before the dropdown renders.

2. **`user-account` exports a single `profile-default` menu** (Profile + Divider + Logout) that consumers either drop in verbatim for zero-config, or ignore entirely when they want a custom dropdown (in which case they define the whole `id: profile` menu themselves, inline).

### 1. Layout module — `profile.links` driven by `_menu`

`modules/layout-sider-menu/components/page.yaml`:

```yaml
profile:
  avatar:
    _ref: { module: user-account, component: profile-avatar }
  links:
    _menu:
      _module.var: profile_menu_id
```

`modules/layout-sider-menu/module.lowdefy.yaml` — replace `extra_profile_links` with:

```yaml
profile_menu_id:
  type: string
  default: profile
  description: >
    Id of the app-level menu used for the profile dropdown. Menu links are
    filtered server-side by page access (auth.pages.roles). The app must
    register a menu with this id in its menus list.
```

Layout does not own any profile menu fragments. Its only responsibility is to read the named app-level menu at runtime.

### 2. `user-account` — exports `profile-default`

`user-account` owns the Profile and Logout pages, so it owns the default dropdown composition. The default covers the universal case (Profile + Divider + Logout); anything richer is the consumer's responsibility.

`modules/user-account/menus/profile-default.yaml`:

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

Registered in `modules/user-account/module.lowdefy.yaml`:

```yaml
exports:
  menus:
    - id: default
      description: User account sidebar links (Profile).
    - id: profile-default
      description: >
        Default profile dropdown (Profile + Divider + Logout). Drop into the
        app's `id: profile` menu for zero-config use, or define your own menu
        inline when you need custom links.

menus:
  - _ref: menu.yaml
  - _ref: menus/profile-default.yaml
```

The existing `profile-links` and `profile-actions` component exports are deleted — they were only ever concatenated into `profile.links` at build time and the new runtime-menu path doesn't need them.

`profile-avatar` stays (avatars aren't menu items).

### 3. Consumer app — register `id: profile` in `menus.yaml`

**Zero-config consumer:**

```yaml
- id: default
  links:
    - id: user-admin-group
      type: MenuGroup
      properties:
        title: User Admin
      links:
        _ref: { module: user-admin, menu: default }

- id: profile
  links:
    _ref: { module: user-account, menu: profile-default }
```

**Custom consumer** — anything beyond Profile + Logout means writing the whole dropdown inline. No sandwiching, no mix-and-match with module fragments:

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

Every MenuLink still flows through `filterMenuList` server-side, so links pointing to pages the user can't access (e.g. `user-admin/users`) are dropped before render. RBAC is handled by the normal page auth config (`auth.pages.roles`) — no module-specific wiring.

The demo app falls in the "custom" bucket today: it keeps `release-notes` and `user-admin` links in the profile dropdown. `apps/demo/menus.yaml` registers `id: profile` with the inline links above. `apps/demo/modules/layout/vars.yaml` removes the `extra_profile_links` entry.

## Lowdefy Prerequisite — `MenuDivider` support in `filterMenuList`

`packages/api/src/routes/rootConfig/menus/filterMenuList.js` today only keeps `MenuLink` items (when `authorize` passes) and `MenuGroup` items (when non-empty after recursion). Every other type — including `MenuDivider` — falls through to `return null` and is filtered out.

Because this design routes `profile.links` through a top-level `id: profile` menu, every divider in `profile-default` (and any custom consumer menu) would be stripped server-side before `PageSiderMenu` renders. Result: no visual separation between the consumer's links and Logout.

**Fix:** Update `filterMenuList` to pass dividers through, then clean up orphan and consecutive dividers that remain after the `MenuLink`/`MenuGroup` filter has run.

```js
// packages/api/src/routes/rootConfig/menus/filterMenuList.js
function filterMenuList(context, { menuList }) {
  const { authorize } = context;
  const filtered = menuList
    .map((item) => {
      if (item.type === 'MenuLink') {
        return authorize(item) ? item : null;
      }
      if (item.type === 'MenuGroup') {
        const filteredSubItems = filterMenuList(context, {
          menuList: get(item, 'links', { default: [] }),
        });
        if (filteredSubItems.length > 0) {
          return { ...item, links: filteredSubItems };
        }
        return null;
      }
      if (item.type === 'MenuDivider') {
        return item;
      }
      return null;
    })
    .filter((item) => item !== null);
  return cleanDividers(filtered);
}

function cleanDividers(items) {
  let start = 0;
  while (start < items.length && items[start].type === 'MenuDivider') start++;
  let end = items.length;
  while (end > start && items[end - 1].type === 'MenuDivider') end--;
  const result = [];
  for (let i = start; i < end; i++) {
    const item = items[i];
    if (
      item.type === 'MenuDivider' &&
      result[result.length - 1]?.type === 'MenuDivider'
    ) {
      continue;
    }
    result.push(item);
  }
  return result;
}
```

Cleanup rules applied after filtering:

- **Strip leading dividers** — a divider at the top of a dropdown has nothing to divide.
- **Strip trailing dividers** — a divider at the bottom has nothing to divide.
- **Collapse consecutive dividers** — happens when the only link between two dividers was filtered out.

Cleanup runs at every recursion level, so the same behaviour applies inside `MenuGroup.links`.

**Tests to add to `packages/api/src/routes/rootConfig/menus/getMenus.test.js`:**

- Divider between two authorised links survives.
- Divider between an authorised and an unauthorised link: when the unauthorised link is dropped, the now-orphan divider is stripped.
- Leading divider is stripped.
- Trailing divider is stripped.
- Two consecutive dividers collapse to one.
- Divider inside a `MenuGroup` is preserved when the group has remaining authorised links.

**Release implications:** Backward-compatible — existing menus without dividers see no difference. Lands in a patch or minor release of `@lowdefy/api`. The modules-mongodb repo's next release must pin a Lowdefy version that includes the fix; the demo app's `package.json` bumps accordingly.

## Key Decisions

**1. App-level menu, not module-scoped.** Module `menus:` entries are exports (`_ref` targets) — `buildModules.js` does not register them in the app's top-level `menus` list. RBAC filtering only runs on top-level menus. So the composed `profile` menu must live in the consumer's app config. Every other approach (module var carrying a menu object, build-time concat of module menus) loses RBAC.

**2. `profile_menu_id` is a string, not a menu object.** A module var can't register a top-level menu — it's a value pasted into the build graph, not a schema component. Making the var a menu id (`"profile"`) and delegating resolution to `_menu` keeps the filtering path server-side.

**3. `user-account` owns `profile-default`, not layout.** `user-account` owns the Profile and Logout pages, so it owns the dropdown that chains them together. Layout renders the dropdown but has no opinion on what's in it — its only contract with the consumer is "give me a menu id, I'll call `_menu` on it". Putting the fragment in layout just because layout renders the slot would couple the two modules without benefit.

**4. Single menu export, not start/end fragments.** An earlier iteration split the default into `profile-start-links` + `profile-end-links` so consumers could sandwich extras between them. This only pays off when modules (e.g. `user-admin`, `release-notes`) contribute their own fragments that plug into the sandwich — we're not doing that. Without contributing modules, a start/end split forces consumers who want anything custom to learn the composition convention and still know exactly what each fragment contains. The simpler contract is: take the default whole, or write your own whole. No individual Profile/Logout fragments either — inlining two MenuLink blocks is seven lines each and not worth a module-surface entry.

**5. No module-level profile-link exports for contributing modules.** `user-admin` does not export a `profile-links` menu. If an app wants a User Admin link in the profile dropdown, it writes the MenuLink inline in its `id: profile` menu. RBAC still filters it out for non-admin users via the normal `auth.pages.roles` config. Same for `release-notes`. This keeps the composition surface flat — no "which module contributes what fragment" coupling to track across the app.

**6. No fallback for a missing `profile` menu.** If the consumer forgets to register `id: profile` (or `profile_menu_id` has a typo), `_menu` returns `undefined`. `PageSiderMenu` handles this cleanly (`blocks-antd/src/blocks/headerActions.js:133-140` — `prof.links ?? []`; when empty, renders just the avatar with no dropdown). No `_if` wrapping is needed in `page.yaml`. A hard-coded Profile+Logout fallback would silently mask a typo in `profile_menu_id` and reintroduce the scaffolding this design is removing — the bare-avatar behaviour is loud enough for a dev to notice on first click, and the README documents the required `menus.yaml` snippet.

## Files Changed

**Lowdefy (prerequisite — separate PR, must land and release before this design ships)**
- `packages/api/src/routes/rootConfig/menus/filterMenuList.js` — pass `MenuDivider` items through; add `cleanDividers` post-pass (strip leading/trailing, collapse consecutive)
- `packages/api/src/routes/rootConfig/menus/getMenus.test.js` — add divider coverage per the prerequisite section

**modules-mongodb**

**New**
- `modules/user-account/menus/profile-default.yaml`

**Modified**
- `modules/layout-sider-menu/module.lowdefy.yaml` — drop `extra_profile_links` var, add `profile_menu_id` var
- `modules/layout-sider-menu/components/page.yaml` — replace `_build.array.concat` block with `_menu: { _module.var: profile_menu_id }`, drop the TODO comment
- `modules/user-account/module.lowdefy.yaml` — remove `profile-links` / `profile-actions` component exports, register `profile-default` menu export
- `modules/layout-sider-menu/README.md`, `modules/user-account/README.md` — document the new pattern + snippet for the consumer's `menus.yaml` (both zero-config and custom examples)
- `apps/demo/menus.yaml` — add `id: profile` with inline Profile / Release Notes / User Admin / Divider / Logout links
- `apps/demo/modules/layout/vars.yaml` — remove `extra_profile_links`

**Deleted**
- `modules/user-account/components/profile-links.yaml`
- `modules/user-account/components/profile-actions.yaml`

## Non-goals

- **Reusable Profile/Logout link fragments.** A custom consumer copy-pastes the MenuLink blocks. If that duplication becomes painful across many apps, `user-account` can add `profile-link` / `logout-link` menu or component exports later — not solved here.
- **Per-module profile contributions.** Modules like `user-admin` do not ship their own `profile-links` menu fragments. The app composes the profile dropdown explicitly.
- **Per-role profile menus.** A consumer wanting distinct dropdowns for different roles can register multiple menus (`profile-admin`, `profile-user`) and switch `profile_menu_id` conditionally — out of scope for this design.
- **Auto-collection of profile fragments.** No magic discovery ("every installed module's `profile-links` menu is merged in"). The consumer composes explicitly.
- **Registering menus from within a module.** `buildModules.js` would need to change to promote module-level menus into the app's top-level menu list. Worth considering as a separate Lowdefy core feature; not solved here.
