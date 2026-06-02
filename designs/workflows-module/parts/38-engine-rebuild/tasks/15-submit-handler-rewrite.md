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

**Mint the per-invocation id/clock at handler entry.** Before `load`, the handler mints `{ event_id, now, newId }` **once per invocation** — `event_id` (`randomUUID()`), `now` (the change stamp), and `newId` (an id source for insert `_id`s) — mirroring today's `context.eventId` / `context.changeStamp`, and threads them into the plan inputs. These are nondeterministic, so they are generated here (an impure boundary) and **injected** into the pure planners (task 10), never generated inside them; `event_id` is reused on every action `status[]` entry and as the dispatched event doc's `_id` (task 12). The same invocation-setup step also threads the four request-context fields `{ blockId, connectionId, pageId, requestId }` from `lowdefyContext` into the engine context — `planChangeLog` (task 12) stamps them onto every `log-changes` entry, and the producer is this step (D7: `callRequestResolver` passes them to every connection resolver; `undefined` when an invocation lacks a page/block, same as the community plugin). Mint via a small shared invocation-setup step so Start/Cancel/Close (task 17) do it identically — one correct way; the request-context threading applies to task 17's handlers via the same shared setup.

**Surface post-commit dispatch failures after the post-hook.** `commitPlan` never throws for its steps 3–5 — it records failures on `commitResult.dispatchErrors[]` (task 13 failure policy), and `runTrackerCascade` collects each level's `dispatchErrors` (task 16). After the post-hook returns, the handler throws `WorkflowEngineError` with `code: "post_commit_dispatch_failed"` when any were recorded — message stating the commit **succeeded** and naming the failed steps, `{ cause }` chaining the first recorded error (D13). The cascade and post-hook always run first; the throw is last, so the only thing a dispatch failure costs the caller is the success payload — never committed state work — while still surfacing through Lowdefy's error reporting (no engine side-channel logging to invent).

`planSubmit` composes the plan phase (a new orchestrator, e.g. `shared/phases/planSubmit.js`, or inline in the handler — prefer a named planner orchestrator for testability):

1. Resolve current-action signal → target stage (FSM).
2. Resolve auxiliary signals (`preHookResult.actions[]`) → target stages (FSM).
3. Initial planned action transitions (current + auxiliary) via `planActionTransition`.
4. Auto-unblock fixpoint via `planAutoUnblock`.
5. `planWorkflowRecompute` + `planFormDataMerge` → planned workflow doc.
6. Per planned action: compose doc, render cell, compute per-verb links (already inside `planActionTransition`).
7. `planEventDispatch` (action-event context).
8. `planChangeLog`.
9. Assemble the `Plan` object. (No notification planning — notifications dispatch post-commit in the commit phase, task 13 step 4.)

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

Also remove their `.test.js` files and any now-dangling imports/helpers (`mergeEventOverrides`, `mergeFormOverrides`, `mergePreHookActions`, `shouldCreate`, `utils/buildHookPayload` — the latter relocated to `shared/phases/` by task 14; verify no stale copy remains under `SubmitWorkflowAction/utils/`) — audit each: keep and relocate the ones the planners reuse (e.g. `mergeEventOverrides` for `planEventDispatch`), delete the ones fully superseded. (`recomputeGroups` / `deriveGroupStatus` are already relocated to `shared/phases/planners/` by task 9 — verify no stale copies or imports remain under `SubmitWorkflowAction/`.)

## Acceptance Criteria

- `SubmitWorkflowAction` runs load → pre-hook → plan → commit → tracker cascade → post-hook with no mutable shared `context` doc-mirroring.
- All listed obsolete files are deleted; no dangling imports remain; the plugin builds.
- Renders happen only in the plan phase against the planned post-commit shape — no re-fetch, no in-memory mirroring.
- The integration test `SubmitWorkflowAction.test.js` passes the Part 30 worked-example assertions (rendered cells at top level, sticky display across transitions, per-verb links per stage×verb, status_title persistence) plus CAS-miss retryable throw and the **retry-no-double-transition** assertion (submit → force concurrent write → CAS miss → retry → action `status[]` gained exactly one entry).
- Submit-time per-verb gate covered (submit↔edit, approve/request_changes↔review, resolve_error↔error); action-global `hasReview` resolution covered (multi-app action: review-declaring-app submit and other-app submit land the same `in-review`).
- A forced commit step-4/5 failure still runs the tracker cascade and post-hook, then the handler throws `post_commit_dispatch_failed` (message states the commit succeeded; failed steps named; cause chained).

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
