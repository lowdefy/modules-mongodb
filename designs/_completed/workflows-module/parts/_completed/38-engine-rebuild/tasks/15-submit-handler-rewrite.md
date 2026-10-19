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

**Mint the per-invocation id/clock at handler entry.** Before `load`, the handler mints `{ event_id, now, newId }` **once per invocation** — `event_id` (`randomUUID()`), `now` (the change stamp), and `newId` (an id source for insert `_id`s) — mirroring today's `context.eventId` / `context.changeStamp`, and threads them into the plan inputs. `event_id` and `newId` are **generated** here (`randomUUID()`); `now` is **read, not generated** — it is `connection.changeStamp`, the events-module `change_stamp` component wired in `workflow-api.yaml`, already evaluated per request by Lowdefy (one stamp per invocation, all writes share it, per the `WorkflowAPI/schema.js` description — do not construct `{ timestamp: new Date(), user }` in the handler, which would change the stamped user shape and bypass the app-configurable stamp). All three are nondeterministic at this boundary (an impure boundary) and **injected** into the pure planners (task 10), never generated inside them; `event_id` is reused on every action `status[]` entry and as the dispatched event doc's `_id` (task 12). The same invocation-setup step also threads the four request-context fields `{ blockId, connectionId, pageId, requestId }` from `lowdefyContext` into the engine context — `planChangeLog` (task 12) stamps them onto every `log-changes` entry, and the producer is this step (D7: `callRequestResolver` passes them to every connection resolver; `undefined` when an invocation lacks a page/block, same as the community plugin). Mint via a small shared invocation-setup step so Start/Cancel/Close (task 17) do it identically — one correct way; the request-context threading applies to task 17's handlers via the same shared setup.

**The same setup step owns the full engine-context composition** — no other task calls `getMongoDb` (task 1), so this is where the engine context gets built: `await getMongoDb(connection)` → `{ mongoDb, mongoClient, useTransactions }` (consumed by the load phase's `findDocs`, the commit helpers, `commitPlan`'s `startSession`, and the D11 transaction branch), plus `callApi`, `user`, `connection`, `params`, `workflowsConfig`, the `{ event_id, now, newId }` mint, and the four request-context fields above. `getMongoDb` is **async** (first use awaits `connect` + the `hello` topology probe, D11) — call it at handler entry, never at module scope. The rebuilt Submit context **no longer carries `mongoDBConnection`** (the community wrapper `SubmitWorkflowAction.js` wires today): loads go through `findDocs` and hooks/events/notifications through `callApi`, so nothing in the rebuilt path needs it — drop the `createMongoDBConnection` import with the rewrite. Task 17's handlers compose their context via this same shared setup step.

**Pin the handler return payload — today's six keys verbatim**, matching the emitted per-action Api's `:return` block (`makeWorkflowApis.js:82–89`, which task 19 does **not** touch): `{ action_ids, completed_groups, event_id, tracker_fired, pre_hook_response, post_hook_response }`. `action_ids` from `CommitResult`; `completed_groups` from `plan.completedGroups` (planSubmit step 5); `event_id` the per-invocation mint (singular end-to-end — review-8 #9); `tracker_fired` from `runTrackerCascade`'s returned fire list (today's shape `[{ parent_action_id, parent_workflow_id, new_status }]` — task 14/16). `_step` lookups of missing keys resolve to nothing **silently**, so a drifted return shape ships `undefined` to every consuming app with no failing test — the integration test must assert all six keys.

**Return payload hook fields:** `pre_hook_response` surfaces the pre-hook wrapper's normalized `PreHookResult` verbatim — always `{ actions, event_overrides, form_overrides }`, empty when no hook declared; never `null` (review-10 #9 — the old `null` no-hook surface is dropped; no consumer reads the field). `post_hook_response` surfaces the post-hook's return (task 14).

**Surface post-commit dispatch failures after the post-hook.** `commitPlan` never throws for its steps 3–5 — it records failures on `commitResult.dispatchErrors[]` (task 13 failure policy), and `runTrackerCascade` returns each level's accumulated `dispatchErrors` plus its own `cascadeErrors` (`[{ fire, error }]` — CAS-retry exhaustion and gone parents, task 16). After the post-hook returns, the handler throws `WorkflowEngineError` with `code: "post_commit_dispatch_failed"` when **either list** is non-empty — message stating the commit **succeeded** and naming the failed steps, `{ cause }` chaining the first recorded error (D13). The cascade and post-hook always run first; the throw is last, so the only thing a dispatch failure costs the caller is the success payload — never committed state work — while still surfacing through Lowdefy's error reporting (no engine side-channel logging to invent).

`planSubmit` composes the plan phase (a new orchestrator, e.g. `shared/phases/planSubmit.js`, or inline in the handler — prefer a named planner orchestrator for testability):

1. Compose the transition-entry list: the current action with `source: 'user'`, plus one entry per `preHookResult.actions[]` item with `source: 'auxiliary'`, carrying `upsert`/`key` and the entry's optional `fields?` / `metadata?` (the data-seeding channel, state-machine.md path 3 / review-10 #3) as that target's `payload.fields` / `payload.metadata` — seeding spawned docs and applying to existing-target transitions alike.
2. Hand each entry to `planActionTransition` — it resolves the signal via `resolveSignal` internally (landed task-10 signature: it takes `signal` + `source`); the orchestrator does **not** pre-resolve signals.
3. Auto-unblock fixpoint via `planAutoUnblock`.
4. `planFormDataMerge` → merged `form_data`; then `planWorkflowRecompute` (which takes the merged `formData` as an input — landed task-11 signature) → planned workflow doc.
5. Compose `completedGroups` (the group on_complete fan-out contract): diff loaded `workflow.groups` vs planned `groups` — each group whose status became `done` emits `{ workflow_id, id, on_complete }`, `on_complete` joined from `workflowConfig.action_groups` (today's `handleSubmit.js:273–288` diff). Carried on the Plan (D3) for the handler return payload + the post-hook `result` bag (task 14).
6. Per planned action: compose doc, render cell, compute per-verb links (already inside `planActionTransition`).
7. `planEventDispatch` (action-event context).
8. `planChangeLog`.
9. Compose `trackerFires` (D3 producer rule): **iff** `planWorkflowRecompute` pushed `completed` **and** `loadedState.workflow.parent_action_id != null`, emit one fire `{ parentWorkflowId: workflow.parent_workflow_id, parentActionId: workflow.parent_action_id, signal: 'internal_mirror_child_completed' }`; else `[]`. Mirrors today's `shouldPushCompleted` gate (`handleSubmit.js:343–348`) and no-parent short-circuit. Both ids read off the **loaded workflow doc** — `parent_workflow_id` is the schema addition `StartWorkflow` stamps (design "Schema additions"); no cross-workflow read in the pure plan.
10. Assemble the `Plan` object. (No notification planning — notifications dispatch post-commit in the commit phase, task 13 step 4.)

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
- `shared/getActions.js` (+ test) — its only importers are `handleSubmit.js` (rewritten here) and `recomputeWorkflowAfterActionWrite.js` (deleted here); dead after this task. (Covered by the task-17 lockstep grep note below — no other handler imports it.)

Also remove their `.test.js` files and any now-dangling imports/helpers. The helper dispositions are design-settled — no implementation-time audit:

- `mergeEventOverrides` — **kept**, relocated to `shared/` by task 12 (D14); verify no stale copy remains under `SubmitWorkflowAction/`.
- `mergeFormOverrides` — **delete** (+ test); superseded by Q6's uniform deep-merge (the landed `planFormDataMerge` does not import it).
- `mergePreHookActions` — **delete** (+ test); folds into `planSubmit`'s entry composition (design.md Deleted list).
- `shouldCreate` — **delete** (+ test); folded into `planActionTransition` operation selection (design.md Deleted list).
- `utils/buildHookPayload` — relocated to `shared/phases/` by task 14; verify no stale copy remains under `SubmitWorkflowAction/utils/`.

(`recomputeGroups` / `deriveGroupStatus` are already relocated to `shared/phases/planners/` by task 9 — verify no stale copies or imports remain under `SubmitWorkflowAction/`. `shared/getActionFields.js` is **not** deleted here — its importers are `fireTrackerSubscription.js` and `StartWorkflow.js`; task 17 owns its deletion once both are migrated.)

## Acceptance Criteria

- `SubmitWorkflowAction` runs load → pre-hook → plan → commit → tracker cascade → post-hook with no mutable shared `context` doc-mirroring.
- The handler returns exactly today's six-key payload (`action_ids`, `completed_groups`, `event_id`, `tracker_fired`, `pre_hook_response`, `post_hook_response`) — asserted by the integration test, including a `completed_groups` entry (with joined `on_complete`) when a submit completes a group.
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
- `WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.test.js` — create/rewrite (integration; the single home for Submit integration coverage — absorbs the salvage below)
- `WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — **delete after salvage.** Most cases test deleted behaviour (priority rule, `resolveTargetStatus`, the removed action-wide `access.roles` check) and die with it; `required_after_close` is already mirrored in task 9's load tests and the upsert planner split in task 10's. Salvage into `SubmitWorkflowAction.test.js` the surviving integration behaviours **not** pinned by the task 9–14 unit tests: pre-hook auxiliary-signal flows end-to-end (incl. the `upsert: true` spawn over the wire), form-data merge end-to-end, and `completed_groups` with the `on_complete` join (also an AC above).
- `WorkflowAPI/SubmitWorkflowAction/worked-example.test.js` — **delete, folded.** Its Part 30 worked-example assertions are the ones the AC already requires of `SubmitWorkflowAction.test.js`, re-driven through the new payload grammar (`signal:`, per-verb `access` maps — the old `interaction:` / shorthand-array payloads can't pass).
- `WorkflowAPI/SubmitWorkflowAction/event-id-round-trip.test.js` — **delete, folded as a named assertion block.** The one-`event_id`-per-invocation round trip (`status[]` entries ↔ event doc `_id`) is now a designed invariant (D3 / task 12); preserve it as an explicitly named test in `SubmitWorkflowAction.test.js`, not a silent deletion.

## Notes

- Q4 (recursive submits via pre-hooks): document the gotcha; CAS catches real conflicts (the outer commit fails with `ConcurrentSubmitError`, caller retries). Do not add explicit pre-hook-callback detection.
- The handler call into `runTrackerCascade` comes from task 16 — if tasks land out of order, stub the call and wire it when task 16 lands.
- Before deleting each `shared/*` helper, grep for importers across `StartWorkflow`/`CancelWorkflow`/`CloseWorkflow` — those handlers (task 17) must already be migrated or migrate in lockstep, or the build breaks.
