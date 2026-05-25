# Review 1 — RBAC plumbing, composition ergonomics

Verified claims against Lowdefy source at `/Users/sam/Developer/lowdefy/lowdefy`. Main mechanism (top-level `menu` → `filterMenuList` → `_menu` operator returning the `links` array) checks out. Three issues that affect correctness or reuse, plus smaller asks.

## Critical

### 1. `filterMenuList` strips `MenuDivider` — Profile/Logout divider will disappear

> **Resolved.** Added a "Lowdefy Prerequisite" section to `design.md` specifying the `filterMenuList` fix: pass `MenuDivider` through, then run a `cleanDividers` post-pass that strips leading/trailing dividers and collapses consecutive ones (orphan dividers appear naturally when an adjacent link is filtered out). Test cases listed. "Files Changed" now lists the Lowdefy changes as a prerequisite PR that must land and release before modules-mongodb ships; the demo app's Lowdefy version pin bumps with it.

`packages/api/src/routes/rootConfig/menus/filterMenuList.js:19-43` only keeps items whose `type` is `MenuLink` (when `authorize` passes) or `MenuGroup` (when non-empty after recursion). Everything else falls through to `return null` and is removed by the `.filter((item) => item !== null)` on line 42.

`MenuDivider` has no branch. Every divider in a top-level menu's `links` array is stripped server-side before the client ever sees it.

Impact on the design:

- `modules/layout-sider-menu/menus/profile-end-links.yaml` is `[MenuDivider, MenuLink: Logout]`. After filtering, only the `Logout` link survives.
- `modules/layout-sider-menu/menus/profile-default.yaml` is `[Profile, MenuDivider, Logout]`. After filtering, it becomes `[Profile, Logout]` — no visual separation.
- `apps/demo/menus.yaml` under the proposed `id: profile` has the divider through `profile-end-links`; same outcome.

The existing var-based approach doesn't hit this because `extra_profile_links` is concatenated into `profile.links` at build time and fed straight to `PageSiderMenu` — it bypasses `filterMenus` entirely (`packages/api/src/routes/rootConfig/menus/getMenus.js:19-23` only runs `filterMenus` on `menus.json`, the top-level menus). The design's whole point is to route through `filterMenuList`, which is what introduces the regression.

There's no test for `MenuDivider` in `getMenus.test.js`, so the behavior is incidental rather than intentional — but it's real today.

**Fix options:**

1. Patch `filterMenuList` upstream to pass dividers through unchanged (and handle stray leading/trailing dividers after a run of filtered links). This is the right long-term fix; it's a one-line addition: `if (item.type === 'MenuDivider') return item;`. If the design needs dividers to work, this has to land first, and the modules-mongodb repo will need to pin a Lowdefy version that includes it.
2. Drop the divider from the fragments and render the visual separator a different way — e.g., add `style` to the `Logout` MenuLink (`borderTop: 1px solid var(--ant-color-border-secondary); margin-top: 4px; padding-top: 4px`). Loses "dashed" etc. but is independent of upstream.
3. Keep the `profile.links` wiring structurally the same (plain array concat at build time), but filter it yourself via a client-side visibility check on each link. Loses the server-side pre-filter win, and you'd be reinventing `filterMenuList`.

Option 1 is cleanest. Worth calling out as a prerequisite in "Files Changed" (Lowdefy patch + version bump) rather than silently relying on behavior that doesn't exist yet.

## Design

### 2. `profile-default` duplicates `profile-start-links` + `profile-end-links` literally

> **Resolved.** Taken further than the reviewer's lean: the start/end split is dropped entirely. `profile-default` becomes a single literal menu (`Profile → Divider → Logout`) owned by `user-account` (the module that owns the Profile and Logout pages). No `profile-start-links` / `profile-end-links` fragments are created. Rationale in `design.md` Key Decisions #3 (ownership) and #4 (single export, not start/end split): without contributing modules plugging into a sandwich, the split forces consumers who want anything custom to learn composition conventions without payoff — "take the default whole, or write your own whole" is the simpler contract. Single source of truth achieved by having one fragment instead of three.

`modules/layout-sider-menu/menus/profile-default.yaml` (design lines 99–119) is exactly the concatenation of the other two fragments. Two sources of truth for the "Profile → Divider → Logout" sequence. If someone later adds a "Preferences" link before Logout in `profile-start-links`, they have to remember to update `profile-default` too. Easy to miss.

Two cleaner options:

- Drop `profile-default` entirely. Zero-config consumers use `_build.array.concat` of the start + end fragments directly. Saves a file, forces consumers to learn the composition pattern once (which they'll need anyway as soon as they add anything).
- Keep `profile-default` but define it as a build-time concat of the other two inside the module. I don't think menu YAML supports `_build.array.concat` at the `links` level (menus are a top-level schema component, not a ref graph) — needs verification. If it works, it collapses to one source of truth.

My read: drop `profile-default`. The README snippet for zero-config is just five lines of `_build.array.concat`, and the simpler API wins against the "zero-config" convenience.

### 3. `modules/user-admin/menus/profile-links.yaml` is one link wrapped in ceremony

> **Resolved.** Design redirected to drop the per-module fragment pattern entirely (see Key Decisions 5). `user-admin/menus/profile-links.yaml` is no longer created. Apps that want a User Admin (or Release Notes, or anything else) link in the profile dropdown write the MenuLink inline in their own `id: profile` menu — RBAC still filters it via normal `auth.pages.roles`. Matches the reviewer's lean.

The user-admin module exports a whole new menu fragment to contribute one link. Given the CLAUDE.md guidance "Don't nest MenuGroups in module menus — export flat MenuLink items", and that `user-admin/menu.yaml` already exports `id: default` with the same single link, we're very close to exporting the same thing twice under different ids.

Two questions worth deciding explicitly:

1. **Does `user-admin` need its own profile fragment at all?** The app-level composition in `apps/demo/menus.yaml` (design lines 193–215) already lists the link inline for `release-notes`. For a single User Admin link, the app could do the same — write the link inline, gated by the normal RBAC filter. No new menu file in `user-admin`.
2. **If the pattern is that every module contributes a fragment**, then is `release-notes/release-notes` also supposed to be exported from the `release-notes` module as `profile-links`? The design's example has it inline, which is inconsistent.

Pick one convention and apply it uniformly. My lean: inline in the app's `menus.yaml`. Module fragments only pay off when a module contributes more than one link or the link identity varies with module vars.

## Smaller

### 4. `profile-end-links` bakes divider placement into the layout module

> **Moot.** Resolution of finding #2 dropped the start/end split entirely, so `profile-end-links` is not created. The divider now lives inline in the single `profile-default` menu between Profile and Logout. The orphan-divider safety concern from this review is still handled by `cleanDividers` in the Lowdefy prerequisite (finding #1) for any custom consumer menu that composes dividers with filtered links.

Even if issue 1 is fixed, `profile-end-links` starts with a `MenuDivider`. If a consumer composes `[profile-start-links, profile-end-links]` with nothing between them, they get `Profile, Divider, Logout` — fine. If they compose just `profile-end-links` (unlikely but allowed), they get `Divider, Logout` with an orphan leading divider.

Not a bug, but the divider is a composition concern, not an "end" concern. Consider moving it out — either into a separate `profile-divider` fragment or just letting consumers write the divider inline between their content and `profile-end-links`. Reads better: "anything before Logout; a divider; Logout".

### 5. `_module.var` inside `_menu` — confirm build-time inlining

> **Accepted.** Pattern verified against existing usage: `_module.var` is already nested inside `_build.ne` (`modules/layout-sider-menu/components/page.yaml:150`), `_build.object.fromEntries` (`modules/data-upload/requests/get-download-data.yaml`), and the `default` of `_var` (`components/page.yaml:22-23`). Lowdefy's build walker (`packages/build/src/build/buildRefs/walker.js`) resolves children post-order, so `_module.var: profile_menu_id` evaluates at build time to `"profile"`, leaving `_menu: "profile"` for the runtime operator (`packages/plugins/operators/operators-js/src/operators/client/menu.js`). Nothing novel in the composition; no design note needed.

`modules/layout-sider-menu/components/page.yaml` (design line 46–48):

```yaml
links:
  _menu:
    _module.var: profile_menu_id
```

`_module.var` is build-time; `_menu` is runtime (`packages/plugins/operators/operators-js/src/operators/client/menu.js:20-44`). The combination is intended to resolve to `_menu: "profile"` at build time, then execute on the client. I believe this works — but worth a minimal build test (or a mention under "Files Changed" that this is the expected flow) because it's the only place in the design that composes a build-time operator inside a runtime operator's params.

### 6. `profile_menu_id` default is a silent failure mode

> **Accepted.** The concern's premise — an existing consumer silently losing their dropdown on upgrade — doesn't apply: there are no consumers on the `extra_profile_links` pattern yet. For new adopters the bare-avatar signal is sufficient (loud on first click in dev, and the README documents the required `menus.yaml` snippet). No build-time warning added; no changelog migration note needed.

Design section "Key Decisions 6" argues against a fallback because a missing menu leaves a bare avatar — "loud enough for a dev to notice on first click". True for a new consumer. Less true for an upgrade path: someone on the current `extra_profile_links` model who pulls the new layout version without reading the README gets a bare avatar and every user in the app loses their dropdown. No build error, no warning.

Options:

- Log a `context.logger.warn` from `buildMenu.js` (or a new build-time check) when `profile_menu_id` is set but no top-level menu with that id exists. Cheap and catches the typo/upgrade case.
- Add a migration note in the release changelog entry explicitly calling out that `extra_profile_links` is removed and the consumer must register `id: profile`.

Not a blocker, but the "bare avatar" UX is bad enough that one of these is worth doing.

## Verifications that came back clean

- `_menu` returns `menu.links ?? []` for a single menu (not the full object) — `menu.js:37-42`. Matches the design's assumption that refs into `profile.links` get a links array.
- `filterMenuList` recurses into `MenuGroup.links` and drops empty groups — `filterMenuList.js:29-38`. Matches design claim.
- `PageSiderMenu` renders just the avatar (no Dropdown) when `prof.links` is empty/undefined — `headerActions.js:133-140`. Matches design claim, including line numbers.
- `buildMenu.js:105-137` only processes top-level `components.menus` (built from the app's `menus.yaml`). Module `menus:` entries are not promoted into this list — they're exports accessed via `_ref: { module, menu }`. Matches design Key Decision 1.
- `_ref: { module: X, menu: Y }` returning the links array is already load-bearing in `apps/demo/menus.yaml:7-10` (`user-admin-group.links: _ref: { module: user-admin, menu: default }`). The design's reuse of the mechanism is consistent.
