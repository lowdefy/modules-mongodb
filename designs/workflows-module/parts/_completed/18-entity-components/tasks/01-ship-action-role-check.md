# Task 1: Ship `components/action_role_check.yaml`

## Context

`action_role_check` is the client-side role-gate primitive — a `_ref`-able YAML file containing an action sequence (not a block) that callers compose into their page's `onMount` step list. The sequence reads the current user's roles, intersects them with the action's `access.roles`, and writes the boolean to `_state.action_allowed`. Downstream blocks gate on `_state.action_allowed === true`.

Why this is task 1: the file is already `_ref`'d by seven shipped consumers — Part 16's four form-action templates ([edit/view/review/error.yaml.njk](../../../../modules/workflows/templates/)) and Part 17's three task pages ([task-edit/task-view/task-review.yaml](../../../../modules/workflows/pages/)). The path is `modules/workflows/components/action_role_check.yaml`. Until this file exists the workflows module doesn't build cleanly. Shipping it is the most urgent unblock and has no dependencies on this part's other components.

The shape mirrors v0's `action_role_check.yaml` (a single `SetState` step with the role-intersection logic inline). Pure roles check, no verb-membership check — per-app verb gating is enforced upstream at page emission (Part 12) and query-time visibility (`access_filter.yaml`). The role rule matches the engine's submit-time gate at [`handleSubmit.js:115-124`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js).

## Task

Create `modules/workflows/components/action_role_check.yaml` as an action-sequence YAML that:

1. Reads the current user's roles via `_user: { _module.var: user_schema.roles_path }`.
2. Intersects them with `_var: access.roles` (the caller passes `action_config` spread into `vars:`, so `access` is read from `vars.action_config.access`, i.e. `_var: action_config.access.roles`).
3. Writes the boolean result to `_state.action_allowed` via `SetState`.

**Allow rule** (matches the engine's submit-time logic): empty / missing `access.roles` ⇒ `true`; non-empty `access.roles` ⇒ intersection-non-empty check against user roles.

**Call shape that callers use** (already shipped — do not change):

```yaml
- _ref:
    path: ../components/action_role_check.yaml
    vars:
      action_config:
        _var: action_config        # Part 16 form templates
        # or
        _request: get_action        # Part 17 task pages
```

Either source provides an object with `access.roles` (and `access.{app_name}` — unused here). The component must work with both.

**Suggested implementation** — modelled after v0's shape (`temp/workflows-module/ui/current_workflow_utils/actions/action_role_check.yaml`) but updated to use `_module.var: user_schema.roles_path` rather than the hardcoded `_user: roles`:

```yaml
id: set_roles_flag
type: SetState
params:
  action_allowed:
    _or:
      - _eq:
          - _array.length:
              _var:
                key: action_config.access.roles
                default: []
          - 0
      - _if_none:
          - _mql.expr:
              on:
                user_roles:
                  _user:
                    _module.var: user_schema.roles_path
                action_roles:
                  _var:
                    key: action_config.access.roles
                    default: []
              expr:
                $gt:
                  - $size:
                      $setIntersection:
                        - $user_roles
                        - $action_roles
                  - 0
          - false
```

(`_if_none` defaults to `false` if the intersection check returns `null` — defensive; the `_mql.expr` happy path returns `true` / `false`.)

## Acceptance Criteria

- File exists at `modules/workflows/components/action_role_check.yaml`.
- Running `pnpm ldf:b` (or the project's build command) on `apps/demo` produces no errors related to the missing `action_role_check.yaml` reference.
- After build, opening a form-action `-edit` / `-view` / `-review` / `-error` page or a task `task-edit` / `task-view` / `task-review` page sets `_state.action_allowed` correctly:
  - User with intersecting roles → `_state.action_allowed === true`.
  - User without intersecting roles → `_state.action_allowed === false`.
  - Action with empty / missing `access.roles` → `_state.action_allowed === true` (no gate).
- The `user_schema.roles_path` var is read via `_module.var` so host apps with a non-standard roles path (e.g. `profile.roles` instead of `roles`) work without code changes.

## Files

- `modules/workflows/components/action_role_check.yaml` — **create** — single-step SetState action sequence per the implementation sketch above.

## Notes

- **Not a block, an action sequence.** The component is a single action (or list of actions, if needed) inside an `onMount` array, not a renderable block. The shape matches Part 16's existing `_ref` call sites exactly.
- **Vars contract** — `action_config: object` (required). The caller passes the action's config / doc with `access.roles` reachable from it. See the design.md vars table for the externally-stable contract.
- **No verb check.** Per Part 18 design.md's "No verb-membership check" callout. Don't add an `access.{app_name}` check — that's enforced upstream at page emission.
- **Defense in depth.** The engine still enforces the role gate server-side at submit time ([handleSubmit.js:115-124](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) — the client-side check just prevents users from seeing buttons that would fail server-side.
- **No unit tests in `apps/demo/`** per CLAUDE.md testing conventions; coverage is e2e via Part 22.
