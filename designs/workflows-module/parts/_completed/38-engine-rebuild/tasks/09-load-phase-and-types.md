# Task 9: Phase types + load phase (with submit access gate)

## Context

This task anchors the phase-model contracts and builds the first phase. The four phases (load → pre-hook → plan → commit → post-hook) each have an explicit input/output contract enforced by file layout. Define the contract types first (`LoadedState`, `PreHookResult`, `Plan` — see D3), then build `loadWorkflowState.js`.

The load phase performs all reads up front (workflow + actions; for Submit also the target action), resolves configs, runs invariant checks, and — for Submit only — runs the **per-verb access gate**. The access check lives in the load phase **ahead of the pre-hook on purpose**: an unauthorized submit is rejected before any pre-hook fires, so unauthorized users never trigger pre-hook external side effects. Do not move the check after the pre-hook.

The `Plan` type definition belongs here (it is the shared contract the planners in tasks 10–12 produce and the commit in task 13 consumes). `types.js` already exists under `shared/` — extend it.

## Task

**Define phase contract types** (extend `shared/types.js` or add `shared/phases/types.js`):

- `LoadedState` — `{ workflow, actions[], workflowConfig, actionConfig (Submit only), targetAction (Submit only) }`. `targetAction` is a convenience handle — `actions.find((a) => String(a._id) === payload.action_id)` — the doc the handler (task 15) passes as `planActionTransition`'s `action` input (task 10).
- `PreHookResult` — `{ actions: [{ target, signal, upsert?, fields?, metadata? }], event_overrides, form_overrides }`. An `actions[]` entry may carry `upsert: true` to spawn a missing keyed target (D4 / D13 (2)); `target` then identifies a not-yet-existing `(type, key)`. Optional `fields?` / `metadata?` are the data-seeding channel (state-machine.md path 3). _(Deviation note: this task was implemented before review-10 #3 added `fields?` / `metadata?`; the typedef catch-up lands in task 14.)_
- `Plan` — exactly the D3 shape:
  ```ts
  type Plan = {
    workflow: {
      doc: WorkflowDoc;
      operation: "insert" | "update";
      changeLog: ChangeLogDelta;
    }; // per-doc changeLog = raw { before, after } delta (null before for insert); operation: update (default) for Submit/Cancel/Close/tracker, insert for Start (D3 — commit step 1 dispatches accordingly)
    actions: Array<{
      doc: ActionDoc;
      operation: "insert" | "update";
      changeLog: ChangeLogDelta;
    }>;
    event: { doc: EventDoc }; // exactly one per invocation — the doc's _id IS the per-invocation event_id (a second entry would collide on _id); the type enforces the invariant (D3)
    changeLog: ChangeLogEntry[]; // finished community-schema log-changes entries built by planChangeLog (task 12) from the per-doc deltas; commit step 5 inserts these. Empty when changeLog is unconfigured.
    // No `notifications` field: the engine builds no notification doc. After commit it
    // fires callApi("send-notification", { event_ids }) keyed on the committed events (D9 step 4).
    completedGroups: Array<{ workflow_id; id; on_complete }>; // groups newly `done` — loaded vs planned groups diff + on_complete join (D3); feeds the handler return + post-hook result bag. *(Deviation note: added by review-11 #2 after this task was implemented; the typedef catch-up lands in task 14, the producing step in task 15 planSubmit step 5.)*
    trackerFires: Array<{ parentWorkflowId; parentActionId; signal }>;
  };
  ```

**Create `shared/phases/loadWorkflowState.js`:**

- Input: handler context (params, user, connection) + `{ workflowId }`. `current_app` (used by the access gate below) resolves from `context.connection.app_name` — the same source the event render context uses to key `display.{appName}` (`WorkflowAPI/schema.js` `app_name`, wired from `_module.var: app_name`); the gate and `planEventDispatch` must agree on it.
- Reads via the task-1 `findDocs` helper: the workflow doc, all action docs for that workflow; for Submit, identify the target action by `payload.action_id`.
- Resolves `workflowConfig` and (Submit) the `actionConfig` for the target action — same lookups as today (`handleSubmit.js:81–102`): `context.workflowsConfig.find((w) => w.type === workflow.workflow_type)`, then `workflowConfig.actions.find((a) => a.type === action.type)`; throw (`workflow_not_found`-style invariant errors per D13) when either misses.
- Reads `workflow.updated.timestamp` (the CAS anchor for task 13).
- **Invariant checks — throw if:** workflow not found; action not found; workflow stage doesn't accept submissions. The stage check preserves the current `handleSubmit.js` carve-out: a `completed`/`cancelled` workflow rejects the submit **unless** `actionConfig.required_after_close === true` (the post-close required-action path). All load-phase throws use `WorkflowEngineError` from `shared/errors.js` (D13 engine error model — this task creates the class) with codes `workflow_not_found` / `action_not_found` / `stage_rejects_submit`; do **not** use `SubmitWorkflowAction/UserError.js` (that's the routine-reject vehicle, reserved for pre-hook rejects, task 14). Preserve cause chains per D13: rethrows that add context pass `{ cause }`; errors that need no added context bubble unwrapped. The stage check is **Submit-specific** — lifecycle preconditions (e.g. Close's completed→no-op / cancelled→throw) live in the task-17 handlers, not in `loadWorkflowState`; don't bolt them in here or assume this check covers them.
- **Per-verb access gate (Submit only, D16 / Part 34 D6):** resolve the required verb for the user signal `payload.signal` (the same payload field the planner later applies to the target action, design.md D4 source 1) via the Part 34 D6 table:
  - `submit` / `progress` / `not_required` → `edit`
  - `resolve_error` → `error`
  - `approve` / `request_changes` → `review`

  Reject unless `access.{current_app}.{verb}` is `true` or intersects the user's roles. In load-phase JS that means: `gate = actionConfig.access?.[current_app]?.[verb]`, `userRoles = context.user.apps?.[current_app]?.roles ?? []`, evaluated through the same `(gate, userRoles) → bool` helper semantics as tasks 7/8 — a gate-absent verb and empty user roles vs a non-`true` gate both fail closed (task 5 categories 4–5). Add a test running `gates.fixtures.js` (task 5) through this JS gate.

  This per-verb gate **replaces** the action-wide `access.roles` intersection in today's `handleSubmit.js:104` — Part 34 D4 removes that shape (the resolver hard-errors on it, design.md D16). Do not preserve both checks.

- Output: `LoadedState`. After load returns, **no further reads happen** until the next load (the tracker next-level load).

**Relocate the pure group-recompute helpers** `SubmitWorkflowAction/recomputeGroups.js` + `SubmitWorkflowAction/deriveGroupStatus.js` (and their `.test.js` files) to `shared/phases/planners/`, unchanged. Both `planAutoUnblock` (task 10, the fixpoint's between-pass recompute) and `planWorkflowRecompute` (task 11, the final workflow-doc composition) import this **same shared helper** — neither reimplements it nor exports its own (one correct way) — which is what keeps tasks 10 and 11 parallel-safe after this task.

## Acceptance Criteria

- `LoadedState`, `PreHookResult`, `Plan` types defined and exported.
- `loadWorkflowState` reads workflow + actions in the load phase only; throws on missing workflow/action and on a stage that doesn't accept submissions — including a `completed`/`cancelled` workflow, which is rejected unless `actionConfig.required_after_close === true` (a test covers the allowed post-close case, mirroring the current `handleSubmit.test.js`).
- The submit access gate resolves verb via the Part 34 D6 table and rejects unauthorized submits **before** the pre-hook, throwing `WorkflowEngineError` with `code: "access_denied"` — distinguishable by code from the `workflow_not_found` / `action_not_found` / `stage_rejects_submit` invariant throws (D13).
- The JS gate passes the shared `gates.fixtures.js` cases.
- Start/Cancel/Close load the whole workflow (no `actionConfig`/`targetAction`).
- `recomputeGroups.js` + `deriveGroupStatus.js` (+ tests) relocated to `shared/phases/planners/`, existing tests still pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — modify (or add `shared/phases/types.js`) — add `LoadedState`, `PreHookResult`, `Plan`
- `plugins/modules-mongodb-plugins/src/connections/shared/errors.js` — create — `WorkflowEngineError extends Error` with `(message, { code, cause })` per D13 (task 13 extends it with `ConcurrentSubmitError`; the planners reuse it for the D13 signal-validation codes)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.test.js` — create (incl. `gates.fixtures.js` access-gate cases)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/recomputeGroups.js` — relocate (from `WorkflowAPI/SubmitWorkflowAction/`, with its `.test.js`)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/deriveGroupStatus.js` — relocate (from `WorkflowAPI/SubmitWorkflowAction/`, with its `.test.js`)

## Notes

- The access gate is the write-path-coupled half of Part 34's submit gating (per D16) — it lives with the rebuild, unlike `visible_verbs_filter.yaml` (task 7).
- The verb-resolution table here must match `hasReview`'s inputs conceptually but is a separate concern (this resolves the _required verb for authorization_; `hasReview` resolves the _landing stage_).
- This depends on task 1 (`findDocs`), task 2 (`resolveSignal`/verb concepts), and task 5 (gate oracle).
