# Consistency Review 1

## Summary

Cross-checked part 10's design.md against all review-1 resolutions and the source files it cites. Two minor sharpening edits applied to propagate the `tracker_fired: Array` shape decision (#6) into surfaces that still read as singular. All other review decisions are correctly reflected in design.md; all cited line numbers, file paths, and cross-part references verify.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`
- **Supporting / tasks / plans:** none exist for this part (no `tasks/`, no `plan/`, no deep-dive files)
- **Cross-part references verified:** `parts/05-start-cancel-handlers/design.md`, `parts/06-submit-action-writes/design.md`, `parts/07-group-state-machine/design.md`, `parts/08-side-effect-dispatch/design.md`, `parts/11-group-on-complete-fanout/design.md`, `workflows-module-concept/engine/spec.md`
- **Source files verified for line citations:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js`, `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js`, `plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.js`, `plugins/modules-mongodb-plugins/src/connections/shared/getActionFields.js`

## Inconsistencies Found

### 1. `CancelWorkflow` trigger bullet read as singular `tracker_fired`

**Type:** Review-vs-Design Drift
**Source of truth:** review-1 finding #6 (resolved Option A — `tracker_fired` is now `Array<{ ... }>`)
**Files affected:** `design.md` "Trigger sites" → `CancelWorkflow` bullet (line 16)
**Resolution:** Rewrote "the subscription populates it when it wrote a parent" to "the subscription replaces it with the fire array (see step 7 of 'Logic' for the shape) — empty when no parent was written." Makes the array shape explicit at the trigger-site bullet so a reader doesn't infer singular semantics from the `tracker_fired: null` framing.

### 2. Verification bullet vague about array shape

**Type:** Review-vs-Design Drift
**Source of truth:** review-1 finding #6
**Files affected:** `design.md` Verification → unit tests (line 63)
**Resolution:** Tightened "`tracker_fired` payload populated on the originating submit response" to "`tracker_fired` array populated on the originating submit response — one entry per recursion level, newest at index 0; empty array when no parent was written." Tells the implementer what to assert on.

## No Issues

The following surfaces were checked and found consistent with review-1's decisions:

- **Trigger site (`SubmitWorkflowAction`)** at line 15 correctly cites step 10 as the seam and [handleSubmit.js:288–309](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) as the auto-complete check location. Verified line range matches shipped code (step 5's bundled `$set` lives at 288–309).
- **Logic step 4 (same-stage guard)** at line 28 matches findings #4 and #5; the priority-rule-bypass rationale and parallel to `pushWorkflowStatus`'s guard are pinned correctly.
- **Logic step 5 call shape** at line 29 uses the per-action `updateAction` signature from [updateAction.js:36–46](../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js); finding #2 fully resolved.
- **Logic step 5 `eventId` propagation paragraph** at line 31 covers both findings #8 (originating eventId, multi-level inheritance) and #9 (null on cancel path, no synthesis).
- **Logic step 6 recursion** at line 32 cites the depth-limit guard per [engine spec § Open questions](../../../workflows-module-concept/engine/spec.md#open-questions-in-scope-deferred); finding #6 resolved.
- **Logic step 7 `parent_workflow_id` source** at line 33 reads from the tracker action's own `workflow_id` field per finding #7; verified `getActionFields` projects `workflow_id`.
- **Implementation "Post-write recompute helper extraction"** at line 39 names `src/connections/shared/recomputeWorkflowAfterActionWrite.js` and pins the fresh-per-`workflowId` invariant; the cited sub-step labels (4a/4b/4c/5) match part 7's lifecycle ordering.
- **Implementation "Recursion path"** at line 40 cites [engine/spec.md:307](../../../workflows-module-concept/engine/spec.md) — verified content at that line matches the cited claim ("Per-entry is the only force surface ... call `updateAction(...force: true)` directly").
- **Implementation "Depth-limit guard"** at line 41 picks up the engine-spec cycle-protection commitment; finding #6 resolved.
- **Implementation `CHILD_STAGE_MAP` placement** at line 42 matches finding #14.
- **Implementation "No `populateIds` call"** at line 43 matches finding #13.
- **Implementation "`handleSubmit` return-shape wiring"** at line 44 cites [handleSubmit.js:384, 405](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) and [CancelWorkflow.js:132](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) — both line numbers verified against shipped code.
- **Verification cache-invariant entry** at line 65 matches finding #12.
- **Verification depth-limit overflow entry** at line 66 matches finding #6.
- **Notes "Client model"** at line 71 matches finding #16 (moved from Open questions).
- **Open questions = "None."** matches finding #6 (recurse open question deleted).
- **Contract to neighbours part 11 ordering** at line 79 cites [part 11 design.md:26](../../11-group-on-complete-fanout/design.md) — verified line 26 in part 11 says "step 9 ... but before step 10 (tracker subscription)"; matches finding #11.
- **Out of scope / Deferred** at lines 48–51 is unchanged by review-1 (no findings target these items).
- **Depends on** at line 55 unchanged; review-1 did not alter part-dependency claims.

## Cross-part reference health

- Part 5 ([05-start-cancel-handlers/design.md](../../05-start-cancel-handlers/design.md)) references this part as the future tracker-fire site — consistent with this part's `CancelWorkflow` trigger commitment.
- Part 6 ([06-submit-action-writes/design.md](../../06-submit-action-writes/design.md)) lists step 10 as a no-op pointing here — consistent with this part's "light up step 10" commitment.
- Part 7 ([07-group-state-machine/design.md](../../07-group-state-machine/design.md)) line 71 references this part as the auto-recursion case for the terminal-stage guard restatement — consistent with this part's multi-level recurse decision (finding #6).
- Part 11 ([11-group-on-complete-fanout/design.md](../../11-group-on-complete-fanout/design.md)) line 26 pins step-9-before-step-10 ordering — consistent with this part's Contract to neighbours bullet.

No outbound contradictions detected.
