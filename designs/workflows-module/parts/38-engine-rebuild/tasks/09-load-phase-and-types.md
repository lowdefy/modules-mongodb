# Task 9: Phase types + load phase (with submit access gate)

## Context

This task anchors the phase-model contracts and builds the first phase. The four phases (load → pre-hook → plan → commit → post-hook) each have an explicit input/output contract enforced by file layout. Define the contract types first (`LoadedState`, `PreHookResult`, `Plan` — see D3), then build `loadWorkflowState.js`.

The load phase performs all reads up front (workflow + actions; for Submit also the target action), resolves configs, runs invariant checks, and — for Submit only — runs the **per-verb access gate**. The access check lives in the load phase **ahead of the pre-hook on purpose**: an unauthorized submit is rejected before any pre-hook fires, so unauthorized users never trigger pre-hook external side effects. Do not move the check after the pre-hook.

The `Plan` type definition belongs here (it is the shared contract the planners in tasks 10–12 produce and the commit in task 13 consumes). `types.js` already exists under `shared/` — extend it.

## Task

**Define phase contract types** (extend `shared/types.js` or add `shared/phases/types.js`):

- `LoadedState` — `{ workflow, actions[], workflowConfig, actionConfig (Submit only), targetAction (Submit only) }`.
- `PreHookResult` — `{ actions: [{ target, signal, upsert? }], event_overrides, form_overrides }`. An `actions[]` entry may carry `upsert: true` to spawn a missing keyed target (D4 / D13 (2)); `target` then identifies a not-yet-existing `(type, key)`.
- `Plan` — exactly the D3 shape:
  ```ts
  type Plan = {
    workflow: { doc: WorkflowDoc; changeLog: ChangeLogDelta };
    actions: Array<{ doc: ActionDoc; operation: "insert" | "update"; changeLog: ChangeLogDelta }>;
    events: Array<{ doc: EventDoc }>;
    notifications: Array<{ doc: NotificationDoc }>;
    trackerFires: Array<{ parentWorkflowId; parentActionId; signal }>;
  };
  ```

**Create `shared/phases/loadWorkflowState.js`:**

- Input: handler context (params, user, connection) + `{ workflowId }`.
- Reads via the task-1 `findDocs` helper: the workflow doc, all action docs for that workflow; for Submit, identify the target action by `payload.action_id`.
- Resolves `workflowConfig` and (Submit) the `actionConfig` for the target action.
- Reads `workflow.updated.timestamp` (the CAS anchor for task 13).
- **Invariant checks — throw if:** workflow not found; action not found; workflow stage doesn't accept submissions. The stage check preserves the current `handleSubmit.js` carve-out: a `completed`/`cancelled` workflow rejects the submit **unless** `actionConfig.required_after_close === true` (the post-close required-action path).
- **Per-verb access gate (Submit only, D16 / Part 34 D6):** resolve the signal's required verb via the Part 34 D6 table:
  - `submit` / `progress` / `not_required` → `edit`
  - `resolve_error` → `error`
  - `approve` / `request_changes` → `review`

  Reject unless `access.{current_app}.{verb}` is `true` or intersects `_user.apps.{current_app}.roles`. Use the same `(gate, roles) → bool` semantics as tasks 7/8; add a test running `gates.fixtures.js` (task 5) through this JS gate.
- Output: `LoadedState`. After load returns, **no further reads happen** until the next load (the tracker next-level load).

## Acceptance Criteria

- `LoadedState`, `PreHookResult`, `Plan` types defined and exported.
- `loadWorkflowState` reads workflow + actions in the load phase only; throws on missing workflow/action and on a stage that doesn't accept submissions — including a `completed`/`cancelled` workflow, which is rejected unless `actionConfig.required_after_close === true` (a test covers the allowed post-close case, mirroring the current `handleSubmit.test.js`).
- The submit access gate resolves verb via the Part 34 D6 table and rejects unauthorized submits **before** the pre-hook, with a structured error.
- The JS gate passes the shared `gates.fixtures.js` cases.
- Start/Cancel/Close load the whole workflow (no `actionConfig`/`targetAction`).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — modify (or add `shared/phases/types.js`) — add `LoadedState`, `PreHookResult`, `Plan`
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.test.js` — create (incl. `gates.fixtures.js` access-gate cases)

## Notes

- The access gate is the write-path-coupled half of Part 34's submit gating (per D16) — it lives with the rebuild, unlike `visible_verbs_filter.yaml` (task 7).
- The verb-resolution table here must match `hasReview`'s inputs conceptually but is a separate concern (this resolves the *required verb for authorization*; `hasReview` resolves the *landing stage*).
- This depends on task 1 (`findDocs`), task 2 (`resolveSignal`/verb concepts), and task 5 (gate oracle).
