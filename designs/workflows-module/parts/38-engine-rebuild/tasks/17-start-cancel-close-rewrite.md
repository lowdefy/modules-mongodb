# Task 17: Rewrite Start / Cancel / Close around phases

## Context

The other three engine entry points restructure into the same load-plan-commit shape as Submit (task 15), with different planners and commit batches but the same helpers. They have **no pre-hook in v1**. Critically, this rebuild extends event emission so **every** engine handler invocation produces exactly one `event_id` and a lifecycle entry in the events timeline (today only Submit dispatches events). These handlers compose the phases (tasks 9–13) and feed `trackerFires` into the cascade (task 16). They can be built in parallel with task 15.

## Task

**`WorkflowAPI/StartWorkflow/StartWorkflow.js`** — restructure:

- Load: `workflowConfig` + parent action (if started as a tracker child).
- Plan: workflow doc + initial action docs (drafts via `planActionTransition` with `operation: "insert"`) + optional parent-tracker transition; event = `workflow-started` (workflow-lifecycle context).
- Commit; optional tracker cascade (the parent-tracker push → `runTrackerCascade`).
- `start-workflow.yaml` payload gains `metadata` (handled in task 19); document `signal` as the replacement for the implicit "what status do we start in" path.

**`WorkflowAPI/CancelWorkflow/CancelWorkflow.js`** — restructure:

- Load: workflow + all actions.
- Plan: mark all **non-terminal** actions `not-required` via FSM signal `internal_cancel_action`; recompute; push `cancelled` onto workflow status; event = `workflow-cancelled` (workflow-lifecycle context). **Done actions are preserved** (their status stays `done`).
- Commit; tracker cascade.

**`WorkflowAPI/CloseWorkflow/CloseWorkflow.js`** — same shape as Cancel; event = `workflow-closed`.

**Lifecycle preconditions live here, not in `loadWorkflowState`** (task 9's stage check is Submit-specific). Preserve today's actual semantics, no new guards: Close on a `completed` workflow is an **idempotent no-op** (returns the empty result, `CloseWorkflow.js:52–54`); Close on a `cancelled` workflow **throws** — now `WorkflowEngineError` with `code: "stage_rejects_close"` (D13). Cancel deliberately has **no stage guard** today (cancelling a completed workflow is unguarded) — keep it that way per "build for what exists". Start inserts a fresh workflow doc, so it has no started-already check; its config-shaped preconditions (unknown `workflow_type`, keyed `starting_actions`, tracker-parent checks) carry over from the current handler.

**Event emission (per the "Engine entry points emit events" table):** one `event_id` per invocation, used as the dispatched event doc's `_id`. Workflow-lifecycle context only (`{ user, workflow, interaction }`) — `planEventDispatch` already branches on type (task 12).

## Acceptance Criteria

- Start/Cancel/Close each run load → plan → commit (→ tracker cascade) with no mutable shared `context`.
- Each emits exactly one lifecycle event (`workflow-started` / `workflow-cancelled` / `workflow-closed`) with the workflow-lifecycle render context.
- Cancel/Close sweep non-terminal actions to `not-required` via `internal_cancel_action`; **`done` actions are preserved**.
- Per Q5: **workflow-level event only** for Cancel/Close (no per-action `action-internal-cancel-action` events) in v1 — the change-log captures per-action mechanics for forensic audit.
- Integration tests `StartWorkflow.test.js`, `CancelWorkflow.test.js`, `CloseWorkflow.test.js` pass, including: Start emits `workflow-started`; Cancel preserves `done` actions and pushes `cancelled`; the change-log records per-action `not-required` transitions.

## Files

- `WorkflowAPI/StartWorkflow/StartWorkflow.js` — rewrite
- `WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — rewrite
- `WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — rewrite
- `StartWorkflow.test.js`, `CancelWorkflow.test.js`, `CloseWorkflow.test.js` — create/rewrite

## Notes

- These handlers import the shared phase functions and must be migrated in lockstep with task 15's deletion of `shared/createAction.js` / `updateAction.js` / `recomputeWorkflowAfterActionWrite.js` (they were the prior call sites). Coordinate so the build never breaks.
- No pre-hook for Start/Cancel/Close in v1 (could add later — not now, per "Build for what exists").
- `internal_cancel_action` must exist in the FSM tables (task 2) for the relevant kinds.
