# Task 2: Ship `user-multi-selector` component in user-account

## Context

Part 24 (universal-fields) needs to pick an `assignees` **array**. `user-selector` (relocated in
Task 1) is single-select (`Selector`, scalar `_id` state). The multi-select picker is a **separate
component, not a `mode` var on `user-selector`** — the two use different Lowdefy blocks
(`Selector` vs `MultipleSelector`) and produce different state shapes (scalar id vs array of ids),
so a shared component with a flag would have to branch both its block type and its value contract.
Two small components beat one branching one.

It reuses the **same options request** moved in Task 1
(`modules/user-account/requests/get_users_for_selector.yaml`) — both selectors pick from
`apps.{app_name}.is_user: true` users. This task depends on Task 1 having placed that request in
user-account.

## Task

**1. Create `modules/user-account/components/user-multi-selector.yaml`:**

```yaml
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

State value is an **array** of user ids; callers bind it to an array path (Part 24 binds
`_state.fields.assignees`).

**2. Register in `modules/user-account/module.lowdefy.yaml`:**

- Under the top-level `components:` block:

  ```yaml
  - id: user-multi-selector
    component:
      _ref: components/user-multi-selector.yaml
  ```

- Under `exports.components:`:

  ```yaml
  - id: user-multi-selector
    description: Multi-select picker for an array of app users
  ```

**3. Document in `modules/user-account/README.md`:** add a `user-multi-selector` bullet to the
**Components** section with a `_ref` example:

```yaml
_ref:
  module: user-account
  component: user-multi-selector
  vars:
    label: Assignees
```

Note in the bullet that it writes an **array** of user ids to its bound state path.

## Acceptance Criteria

- `modules/user-account/components/user-multi-selector.yaml` exists with the YAML above.
- `user-multi-selector` is listed under both `components:` and `exports.components` in user-account's
  manifest.
- README Components section documents it.
- Build is clean (`pnpm ldf:b` in `apps/demo`).

## Files

- `modules/user-account/components/user-multi-selector.yaml` — create
- `modules/user-account/module.lowdefy.yaml` — modify — add component + export
- `modules/user-account/README.md` — modify — add Components bullet

## Notes

- The `_ref: requests/get_users_for_selector.yaml` is relative to the component file, so it requires
  Task 1's request move to be complete.
- Do not duplicate the request — both `user-selector` and `user-multi-selector` reference the single
  shared file.
