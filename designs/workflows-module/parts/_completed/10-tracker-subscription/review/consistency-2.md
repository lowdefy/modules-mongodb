# Consistency Review 2

## Summary

Cross-checked part 10's full file tree now that the `tasks/` directory exists (5 task files + tasks.md). Three inconsistencies found, all auto-resolved: two stale line-number citations in design.md (drifted because shipped `handleSubmit.js` grew after part 8 wiring landed), and a draft-style "Wait —" mid-thought + missing worked-example coverage note in task 5's prose. Review-1's 16 decisions and consistency-1's 2 fixes are all reflected consistently across the task files.

## Files Reviewed

- **Design:** `design.md`
- **Supporting / deep-dive files:** none exist for this part
- **Reviews:** `review/review-1.md` (16 findings, all resolved); `review/consistency-1.md` (2 fixes, all resolved)
- **Tasks:** `tasks/tasks.md`, `tasks/01-extract-recompute-helper.md`, `tasks/02-fire-tracker-subscription.md`, `tasks/03-wire-into-handle-submit.md`, `tasks/04-wire-into-cancel-workflow.md`, `tasks/05-multi-level-integration-test.md`
- **Plans:** none exist for this part
- **Cross-part references re-verified:** `parts/05-start-cancel-handlers/design.md`, `parts/06-submit-action-writes/design.md`, `parts/07-group-state-machine/design.md`, `parts/08-side-effect-dispatch/design.md`, `parts/11-group-on-complete-fanout/design.md`, `workflows-module-concept/engine/spec.md`
- **Source files re-verified for line citations:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`, `CancelWorkflow/CancelWorkflow.js`, `shared/updateAction.js`, `shared/getActionFields.js`, `shared/pushWorkflowStatus.js`, `shared/inMemoryMongo.js`

## Inconsistencies Found

### 1. Stale line-number citations in design.md `handleSubmit.js` references

**Type:** Stale Reference
**Source of truth:** current shipped `handleSubmit.js` (grew ~12 lines after part 8 wired steps 7 and 8 — `tracker_fired: null` literals are now at lines 396 and 430, not 384 and 405; the auto-complete `shouldPushCompleted` block is at 281–285, not 262–273; step 5's bundled `$set` is at 300+, not 288–309)
**Files affected:** `design.md` — three citations (Trigger sites bullet for `SubmitWorkflowAction` at line 15; Verification "Re-firing the same stage" bullet at line 62; Implementation "`handleSubmit` return-shape wiring" bullet at line 44)
**Resolution:** Replaced load-bearing line-number locators with identifier-based locators that don't drift: "step 5's bundled `$set` at [handleSubmit.js:288–309]" became "step 5's bundled `$set` (the `update = shouldPushCompleted ? { ... }` block in `handleSubmit.js`)"; "auto-complete check at [handleSubmit.js:262–273]" became "auto-complete predicate — the `shouldPushCompleted` block in [handleSubmit.js]"; "literals at [handleSubmit.js:384, 405]" became "the two hard-coded `tracker_fired: null` literals in [handleSubmit.js] (one in the error-path partial return inside the outer `catch` block, one in the success-path return at the bottom)". The error-path "lines 380–388" range was dropped — the prose already describes the location ("error-path partial return inside the outer `catch` block").

### 2. Draft-style "Wait —" mid-thought left in task 5's cancel-path test prose

**Type:** Internal Contradiction (within a single test case's commentary)
**Source of truth:** the corrected assertion at the end of the same block (A auto-completes)
**Files affected:** `tasks/05-multi-level-integration-test.md` — the cancel-path multi-level test stub
**Resolution:** Rewrote the test stub to state the corrected behaviour cleanly without the "Wait — this DOES auto-complete A. Adjust assertion:" mid-correction. Also tightened the chain narrative ("Chain: cancel B → tracker fires `not-required` on track-B → A's recompute runs → all A's actions are terminal → A auto-completes...") so the reasoning is upfront, not retrofitted. Adjusted the final `tracker_fired` length assertion: in the fixture A has no parent, so the chain stops at A — `tracker_fired` has 1 entry (track-B's flip), not 2.

### 3. Missing worked-example coverage note in task 5

**Type:** Design-vs-Task Drift
**Source of truth:** design.md Verification section has two adjacent integration-test bullets — "Integration test using the worked-example: completing the child `device-installation` workflow flips the parent's `track-installation`" (line 64) and "Cache invariant — multi-level recurse" (line 65) — but task 5 only explicitly addresses the second
**Files affected:** `tasks/05-multi-level-integration-test.md`, `tasks/tasks.md`
**Resolution:** Added a paragraph to task 5's Context explaining that the 3-level chain subsumes the worked-example 2-level integration test — every 2-level assertion is covered by the 3-level fixture's first level of fan-up, so no separate 2-level test required. Added a parallel one-line note to tasks.md's "Multi-level integration (5)" bullet so the subsumption is visible at the tasks.md map level too. This is a documentation fix only — task 5's existing test cases already cover the worked-example assertions; the note documents the coverage explicitly.

## No Issues

The following surfaces were checked and found consistent across all files:

### Review-vs-Design (re-verifying consistency-1's coverage)

- All 16 review-1 resolutions are still reflected in design.md (multi-level recurse, `tracker_fired` array shape, helper extraction, depth limit, same-stage guard at step 4, eventId propagation, parent_workflow_id source, CHILD_STAGE_MAP placement, no populateIds, part 5/6 updateAction attribution, part 11 ordering, Notes section relocation).
- Consistency-1's 2 fixes (array-shape clarifications at lines 16 and 63) are intact.

### Design-vs-Task

- **Task 1 helper path** `plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.js` matches design.md "Implementation" bullet line 39.
- **Task 1 helper inputs/outputs** (returns `workflow`, `workflowActions`, `groupsBefore`, `groupsAfter`, `reEvaluatedActionIds`, `shouldPushCompleted`, `summary`) align with design.md's "post-write recompute pass (groups, blocked_by re-evaluation, auto-complete, summary writeback)" and feed task 3's `recomputeResult.shouldPushCompleted` consumer.
- **Task 2 file path** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` matches design.md "Implementation" bullet line 37.
- **Task 2 `CHILD_STAGE_MAP` shape** matches design.md Logic step 3 (`active → in-progress`, `completed → done`, `cancelled → not-required`).
- **Task 2 `MAX_DEPTH = 10`** matches design.md Implementation "Depth-limit guard" bullet line 41.
- **Task 2 same-stage guard** at step 5 of its body matches design.md Logic step 4 verbatim ("Compare `tracker.status?.[0]?.stage` against `targetStage`").
- **Task 2 `updateAction` call shape** `{ actionId, newStage, fields, eventId, currentActionId: null, force: true }` matches design.md Logic step 5's per-action signature.
- **Task 2 `parent_workflow_id` source** `tracker.workflow_id` matches design.md Logic step 7.
- **Task 2 `tracker_fired` return shape** `Array<{ parent_action_id, parent_workflow_id, new_status }>` (newest at index 0) matches design.md Logic step 7.
- **Task 2 eventId propagation** (originating eventId for submit, null for cancel, no synthesis) matches design.md Logic step 5's eventId paragraph.
- **Task 3 wiring location** (step 10 marker in handleSubmit, after step 9, before step 11) matches design.md Trigger sites and Contract to neighbours.
- **Task 3 conditional fire** (`if (recomputeResult.shouldPushCompleted)`) matches design.md Trigger sites "If no workflow-status push happened in this call, no-op."
- **Task 3 error-path preservation** matches design.md Implementation bullet "The error-path partial return keeps `tracker_fired: null` — no subscription on the error path."
- **Task 4 wiring location** (after final summary + groups writeback, before return) matches design.md Trigger sites cancel bullet.
- **Task 4 `context.eventId = null`** matches design.md Logic step 5 eventId propagation cancel-path commitment.
- **Task 5 depth-limit overflow** matches design.md Verification "Depth-limit overflow" bullet.
- **Task 5 cache-invariant assertions** match design.md Verification "Cache invariant — multi-level recurse" bullet.

### Internal Contradictions

- No internal contradictions across the 5 task files. Task dependencies (`tasks.md` Depends-On column: 1, 2, 3, 4, 5 chain via 1→2→{3,4}→5) match the imports each task introduces.
- `context` mutation in task 1's helper (`context.actionsConfig` rebinding) is flagged in task 1's Notes and is consistent with the recursion-safety claim in task 2's Notes ("the mutation chain is self-correcting per level").

### Cross-Part References

- Part 5, 6, 7, 8, 11 design references in task files all resolve to existing files at the expected anchors.
- Engine spec citations (`§ Tracker subscription`, `§ Schema`, `§ Open questions`, `§ Priority rule`) all resolve.
- Top-level `designs/workflows-module/design.md` Testing conventions reference resolves.

### Cross-Task Test Coverage

- Single-level unit cases live in task 2's `fireTrackerSubscription.test.js`.
- Per-handler integration cases live in task 3's `handleSubmit.test.js` and task 4's `CancelWorkflow.test.js`.
- Multi-level + depth-limit + cancel-fan-up cases live in task 5's extension of task 2's test file.
- No overlap, no gaps. The 3-level chain in task 5 now explicitly subsumes the worked-example 2-level integration test (per fix #3 above).
