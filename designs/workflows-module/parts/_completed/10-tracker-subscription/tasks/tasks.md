# Implementation Tasks — Part 10: Tracker subscription

## Overview

Mirror child workflow status changes onto the parent tracker action, synchronously and in-process, with multi-level recursion through the parent chain. Lands one shared post-write recompute helper extraction (so the tracker recursion can reuse `handleSubmit`'s sub-steps 4a/4b/4c/5 on a different workflow), one new engine helper (`fireTrackerSubscription` with the child-stage map, same-stage guard, `updateAction(force:true)` parent write, depth-limit guard, and recursion), and in-place wirings in two shipped handlers (`handleSubmit` step 10, `CancelWorkflow` after the writeback). Derived from `designs/workflows-module/parts/10-tracker-subscription/design.md`.

## Tasks

| #   | File                                       | Summary                                                                                                                                                                | Depends On |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-extract-recompute-helper.md`           | Extract sub-steps 4a/4b/4c/5 from `handleSubmit` into `shared/recomputeWorkflowAfterActionWrite.js`. Pure refactor; existing tests pass unchanged.                     | —          |
| 2   | `02-fire-tracker-subscription.md`          | `fireTrackerSubscription.js` — `CHILD_STAGE_MAP`, same-stage guard, parent `updateAction(force:true)` write, parent recompute via task 1's helper, depth-limit recurse. | 1          |
| 3   | `03-wire-into-handle-submit.md`            | Replace `handleSubmit`'s step 10 TODO with the subscription call; swap success-path `tracker_fired: null` for the populated array.                                     | 2          |
| 4   | `04-wire-into-cancel-workflow.md`          | Wire the subscription into `CancelWorkflow` after the final summary + groups writeback; set `context.eventId = null`; swap `tracker_fired: null` literal.              | 2          |
| 5   | `05-multi-level-integration-test.md`       | Multi-level integration coverage: 3-level chain (cache invariant + eventId threading), depth-limit overflow, cancel-path multi-level fan-up.                           | 3, 4       |

## Ordering Rationale

**Foundation refactor first (1).** The helper extraction is a pure refactor — no behaviour change for `handleSubmit`'s existing path, but it's the structural seam that lets the tracker subscription recurse onto a different workflow without re-entering the public handler. Every later task depends on this seam existing. Verified by every existing `handleSubmit.test.js` case continuing to pass.

**Subscription helper next (2).** `fireTrackerSubscription.js` is standalone — it imports `updateAction` (shipped by part 6), `getActionFields` (shipped by part 5), and the new `recomputeWorkflowAfterActionWrite` (task 1). Its own colocated test covers the no-parent, no-tracker, same-stage-guard, single-level, two-level, eventId propagation, and depth-limit-overflow cases at the unit level. No call sites yet.

**Two independent handler wirings (3, 4).** Once task 2 lands the helper, tasks 3 and 4 wire it into the two trigger sites. They touch separate files (`handleSubmit.js` vs `CancelWorkflow.js`) and are independent of each other — can ship in parallel. Each is small (import + one call site + return-shape swap) and lands its own integration cases in the corresponding `*.test.js`.

**Cross-handler integration last (5).** The 3-level chain test exercises the full submit → recompute → tracker → recompute → tracker chain. Needs both wirings landed because the chain crosses through `handleSubmit` at the leaf (which fires the subscription) and the recursion path's recompute helper — there's no value running this test before tasks 3 and 4 ship. The cancel-path multi-level case folds into the same file for symmetry.

**Parallelism:**

- Task 1 must land first (every other task depends on its helper or on `handleSubmit`'s post-refactor shape).
- Task 2 lands after 1.
- Tasks 3 and 4 can run in parallel after 2.
- Task 5 lands last (needs 3 + 4).

### Verification posture

Per the top-level [§ Testing conventions](../../../design.md#testing-conventions): every task ships a colocated `*.test.js` using `inMemoryMongo` (`plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js`) — same convention as every other engine handler test in parts 6, 7, 8.

- **Helper extraction (1)** — colocated `recomputeWorkflowAfterActionWrite.test.js` covers the 4a/4b/4c/5 sequence in isolation; `handleSubmit.test.js` regression coverage is the behaviour-parity guard (every existing case passes unchanged).
- **Subscription helper (2)** — colocated `fireTrackerSubscription.test.js` covers the per-level mechanics (no-parent, no-tracker, same-stage guard, one-level, two-level, eventId propagation, depth-limit overflow with mock-based fixture).
- **Handler wirings (3, 4)** — extend the shipped handler tests with subscription-firing scenarios.
- **Multi-level integration (5)** — adds end-to-end `describe` blocks to `fireTrackerSubscription.test.js` with real 3-level and 11-level fixtures. The 3-level chain subsumes the design's "worked-example 2-level integration test" (design.md Verification) — every 2-level assertion is covered by the 3-level fixture's first level of fan-up.
- **End-to-end coverage** lands in [part 22 — workflows-e2e-suite](../../22-workflows-e2e-suite/design.md). The unit/integration tests here cover the recursion path the Playwright suite can't observe cheaply.

### What's not in scope (deferred per design)

- **Hierarchical cancel propagation** (cancel parent ⇒ cancel children). The subscription only goes child→parent.
- **Multi-parent tracker scenarios.** `StartWorkflow` ([part 5](../../05-start-cancel-handlers/design.md)) enforces one-parent-per-child.
- **Async / change-stream variant.** Concept defers to a follow-up if multi-process writers surface.
- **Hooks on tracker transitions.** Tracker actions never receive user submissions; per-hook contract doesn't apply.
- **Migrating `CancelWorkflow`'s inline workflow-status push** ([CancelWorkflow.js:53–67](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)) **to the shared `pushWorkflowStatus.js` helper from part 7.** The inline push works; the same-stage guard isn't load-bearing for cancel (one-shot from a known `active` state). Not in v1.

## Scope

**Source:** `designs/workflows-module/parts/10-tracker-subscription/design.md`

**Context files considered:**

- `designs/workflows-module-concept/engine/spec.md` — § Tracker subscription (child-stage map, the helper's sketch shape), § Priority rule (engine-internal force-pushes don't re-enter the handler payload), § Schema (action doc `workflow_id` is the parent_workflow_id source), § Open questions (depth-limit guard commitment), § Worked example (2-level nested auto-complete trace).
- `designs/workflows-module/design.md` — top-level § Testing conventions.
- `designs/workflows-module/parts/05-start-cancel-handlers/design.md` — `StartWorkflow`'s parent-link write; `CancelWorkflow`'s flat-flow shape; the `tracker_fired: null` placeholder in cancel's return shape reserved for this part.
- `designs/workflows-module/parts/06-submit-action-writes/design.md` — `handleSubmit`'s 11-step lifecycle; the priority rule and `force: true` bypass posture; `shared/updateAction.js`'s shape.
- `designs/workflows-module/parts/07-group-state-machine/design.md` — sub-steps 4a/4b/4c lifecycle ordering and the auto-recursion case (terminal-stage guard) that this part wires up; `recomputeGroups`, `reevaluateBlockedActions`, `pushWorkflowStatus`.
- `designs/workflows-module/parts/08-side-effect-dispatch/design.md` — `CancelWorkflow` doesn't generate an event in v1 (eventId stays `null` on the cancel path).
- `designs/workflows-module/parts/11-group-on-complete-fanout/design.md` — step 9 (group fan-out) runs before step 10 (tracker subscription); the ordering is pinned cross-part.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — shipped lifecycle orchestrator; sub-steps 4a/4b/4c/5 at lines 245–322; step 10 TODO at line ~420.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js`, `reevaluateBlockedActions.js` — engine helpers consumed by the extracted helper.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — shipped cancel handler; insertion point after [lines 118–127](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js).
- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js` — per-action force-push helper consumed by the subscription.
- `plugins/modules-mongodb-plugins/src/connections/shared/getActionFields.js` — the action-doc fetch helper the subscription uses to read the parent tracker.
- `plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js` — Jest harness backing every colocated test.

**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` (the design.md already incorporates all resolved findings).
