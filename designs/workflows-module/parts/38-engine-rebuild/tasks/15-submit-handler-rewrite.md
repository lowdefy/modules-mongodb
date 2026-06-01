# Task 15: Rewrite `SubmitWorkflowAction` around phases

## Context

With all phases built (load 9, action planners 10, workflow planners 11, event/notification/changelog planners 12, commit 13, hook wrappers 14), the Submit handler collapses from today's 11-step mutable-`context` flow into a phase composition. This is the reference handler; the tracker cascade (task 16) and Start/Cancel/Close (task 17) follow the same shape.

This task also **deletes the obsolete files** the rebuild replaces.

## Task

**Rewrite `WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js` + `handleSubmit.js`** as:

```
load (loadWorkflowState — incl. per-verb access gate)
  → invokePreHook
  → planSubmit (composition of the planners)
  → commitPlan
  → runTrackerCascade   // task 16 provides this; wire the call site
  → invokePostHook
  → return handler payload
```

`planSubmit` composes the plan phase (a new orchestrator, e.g. `shared/phases/planSubmit.js`, or inline in the handler — prefer a named planner orchestrator for testability):

1. Resolve current-action signal → target stage (FSM).
2. Resolve auxiliary signals (`preHookResult.actions[]`) → target stages (FSM).
3. Initial planned action transitions (current + auxiliary) via `planActionTransition`.
4. Auto-unblock fixpoint via `planAutoUnblock`.
5. `planWorkflowRecompute` + `planFormDataMerge` → planned workflow doc.
6. Per planned action: compose doc, render cell, compute per-verb links (already inside `planActionTransition`).
7. `planEventDispatch` (action-event context).
8. `planNotifications`.
9. `planChangeLog`.
10. Assemble the `Plan` object.

**Delete the obsolete files:**

- `shared/createAction.js` (→ `planActionTransition`)
- `shared/updateAction.js` (→ `planActionTransition`)
- `shared/recomputeWorkflowAfterActionWrite.js` (→ `planWorkflowRecompute`)
- `SubmitWorkflowAction/utils/shouldUpdate.js` (priority rule — obsolete)
- `SubmitWorkflowAction/resolveTargetStatus.js` (interaction→status table — obsolete; FSM replaces it)
- `SubmitWorkflowAction/computeAutoUnblocks.js` (→ `planAutoUnblock`)
- `SubmitWorkflowAction/reevaluateBlockedActions.js` (→ `planAutoUnblock`)
- `SubmitWorkflowAction/utils/getCurrentAction.js` (load reads all actions in one call)
- `SubmitWorkflowAction/dispatchLogEvent.js` (dispatch → commit; template constants → `planEventDispatch`)

Also remove their `.test.js` files and any now-dangling imports/helpers (`mergeEventOverrides`, `mergeFormOverrides`, `mergePreHookActions`, `recomputeGroups`, `deriveGroupStatus`, `shouldCreate`) — audit each: keep and relocate the ones the planners reuse (e.g. `mergeEventOverrides` for `planEventDispatch`, group-status derivation for `planWorkflowRecompute`), delete the ones fully superseded.

## Acceptance Criteria

- `SubmitWorkflowAction` runs load → pre-hook → plan → commit → tracker cascade → post-hook with no mutable shared `context` doc-mirroring.
- All listed obsolete files are deleted; no dangling imports remain; the plugin builds.
- Renders happen only in the plan phase against the planned post-commit shape — no re-fetch, no in-memory mirroring.
- The integration test `SubmitWorkflowAction.test.js` passes the Part 30 worked-example assertions (rendered cells at top level, sticky display across transitions, per-verb links per stage×verb, status_title persistence) plus CAS-miss retryable throw and the **retry-no-double-transition** assertion (submit → force concurrent write → CAS miss → retry → action `status[]` gained exactly one entry).
- Submit-time per-verb gate covered (submit↔edit, approve/request_changes↔review, resolve_error↔error); action-global `hasReview` resolution covered (multi-app action: review-declaring-app submit and other-app submit land the same `in-review`).

## Files

- `WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js` — rewrite
- `WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — rewrite
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.js` — create (plan orchestrator)
- Deletions listed above (+ their tests) — delete
- `WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.test.js` — create/rewrite (integration)

## Notes

- Q4 (recursive submits via pre-hooks): document the gotcha; CAS catches real conflicts (the outer commit fails with `ConcurrentSubmitError`, caller retries). Do not add explicit pre-hook-callback detection.
- The handler call into `runTrackerCascade` comes from task 16 — if tasks land out of order, stub the call and wire it when task 16 lands.
- Before deleting each `shared/*` helper, grep for importers across `StartWorkflow`/`CancelWorkflow`/`CloseWorkflow` — those handlers (task 17) must already be migrated or migrate in lockstep, or the build breaks.
