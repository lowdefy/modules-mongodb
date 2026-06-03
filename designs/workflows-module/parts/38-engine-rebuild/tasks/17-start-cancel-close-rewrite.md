# Task 17: Rewrite Start / Cancel / Close around phases

## Context

The other three engine entry points restructure into the same load-plan-commit shape as Submit (task 15), with different planners and commit batches but the same helpers. They have **no pre-hook in v1**. Critically, this rebuild extends event emission so **every** engine handler invocation produces exactly one `event_id` and a lifecycle entry in the events timeline (today only Submit dispatches events). These handlers compose the phases (tasks 9–13) and feed `trackerFires` into the cascade (task 16). They can be built in parallel with task 15.

## Task

**`WorkflowAPI/StartWorkflow/StartWorkflow.js`** — restructure:

- Load: `workflowConfig` + parent action (if started as a tracker child).
- Plan: workflow doc (`Plan.workflow.operation: "insert"` — D3/task 13: commit step 1 dispatches to `insertOneDoc`, no CAS filter) + initial action docs **seeded directly at the declared status** — `starting_actions` / payload `actions:` entries keep the `{ type, status }` grammar (legal seeds: `action-required`, `blocked`), and the Start planner builds insert drafts at that status without `planActionTransition`'s signal resolution. Creation at workflow start is not an FSM transition; the `none` row is the pre-hook spawn path only (Part 45 review 1 #2; state-machine.md "Creation"). The planned workflow doc carries **`entity_ref_key`** from the workflow config alongside `entity_collection` (same copy-onto-doc mechanic) — `planEventDispatch` reads it for the event's entity reference key (task 12; design "Event references"). Plus optional parent-tracker transition; event = `workflow-started` (workflow-lifecycle context).
- Commit through `commitPlan` like every other handler; optional tracker cascade (the parent-tracker push → `runTrackerCascade`).
- `start-workflow.yaml` payload gains `metadata` (handled in task 19); the `actions:` override stays on `{ type, status }` — no signal grammar at start. **StartWorkflow enforces the legal-seed rule at runtime**: any `actions:` entry (and any `starting_actions` entry, defense-in-depth) with a status other than `action-required` | `blocked` throws `WorkflowEngineError` — build validation can't see payloads, so the runtime check is what makes the rule real for the override path.

**`WorkflowAPI/CancelWorkflow/CancelWorkflow.js`** — restructure:

- Load: workflow + all actions.
- Plan: mark all **non-terminal** actions `not-required` via FSM signal `internal_cancel_action`; recompute; push `cancelled` onto workflow status; event = `workflow-cancelled` (workflow-lifecycle context). **Done actions are preserved** (their status stays `done`).
- Commit; tracker cascade.

**`WorkflowAPI/CloseWorkflow/CloseWorkflow.js`** — same shape as Cancel; event = `workflow-closed`.

**Lifecycle preconditions live here, not in `loadWorkflowState`** (task 9's stage check is Submit-specific). Preserve today's actual semantics, no new guards: Close on a `completed` workflow is an **idempotent no-op** (returns the empty result, `CloseWorkflow.js:52–54`); Close on a `cancelled` workflow **throws** — now `WorkflowEngineError` with `code: "stage_rejects_close"` (D13). Cancel deliberately has **no stage guard** today (cancelling a completed workflow is unguarded) — keep it that way per "build for what exists". Start inserts a fresh workflow doc, so it has no started-already check; its config-shaped preconditions (unknown `workflow_type`, keyed `starting_actions`, tracker-parent checks) carry over from the current handler.

**Event emission (per the "Engine entry points emit events" table):** one `event_id` per invocation, used as the dispatched event doc's `_id`. Workflow-lifecycle context only (`{ user, workflow, signal }`) — `planEventDispatch` already branches on type (task 12).

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
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — restrict `starting_actions[].status` to the two legal seeds `action-required` | `blocked` (one line next to the existing `ACTION_STATUSES` membership check, which currently accepts all eight statuses — Part 45 review 2 #2).
- `shared/fsm/tables.js` + `tables.test.js` — add the tracker `none` row (`activate → action-required`, `block → blocked`) per the updated state-machine.md "Creation" section (Part 45 review 1 #2 reversed the tracker exclusion so pre-hooks can conditionally spawn trackers); the test currently asserts the tracker has no `none` row — flip it.

## Notes

- These handlers import the shared phase functions and must be migrated in lockstep with task 15's deletion of `shared/createAction.js` / `updateAction.js` / `recomputeWorkflowAfterActionWrite.js` (they were the prior call sites). Coordinate so the build never breaks.
- No pre-hook for Start/Cancel/Close in v1 (could add later — not now, per "Build for what exists").
- `internal_cancel_action` must exist in the FSM tables (task 2) for the relevant kinds.
