# Part 24a — Migrate `user-selector` + ship `user-avatar` in user-account

**Source rationale:** Precursor work split out of [part 24 (universal-fields)](../../_next/24-universal-fields/design.md) action review. Part 24 needs a shared way to pick assignees (Selector) and to render assigned users (avatar + name) on display surfaces; user-account already owns `user-contacts-collection`, `app_name`, and `avatar_colors`, so it's the right home. **Layer:** module-surface (user-account + user-admin). **Size:** S. **Repos:** `modules/user-account/`, `modules/user-admin/`.

## Goal

Move the shared user-picker out of user-admin into user-account, and add a companion component for rendering any user's avatar from a user-contacts doc. Reasoning: user-account is universally present (every app has profiles), user-admin is optional (a customer portal admined from a separate team app won't ship user-admin). Components that pick or render *any* user belong in the module every app has.

## In scope

### 1. Migrate `user-selector` from user-admin to user-account

Move these files **as-is** (no behaviour change in v1):

- `modules/user-admin/components/user-selector.yaml` → `modules/user-account/components/user-selector.yaml`
- `modules/user-admin/requests/get_users_for_selector.yaml` → `modules/user-account/requests/get_users_for_selector.yaml`

The request already queries `user-contacts-collection` via `_module.connectionId: user-contacts-collection`, which resolves to user-account's connection once it ships there. The `is_user` filter (`apps.{app_name}.is_user: true`) continues to keep the dropdown to actual app users — `app_name` is already a user-account var.

Update `modules/user-account/module.lowdefy.yaml`:

- Add the component under `components:` and `exports.components`.
- (No new request export needed — the request is internal to the component.)

After migration, **delete** the user-admin copies (and remove `user-selector` from user-admin's `components:` / `exports.components`). Note: `user-selector` and `get_users_for_selector` have **no in-repo consumer** — a repo-wide grep finds only the user-admin manifest export entries and one README line, no page or app config — but `user-selector` *is* consumed by external/downstream apps, so it's a real export, not dead code. This is therefore a relocation of an externally-consumed export with no in-repo call sites to audit or rewrite. (Part 24 does **not** consume this single-select component — it uses the new `user-multi-selector` below.) Private downstream apps that `_ref` the old `user-admin/user-selector` path must update; since the repo is pre-stable that's an acceptable break — see "Contract to neighbours".

### 2. Ship `user-multi-selector` component in user-account

A multi-select sibling of `user-selector` for Part 24's `assignees` array. This is a **separate component, not a `mode` var on `user-selector`** — the two use different Lowdefy blocks (`Selector` vs `MultipleSelector`) and produce different state shapes (a scalar id vs an array of ids), so a shared component with a flag would have to branch its block type and its value contract. Two small components beat one branching one ("One correct way").

It reuses the same options request — both pick from `is_user: true` users:

```yaml
# modules/user-account/components/user-multi-selector.yaml
id: user-multi-selector
type: MultipleSelector
requests:
  - _ref: requests/get_users_for_selector.yaml
events:
  onMount:
    - id: fetch_users
      type: Request
      params: get_users_for_selector
properties:
  title: Users
  placeholder: Select users
  options:
    _request: get_users_for_selector
  label:
    _var:
      key: label
      default: {}
```

State value is an array of user ids; callers bind it to an array path (Part 24 binds `_state.fields.assignees`). The `get_users_for_selector` request moves once (under §1) and serves both selectors.

### 3. Ship `user-avatar` component in user-account

Render an arbitrary user's avatar + name from a user-contacts doc. Distinct from the existing `profile-avatar`, which is a one-liner config fragment bound to the logged-in user (`src: { _user: profile.picture }`) — `profile-avatar` stays for the layout module's profile-menu slot.

**Distinct from `identity-header` too.** `modules/shared/layout/identity-header.yaml` is also an Avatar+name widget, so the two look like twins — they are not, and shouldn't be merged:

- `identity-header` is a shared **file-path fragment** (`_ref: { path: ../shared/layout/identity-header.yaml }`, not a module export). It takes **flat** vars (`avatar_src`, `name`, `email`, `extra`) and renders the heavy header at the top of a detail/edit page — 64px avatar, name, **email**, card chrome — and is consumed within-repo by the view/edit pages of contacts, user-admin, and user-account.
- `user-avatar` is a user-account **module export**, **doc-shaped** (callers pass a user-contacts doc), and renders a compact inline chip (avatar + name, no email/card) for assignee lists and timelines. It must be an export because its first consumer, Part 24, lives in a *different module* and needs `_ref: { module: user-account, component: user-avatar }`; reaching across module boundaries to identity-header's relative path would break module encapsulation — the very thing this part exists to respect.

They share the `icon: UserOutlined` fallback by coincidence of using the same Avatar block, not by reuse.

**Scope — block-level surfaces only.** `user-avatar` is for non-table surfaces (timelines, assignee chips, detail panels). For **table** cells, use AG Grid's built-in `cell: { type: avatar, nameField, srcField, idField }` renderer (as in `modules/user-admin/components/table_users.yaml:27–31` and `modules/contacts/components/table_contacts.yaml`) — do not `_ref` `user-avatar` into a grid cell.

```yaml
# modules/user-account/components/user-avatar.yaml
id: user_avatar
type: Box
layout:
  gap: 8
  contentAlign: center
blocks:
  - id: avatar
    type: Avatar
    properties:
      src:
        _var: user.profile.picture
      # Empty-picture fallback: the Avatar block's built-in icon, matching
      # identity-header.yaml:18. In practice this rarely fires — any user created
      # through profile/contact creation already has a generated gradient+initial
      # SVG stored in profile.picture (see Note below).
      icon: UserOutlined
  - id: name
    type: Title
    visible:
      _var:
        key: show_name
        default: true
    properties:
      level: 5
      content:
        _var: user.profile.name
```

Vars contract:

| Var         | Type    | Default | Description                                                                  |
| ----------- | ------- | ------- | ---------------------------------------------------------------------------- |
| `user`      | object  | —       | A user-contacts doc (or projection thereof) — needs `profile.picture` and `profile.name`. Required. |
| `show_name` | boolean | `true`  | Render the name beside the avatar. Set `false` for compact / avatar-only displays. |

**Note — how avatar images actually work here.** There is no render-time gradient/initials computation for `user-avatar` to do. When a profile or contact is created, `modules/shared/profile/generate-avatar-svg.js.njk` builds a first-letter-on-gradient SVG (color picked once from `avatar_colors` and stored in `profile.avatar_color`) and stores the SVG as a `data:image/svg+xml` URI in `profile.picture`. So `profile.picture` is already a populated image for any created user; `user-avatar` just renders it. The colored-initials *render-time* fallback some surfaces show (e.g. the `EventsTimeline` plugin, which hashes `user.name` into its own palette) is React-internal to that plugin and is intentionally **not** replicated here — for the rare doc with no generated SVG, `user-avatar` falls back to the Avatar block's `icon: UserOutlined`.

Export under `exports.components`. No new request — callers `_ref` it inline with a user record they already loaded (the assignees array in Part 24's universal-fields component, the workflow timeline's `created_by` block in any future surface, etc.).

### 4. Manifest amendments

`modules/user-account/module.lowdefy.yaml`:

- Add `user-selector`, `user-multi-selector`, and `user-avatar` under `components:` and `exports.components`.

`modules/user-admin/module.lowdefy.yaml`:

- Remove `user-selector` from `components:` (line 156) and `exports.components` (line 134) — it is currently exported there.
- **Do not** add `user-account` to `dependencies:`. user-admin currently declares `[layout, events, notifications]` and `_ref`s nothing in user-account after the move (it has no consumer of the migrated selector, and references no other user-account export). Connection co-naming is not a dependency. Add the dependency only if a user-admin page later consumes a user-account export.

## Out of scope / deferred

- **Folding multi-select into `user-selector` via a `mode` var.** Rejected — the single- and multi-select pickers are separate components (`Selector` vs `MultipleSelector`, scalar vs array state); see §2. Not a flag on one component.
- **Avatar in the Selector dropdown.** Possible future enhancement (e.g. an `include_avatar: true` var on `user-selector`); not driven by any current consumer. Defer.
- **Sorting / filtering knobs on `user-selector`.** Today it filters to `is_user: true` and sorts by label. Apps that need richer filtering (by role, by department) re-implement; promote a knob when a second app asks for the same one.

## Depends on

- None — user-account already owns `user-contacts-collection`, `app_name`, and `avatar_colors`.

## Consumers

- **[Part 24 (universal-fields)](../../_next/24-universal-fields/design.md)** — edit mode `_ref`s `user-multi-selector` (the `assignees` array is multi-valued); display mode `_ref`s `user-avatar` per assignee. **Part 24's design currently names `user-selector` for the assignees edit (its line 172) — that reference must change to `user-multi-selector` when Part 24 is actioned.** It does not consume the single-select `user-selector`.
- **External/downstream apps** — consume `user-selector` (single-select); this part relocates it to user-account (breaking path change, see "Contract to neighbours").

## Verification

- Build is clean after the move with `user-selector` exported from user-account (no in-repo page consumes it today, so there is no dropdown to regression-test in this repo).
- A new sample page in `apps/demo` that consumes `_ref: { module: user-account, component: user-avatar, vars: { user: <doc> } }` renders the avatar + name correctly for users with and without a `profile.picture`.
- A `_ref` to `user-multi-selector` on a sample page renders a multi-select picker filtered to `is_user: true` users and writes an **array** of selected ids to its bound state path.
- Build is clean after deleting the user-admin copies — no dangling refs.

## Open questions

- None.

## Contract to neighbours

- **user-admin** loses one component export. No in-repo consumer relies on it, but any private downstream app that `_ref`'d `_ref: { module: user-admin, component: user-selector }` must switch to `_ref: { module: user-account, component: user-selector }`. The repo is pre-stable, so this is an acceptable break — but record it in user-admin's CHANGELOG as a **breaking change under a minor bump** (pre-1.0 semver: breaking changes ride minor, not major).
- **Part 24** consumes `user-multi-selector` (assignees edit) and `user-avatar` (assignee display) — its "Depends on" lists this part. It does **not** consume the single-select `user-selector`; Part 24's design line 172 must be corrected from `user-selector` to `user-multi-selector` when actioned.
