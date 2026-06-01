# Task 1: Migrate `user-selector` + its request from user-admin to user-account

## Context

`user-account` is universally present in every app (it owns profiles, the
`user-contacts-collection` connection, `app_name`, and `avatar_colors`); `user-admin` is optional.
A component that picks *any* app user therefore belongs in `user-account`. Today `user-selector`
lives in `user-admin` and is exported from there.

Two files move **as-is** (no behaviour change):

- `modules/user-admin/components/user-selector.yaml` (a `Selector` block)
- `modules/user-admin/requests/get_users_for_selector.yaml` (a `MongoDBAggregation` that matches
  `apps.{app_name}.is_user: true`, projects `{ label, value }`, sorts by label)

The request already uses `_module.connectionId: user-contacts-collection` and `_module.var: app_name`,
both of which user-account also defines — so it resolves identically once it ships in user-account.

There is **no in-repo consumer** of `user-selector` or `get_users_for_selector` — a repo-wide grep
finds only the user-admin manifest entries and one user-admin README line. `user-selector` *is*
consumed by external/downstream apps, so it is a real export, not dead code. This is a relocation of
an externally-consumed export with no in-repo call sites to rewrite.

## Task

**1. Move the two files** (preserve content exactly):

- `modules/user-admin/components/user-selector.yaml` → `modules/user-account/components/user-selector.yaml`
- `modules/user-admin/requests/get_users_for_selector.yaml` → `modules/user-account/requests/get_users_for_selector.yaml`

Use `git mv` so history follows the files. Do not edit their contents — the `_module.*` operators
resolve against user-account's vars/connection unchanged.

**2. Register in `modules/user-account/module.lowdefy.yaml`:**

- Under the top-level `components:` block, add (alongside the existing `profile-avatar` entry):

  ```yaml
    - id: user-selector
      component:
        _ref: components/user-selector.yaml
  ```

- Under `exports.components:`, add (after the `profile-avatar` entry):

  ```yaml
      - id: user-selector
        description: Single-select autocomplete for picking one app user
  ```

  (No new request export — `get_users_for_selector` is internal to the component.)

**3. De-register from `modules/user-admin/module.lowdefy.yaml`:**

- Remove the `user-selector` entry from `exports.components` (the only entry there).
  If that leaves `exports.components` empty, remove the now-empty `components:` key under `exports`.
- Remove the top-level `components:` block entirely — `user-selector` is its only member:

  ```yaml
  components:
    - id: user-selector
      component:
        _ref: components/user-selector.yaml
  ```

- **Do not** add `user-account` to user-admin's `dependencies:` (it stays `[layout, events, notifications]`).
  user-admin `_ref`s nothing in user-account after the move; connection co-naming is not a dependency.

**4. Update the READMEs:**

- `modules/user-admin/README.md`: remove the `user-selector` bullet and its `_ref` example from the
  **Components** section (around lines 50–60). If that empties the Components section, remove the
  `### Components` heading too.
- `modules/user-account/README.md`: add a `user-selector` bullet to the **Components** section
  (alongside `profile-avatar`), with a `_ref` example pointing at the new home:

  ```yaml
  _ref:
    module: user-account
    component: user-selector
    vars:
      label: Assigned To
  ```

**5. Delete confirmation:** the originals under `modules/user-admin/` must be gone after the `git mv`
(verify no `modules/user-admin/components/user-selector.yaml` or
`modules/user-admin/requests/get_users_for_selector.yaml` remains).

## Acceptance Criteria

- `modules/user-account/components/user-selector.yaml` and
  `modules/user-account/requests/get_users_for_selector.yaml` exist with content identical to the
  former user-admin copies; the user-admin copies are deleted.
- `user-selector` appears under both `components:` and `exports.components` in user-account's manifest,
  and is absent from user-admin's manifest.
- user-admin's `dependencies:` is unchanged.
- Both READMEs reflect the new home of `user-selector`.
- `grep -rn "module: user-admin" --include=*.yaml modules apps` returns no reference to
  `component: user-selector`.
- Build is clean (`pnpm ldf:b` in `apps/demo`) — no dangling refs.

## Files

- `modules/user-admin/components/user-selector.yaml` — delete (moved)
- `modules/user-admin/requests/get_users_for_selector.yaml` — delete (moved)
- `modules/user-account/components/user-selector.yaml` — create (moved, unchanged content)
- `modules/user-account/requests/get_users_for_selector.yaml` — create (moved, unchanged content)
- `modules/user-account/module.lowdefy.yaml` — modify — add component + export
- `modules/user-admin/module.lowdefy.yaml` — modify — remove component + export
- `modules/user-account/README.md` — modify — add Components bullet
- `modules/user-admin/README.md` — modify — remove Components bullet

## Notes

- Per repo convention this repo uses **changesets**, not hand-edited `CHANGELOG.md`. The breaking-path
  note for downstream consumers is captured in Task 5, not here.
- Keep `git mv` for both files so blame/history is preserved.
