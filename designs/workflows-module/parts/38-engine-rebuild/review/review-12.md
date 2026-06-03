# Review 12 — Task 16: Tracker cascade loop

Scope: `tasks/16-tracker-cascade.md`, verified against design.md (D3, D9–D11,
D13, D15, data flow, "Engine entry points emit events"), the code it rewrites
(`SubmitWorkflowAction/fireTrackerSubscription.js` and its importers
`handleSubmit.js`, `CancelWorkflow.js`, `CloseWorkflow.js`), the **landed**
Band-3 code (`shared/phases/loadWorkflowState.js`, `shared/phases/types.js`,
`planners/planActionTransition.js` — real signatures, tasks 9–11 are done),
and tasks 10, 12, 13, 15, 17.

Prior coverage checked and not repeated: review-1 #7 (depth = chain depth, not
fan-out — resolved into the task), review-8 #8 (empty-plan skip owned by the
caller — resolved), review-8 #4 / task 13 (dispatch-error defer-throw policy —
resolved), consistency-8 #2 (`TrackerCascadeDepthError` joins the D13 model —
resolved), review-9 #5 (mirror event `type` derivation — task 12's side of the
seam), review-11 #1 (`trackerFires` has no producer; `parentWorkflowId` not
purely derivable — **still open**; extended by finding 4 below, not re-filed),
review-11 #2 (handler return payload unpinned — the cascade-return half lands
here as part of finding 3), review-11 #6 (`getActionFields.js` disposition
pointer to tasks 16/17 — carried as finding 6).

## Correctness

### 1. Per-level invocation inputs are unspecced — reusing the base `event_id` collides on the event doc `_id`

> **Resolved.** Each cascade level is its own invocation for the mint: fresh `event_id` per level (`randomUUID()`); `now` stays the single per-request `connection.changeStamp` shared across all levels (one user action = one timestamp — matches today's recursion sharing `context.changeStamp`, keeps the stamp app-overridable, matches transaction-time semantics standard in Postgres/SQL Server temporal tables/`$$NOW`); the `newId` factory passes through unchanged (each call already returns a fresh uuid). Both sketch copies (task 16 + D10) replace `/* per-level overrides */` with the real mint, `planTrackerLevel`'s signature widens to accept injected `{ event_id, now, newId }`, and task 16 + D10 prose pin the rationale.

Each cascade level is its own invocation: design ("Engine entry points emit
events") says "Tracker-mirror commits per cascade level each generate their
own `event_id`," and the level's planners require it — the landed
`planActionTransition` takes injected `{ event_id, now, newId }`
(`planActionTransition.js:54–59`), and `planEventDispatch` uses `event_id` as
the event doc `_id` (task 12). Task 16's only nod to any of this is the
`/* per-level overrides */` comment in the sketch; `planTrackerLevel`'s
stated signature — `(levelLoaded, { parentActionId, signal })` — carries none
of these inputs.

An implementer who threads `baseContext`'s mint through unchanged produces a
concrete failure: level 1's `new-event` dispatch reuses the originating
submit's `event_id` as `_id` → duplicate-key on the events collection → a
step-3 dispatch failure recorded on every cascade-bearing invocation → every
such submit ends in `post_commit_dispatch_failed`. It also breaks the
one-`event_id`-per-invocation invariant on the parent's `status[]` entries
(the parent tracker action's status entry would point at the *child* submit's
event).

Fix: spec that the loop runs the task-15 shared invocation-setup step per
level — fresh `event_id` and `newId` per level; `now` stays the single
per-request `connection.changeStamp` (today's recursion shares
`context.changeStamp` the same way) — and widen `planTrackerLevel`'s signature
to accept the injected `{ event_id, now }` like every other planner.

### 2. A mid-cascade `ConcurrentSubmitError` strands committed fires and surfaces as a falsely-retryable error

> **Resolved.** As recommended: bounded per-level CAS retry inside the cascade — 3 attempts, each a full fresh load → plan → commit (nothing stale re-issued; the level's `event_id` reused safely since a CAS miss writes nothing; a concurrent advance of the tracker action itself resolves to an FSM-no-op skip on re-plan). Tracker levels are pinned as the one engine site where auto-retry is safe by construction (no pre-hook, deterministic planner — D15's non-idempotence argument doesn't apply; D15 now carries the exception note). On exhaustion the fire records `{ fire, error }` on the cascade's error accumulation (shared with finding 4's gone-parent policy) and the cascade continues, surfacing via the handler's end-of-invocation `post_commit_dispatch_failed` throw. The asymmetry is written down: `TrackerCascadeDepthError` and unclassified errors propagate immediately — a depth cycle is a structural config bug (D13 defensive gate), and the loop's catch is a closed set (`concurrent_submit`, `workflow_not_found`, `missing_target`). Spec'd in task 16 + D10.

Task 16 line 28: "only a steps-1–2 throw (e.g. `ConcurrentSubmitError`)
propagates." For a cascade level, that policy reproduces exactly the failure
mode the dispatch-error policy was designed to prevent. Task 13's own
rationale for never throwing on steps 3–5: "a propagated throw would strand
`plan.trackerFires` (a committed child completion that never mirrors to its
parent — unrecoverable, since a retry CAS-misses against the advanced state)
and skip the post-hook." A `ConcurrentSubmitError` at level k of the cascade
does precisely this — `pendingFires` (level k itself plus everything queued
behind it) is dropped, and the post-hook never runs — yet the policy treats
it as an ordinary propagating throw.

Worse, the error reaching the caller is mislabeled. D15 frames
`ConcurrentSubmitError` as "the retryable case," but the caller's submit
**already committed** (the cascade runs after `commitPlan` succeeded). A
retry of the original submit re-loads the advanced state, the user signal
FSM-no-ops against the already-transitioned action, and `planActionTransition`
throws `signal_not_allowed` (task 10 / D13 (3)). So the one documented
recovery for this error cannot recover it, and the mirror is permanently
lost. This isn't a rare corner: the parent workflow is a live workflow other
users submit against — concurrent writes there are the *expected* CAS case.

Fix — decide the policy in the design, don't leave it to the implementer.
The clean option: **per-level bounded retry inside the cascade**. On a CAS
miss, re-run the level (re-load → re-plan → re-commit; the fire entry is
still valid). D15's argument against engine auto-retry — "each retry runs the
pre-hook again, which may have non-idempotent side effects" — does not apply
here: tracker levels have no pre-hook and `planTrackerLevel` is deterministic,
so the retry is side-effect-safe by construction. Bound it (e.g. 3 attempts),
and on exhaustion record `{ fire, error }` on the cascade's error accumulation
(finding 3) and **continue with the remaining fires**, folding the failure
into the handler's end-of-invocation throw alongside `dispatchErrors` — the
same "committed work always finishes; failures surface at the end" shape the
rest of the invocation already follows. While here, state explicitly that
`TrackerCascadeDepthError` *does* propagate immediately (a depth cycle is a
config bug, not a transient race) — the asymmetry is correct but should be
written down.

## Spec gaps

### 3. The loop sketch contradicts the task's own prose — and the cascade's return shape is still unpinned

> **Resolved.** Both sketch copies (task 16 + D10) rewritten to the full corrected loop: per-level bounded CAS retry (finding 2), the closed catch set with `{ fire, error }` recording (findings 2/4), the FSM-no-op skip via `levelPlan === null`, dispatch-error accumulation, and a `{ fires, dispatchErrors, cascadeErrors }` return. No-op convention pinned: `planTrackerLevel` returns `null`, mirroring `planActionTransition`'s landed convention (D3 + task 16 wording aligned from "returns an empty plan"). Per-fire entry keeps today's `{ parent_action_id, parent_workflow_id, new_status }` shape via the plan's `fired` entry, composed by `planTrackerLevel` (review-11 #2 had pinned the consumer contract). Task 15's end-of-invocation throw and the D13 error-model sentence now key on **either** error list being non-empty.

Three behaviours the task text requires are absent from the normative-looking
sketch (lines 11–24), which is duplicated verbatim in design.md D10:

- **No empty-plan skip.** The sketch unconditionally calls
  `commitPlan(levelContext, levelPlan)`; the task's own no-op bullet (line 34)
  and acceptance criterion say the loop "skips `commitPlan` for that level
  entirely." The sketch needs the `if (isEmptyPlan(levelPlan)) continue;`
  branch — and should pin *how* the loop detects it (e.g. `planTrackerLevel`
  returns `null`, mirroring `planActionTransition`'s no-op convention), since
  D3 makes the caller own the skip.
- **No error accumulation.** `commitResult` is assigned and never used; the
  prose says the cascade "accumulates these across levels and returns them."
- **No return value.** The function returns nothing, yet task 15's handler
  needs two things from it: the accumulated `dispatchErrors` (for the
  `post_commit_dispatch_failed` throw) and the fire chain for the handler's
  `tracker_fired` payload key (review-11 #2 — the emitted Api's `:return`
  block maps `tracker_fired`, `makeWorkflowApis.js:82–89`; today's
  `fireTrackerSubscription` returns
  `[{ parent_action_id, parent_workflow_id, new_status }]` to feed it).

Fix: update both sketch copies (task 16 + design.md D10) to accumulate and
return `{ fires, dispatchErrors }`, and pin the per-fire entry shape —
keeping today's `{ parent_action_id, parent_workflow_id, new_status }` keys
(with `new_status` = the FSM-resolved parent stage) preserves the existing
`tracker_fired` consumer contract without a task-19 surface change.

### 4. `planTrackerLevel`'s target/config resolution and missing-parent policy are unspecced

> **Resolved.** Resolution half as recommended: task 16 now specs that `planTrackerLevel` locates `fire.parentActionId` within `levelLoaded.actions` and resolves its config from `workflowConfig.actions` (throwing `missing_target` when gone — the planner keeps planner throw semantics; the loop owns the policy). Policy half **deviates from the recommendation**: instead of preserving today's silent skip, a gone parent (`workflow_not_found` on the level's load, missing action doc, or action type absent from config — also covering the parent-workflow-deleted sub-case the finding didn't name) records `{ fire, error }` on the cascade's error accumulation, skips the level, continues remaining fires, and surfaces via the handler's end-of-invocation `post_commit_dispatch_failed` throw. Rationale: a dangling parent reference has no legitimate producing flow (an early-closed parent still has its tracker action — that's the FSM-no-op case, which stays silent), so it's a data bug made visible rather than a quiet mirror-chain stop; the committed submit is never aborted for it. Spec'd in task 16 + D10; test case for the branch carried into the AC.

The landed `loadWorkflowState` in `{ workflowId }` mode returns only
`{ workflow, actions, workflowConfig }` — no `targetAction`, no `actionConfig`
(`loadWorkflowState.js:120–122`; the doc comment says so explicitly). But
`planActionTransition` *requires* `actionConfig` (and `entry_id`,
`loadedWorkflow`) as inputs. So `planTrackerLevel` must itself locate
`fire.parentActionId` within `levelLoaded.actions` and resolve its config
from `workflowConfig.actions` — work the Submit path gets from the load phase.
The task never says this, and its `planTrackerLevel(levelLoaded, { … })`
signature hides it.

The unspecced half that matters is the failure policy. Today's code silently
stops the chain when the parent action doc is missing
(`fireTrackerSubscription.js:53–57`, `if (!tracker) return []`). Under D13,
"missing target" throws — but that rule was written for *pre-hook* entries
(D13 (2)); cascade signals are the deliberately-permissive class (D13 (3)).
Recommend: a fire whose `parentActionId` matches no doc (or whose action type
is no longer in the workflow config) **skips that level silently**, preserving
today's semantics and the cascade's structural-safety stance — but write it
down either way, plus a matching test case (the current
`fireTrackerSubscription.test.js` covers this branch; the rewrite shouldn't
lose it).

### 5. The producer gap (review-11 #1) recurses — `planTrackerLevel` is also a fire producer

> **Resolved (auto).** Superseded by review-11 #1's resolution, which chose a third option (not (a)/(b)): workflow docs gain a denormalised `parent_workflow_id` stamped by Start, so fires at every level — cascade levels included — are composed purely from the loaded parent workflow's own `parent_action_id`/`parent_workflow_id` (D3 producer rule; task 16 Notes already state per-level fires recurse identically). The residual half is now specced: task 16 Notes pin the next-level fire's `signal` as the constant `internal_mirror_child_completed` (the only stage a level's recompute can push is `completed`).

Not re-filing review-11 #1, but its resolution must account for this task's
side of it: the sketch reads `levelPlan.trackerFires`, so `planTrackerLevel`
must *produce* next-level fires when the parent's recompute pushes
`completed` and `levelLoaded.workflow.parent_action_id != null` — and the
grandparent's `parentWorkflowId` has the same not-purely-derivable problem at
every level (it's the `workflow_id` of an action doc in a workflow this
level's load never read). That recursion is the strongest argument for
review-11 #1's option (a): fires carry `parentActionId` only, and
`runTrackerCascade` — already the impure orchestration layer — resolves
`parentActionId → parentWorkflowId` with one `findDocs` read at the top of
each level. One mechanism then serves Submit, Start, Cancel/Close (task 17),
*and* every cascade level. Whichever option is chosen, also spec the
next-level fire's `signal` derivation in `planTrackerLevel`: an auto-complete
push emits `internal_mirror_child_completed` (the only stage a recompute can
push is `completed`, so it's a constant — say so).

## Minor

### 6. File home and leftover-helper dispositions

> **Resolved (auto).** File home made explicit: task 16 and design.md (shared/phases list + "Rewritten" entry) now relocate the loop to `shared/phases/runTrackerCascade.js`, with the old file + test deleted once consumers rewire. `CHILD_STAGE_MAP` note added to task 16 — with a factual correction: its only external importer is its own test file (`handleSubmit.js`/`CancelWorkflow.js`/`CloseWorkflow.js` import only the default export), so nothing needs re-pointing; the export still dies, superseded by the FSM tracker table. The `getActionFields.js` disposition was already settled by review-11 #6 (deletion entry in task 17 line 44, pointer note in task 15).

- The task keeps the rewritten loop at
  `WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` ("rename file
  if appropriate"). Its consumers are Submit (task 15) **and** Start/Cancel/
  Close (task 17) — today `CancelWorkflow.js` and `CloseWorkflow.js` already
  import it from the Submit directory. The rebuild's own layout principle
  (D2/D8: phase functions live where the phase layer is) says this
  cross-handler orchestrator belongs at `shared/phases/runTrackerCascade.js`.
  Make the move explicit rather than "if appropriate."
- `CHILD_STAGE_MAP` (exported from `fireTrackerSubscription.js`) is imported
  by `handleSubmit.js`, `CancelWorkflow.js`, `CloseWorkflow.js`, and
  `recomputeWorkflowAfterActionWrite.js`. The FSM tracker table supersedes it;
  note in this task that the export disappears so the task-17 rewrites don't
  try to keep importing it.
- `shared/getActionFields.js` (review-11 #6): after this rewrite its only
  remaining importer is `StartWorkflow.js` (plus the deleted
  `utils/getCurrentAction.js`). Add the disposition pointer here or in
  task 17 — currently neither lists it.

## Summary

Findings 1 and 2 are the load-bearing ones. Finding 1 is a guaranteed runtime
failure (duplicate event `_id` on every cascade) if the per-level mint isn't
specced — the task's `/* per-level overrides */` comment is exactly the
"verify at code time" punt the project rejects. Finding 2 is a policy hole:
the cascade's one realistic concurrency failure currently strands committed
mirrors and hands the caller an error whose documented recovery cannot work;
tracker levels are the unique place where engine auto-retry is safe, and the
design should say so. Findings 3–5 close the gap between the task's prose,
its sketch, and the landed phase signatures; 6 is disposition bookkeeping.
