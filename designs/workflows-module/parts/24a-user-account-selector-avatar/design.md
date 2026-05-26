# Part 24a — Migrate `user-selector` + ship `user-avatar` in user-account

**Source rationale:** Precursor work split out of [part 24 (universal-fields)](../24-universal-fields/design.md) action review. Part 24 needs a shared way to pick assignees (Selector) and to render assigned users (avatar + name) on display surfaces; user-account already owns `user-contacts-collection`, `app_name`, and `avatar_colors`, so it's the right home. **Layer:** module-surface (user-account + user-admin). **Size:** S. **Repos:** `modules/user-account/`, `modules/user-admin/`.

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

After migration, **delete** the user-admin copies. Audit user-admin's own pages for `_ref` / `connectionId` references to the moved files and rewrite each as `_ref: { module: user-account, component: user-selector }`. Declared dependency on user-account already exists transitively (both modules currently share the same connection), but make it explicit in user-admin's manifest under `dependencies:` if it isn't already.

### 2. Ship `user-avatar` component in user-account

Render an arbitrary user's avatar + name from a user-contacts doc. Distinct from the existing `profile-avatar`, which is a one-liner config fragment bound to the logged-in user (`src: { _user: profile.picture }`) — `profile-avatar` stays for the layout module's profile-menu slot.

```yaml
# modules/user-account/components/user-avatar.yaml
id: user_avatar
type: Box
layout:
  contentGap: 8
  contentAlign: center
blocks:
  - id: avatar
    type: Avatar
    properties:
      src:
        _var: user.profile.picture
      # Fallback rendering — first-letter on gradient, mirrors profile-avatar's look.
      # avatar_colors module-var drives the gradient pool; seed by user._id for stability.
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
| `user`      | object  | —       | A user-contacts doc (or projection thereof) — needs `_id`, `profile.picture`, `profile.name`. Required. |
| `show_name` | boolean | `true`  | Render the name beside the avatar. Set `false` for compact / avatar-only displays. |

Export under `exports.components`. No new request — callers `_ref` it inline with a user record they already loaded (the assignees array in Part 24's universal-fields component, the workflow timeline's `created_by` block in any future surface, etc.).

### 3. Manifest amendments

`modules/user-account/module.lowdefy.yaml`:

- Add `user-selector` and `user-avatar` under `components:` and `exports.components`.

`modules/user-admin/module.lowdefy.yaml`:

- Remove `user-selector` from `components:` / `exports.components` (if it was exported there — check the current state).
- Add `user-account` to `dependencies:` if not present.

## Out of scope / deferred

- **Selector multi-select polish.** v1 stays single-Selector usage; Part 24's `assignees` array uses the multi-Selector mode that's already in the block — no change required here.
- **Avatar in the Selector dropdown.** Possible future enhancement (e.g. an `include_avatar: true` var on `user-selector`); not driven by any current consumer. Defer.
- **Sorting / filtering knobs on `user-selector`.** Today it filters to `is_user: true` and sorts by label. Apps that need richer filtering (by role, by department) re-implement; promote a knob when a second app asks for the same one.

## Depends on

- None — user-account already owns `user-contacts-collection`, `app_name`, and `avatar_colors`.

## Consumers

- **[Part 24 (universal-fields)](../24-universal-fields/design.md)** — edit mode `_ref`s `user-selector`; display mode `_ref`s `user-avatar` per assignee.
- **user-admin** (internal) — pages that previously consumed `user-admin/user-selector` switch to `user-account/user-selector`.

## Verification

- user-admin app pages that used the old `user-selector` continue to render the same dropdown (no visible regression).
- A new sample page in `apps/demo` that consumes `_ref: { module: user-account, component: user-avatar, vars: { user: <doc> } }` renders the avatar + name correctly for users with and without a `profile.picture`.
- Build is clean after deleting the user-admin copies — no dangling refs.

## Open questions

- None.

## Contract to neighbours

- **user-admin** loses one component export. Apps that consumed `_ref: { module: user-admin, component: user-selector }` must switch to `_ref: { module: user-account, component: user-selector }`. Document as a breaking change in user-admin's CHANGELOG.
- **Part 24** consumes both new exports — its "Depends on" lists this part.
