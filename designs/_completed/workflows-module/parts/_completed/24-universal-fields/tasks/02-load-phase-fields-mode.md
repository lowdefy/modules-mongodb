# Task 2: Signal-less, verb-gated load mode in `loadWorkflowState`

## Context

`plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js` is Part 38's load phase. It has two modes today:

- **Submit** (`{ actionId, signal }`): loads the target action + workflow + configs, runs the workflow-stage check (`stage_rejects_submit` — completed/cancelled workflows reject unless `required_after_close`), maps the signal to a required verb via `SIGNAL_VERBS`, and runs the per-verb access gate (`gateAllows`).
- **Lifecycle** (`{ workflowId }`): loads the whole workflow; no target action, no stage check, no gate.

The new `UpdateActionFields` operation (task 5) needs a third shape: it targets an action by id like Submit, but it has **no signal** (it is not an FSM transition) and **no lifecycle restriction** — the design pins "Editable in any stage the user has access to — including `done` / `not-required` / `error`. There is no stage allowlist and no `required_after_close` interaction." That means the Submit-mode stage check must NOT run for this operation: universal fields stay editable even after `close-workflow`, on any action.

The access gate still applies. The design's "role check (`access.roles` ⊇ user roles)" wording predates Part 34's per-app per-verb model (action-wide `access.roles` was removed; `makeWorkflowsConfig.js` hard-errors on it). The shipped equivalent is the **`edit` verb gate**: `access.{connection.app_name}.edit` evaluated with `gateAllows` against `context.user.apps.{app_name}.roles` — the same verb that owns the page surface where the Update button renders (and that `action_role_check` mirrors client-side as `_state.action_allowed.edit`).

## Task

Modify `loadWorkflowState.js` to accept a third mode: `{ actionId, verb }` (a direct required-verb, mutually exclusive with `signal`).

- When `verb` is passed (and `signal` is not):
  - Resolve the target action → workflow → `workflowConfig` → `actionConfig` exactly as the Submit path does (same `action_not_found` / `workflow_not_found` errors, same shared-object-instance guarantee for `targetAction`).
  - **Skip the workflow-stage check** (`stage_rejects_submit` must not fire — a fields update on a `completed` workflow's action is legal regardless of `required_after_close`).
  - **Skip `SIGNAL_VERBS`** — the verb is given directly. Gate with the existing `gateAllows(actionConfig.access?.[app_name]?.[verb], userRoles)`; throw the existing `access_denied` error shape on failure (word the message around the verb, not a signal).
- Passing both `signal` and `verb` should throw (programming error — pick a clear `WorkflowEngineError` code such as `invalid_load_args`).
- The Submit and lifecycle modes are byte-for-byte unchanged in behaviour.
- Update the JSDoc mode list.

Extend `loadWorkflowState.test.js`:

- `{ actionId, verb: 'edit' }` returns `{ workflow, actions, workflowConfig, actionConfig, targetAction }` like Submit mode.
- Stage check skipped: a `completed` workflow with `required_after_close` absent loads fine in verb mode (the same fixture must throw `stage_rejects_submit` in signal mode).
- Verb gate: role outside `access.{app}.edit` throws `access_denied`; `true` gate passes; matching role passes (reuse the `gates.fixtures.js` oracle conventions used by the existing gate tests).
- `signal` + `verb` together throws.

## Acceptance Criteria

- `pnpm --filter modules-mongodb-plugins test loadWorkflowState` passes, existing cases untouched.
- Verb mode performs zero stage/lifecycle checks and exactly one access-gate evaluation.
- Submit-mode behaviour (incl. `stage_rejects_submit` and `SIGNAL_VERBS`) is unchanged.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js` — modify — third load mode `{ actionId, verb }`.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.test.js` — modify — verb-mode cases.

## Notes

- Keep the gate AHEAD of anything else the handler will do (the file's comment explains why: unauthorized callers must be rejected before side effects). The fields handler has no pre-hook, but the invariant should hold structurally.
- Don't add a `mode:` string enum — the presence of `verb` vs `signal` discriminates, mirroring how `actionId` vs `workflowId` already discriminates Submit vs lifecycle.
