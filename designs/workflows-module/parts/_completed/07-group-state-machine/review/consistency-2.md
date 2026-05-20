# Consistency Review 2

## Summary

Walked the design and the 9 task files (created after consistency-1) against the review-1 decision register and against each other. Found two drift items — `deriveGroupStatus`'s signature in `design.md` predates the task decomposition, and task 8 carried a softer "either inline or call `pushWorkflowStatus`" stance than the design committed to. Both auto-resolved.

## Files Reviewed

- **Design:** `design.md`.
- **Reviews:** `review/review-1.md` (already fully annotated), `review/consistency-1.md` (already covered).
- **Tasks:** `tasks/tasks.md`, `tasks/01-derive-group-status.md`, `tasks/02-validator-blocked-by-resolution.md`, `tasks/03-recompute-groups.md`, `tasks/04-push-workflow-status.md`, `tasks/05-extend-start-workflow.md`, `tasks/06-extend-compute-auto-unblocks.md`, `tasks/07-reevaluate-blocked-actions.md`, `tasks/08-wire-substeps-into-handle-submit.md`, `tasks/09-extend-cancel-workflow.md`.
- **Supporting / plans:** none.

## Inconsistencies Found

### 1. `deriveGroupStatus` signature drift between design.md and tasks

**Type:** Design-vs-Task (design pre-dates task decomposition)
**Source of truth:** Tasks 1 and 3 — the actual file-by-file decomposition committed during `/r:design-task`.
**Files affected:** `design.md` § Group status derivation (line 31).
**Resolution:** Changed the design's signature from the old three-argument form `deriveGroupStatus(actions, groupId, declaredActionGroup)` to the actual single-argument form `deriveGroupStatus(groupActions)`, with a note that callers like `recomputeGroups` own the per-group filtering. The three-argument signature was written before the helper was decomposed; `recomputeGroups.js` (task 3) now owns the iteration over declared groups and the per-group filtering, leaving `deriveGroupStatus` with just the pre-filtered list.

Design line 39's name-only reference and verification line 89 worked with either signature; they didn't need changes.

### 2. Task 8 left auto-complete write path open; design committed to bundled `$set`

**Type:** Review-vs-Task drift (design's auto-complete section committed to "staged and bundled into step 5's `$set` ... in one Mongo call"; task 8 added an "Alternative" softening that allowed calling `pushWorkflowStatus` directly)
**Source of truth:** `design.md` § Auto-complete check.
**Files affected:** `tasks/08-wire-substeps-into-handle-submit.md`, `tasks/tasks.md`.
**Resolution:**
- Removed the "Alternative" paragraph from task 8 § Sub-step 4c; locked it to inline same-stage check + bundled `$set`.
- Tightened the acceptance criterion from "imports `recomputeGroups`, `reevaluateBlockedActions`, `pushWorkflowStatus` (or uses an inline same-stage check)" to a definite "imports `recomputeGroups` and `reevaluateBlockedActions`. The auto-complete decision uses an inline same-stage check (no call to `pushWorkflowStatus`); the push lands inside step 5's bundled `$set`."
- Removed the stale `import pushWorkflowStatus` line from task 8 § Imports.
- Removed task 4 (`pushWorkflowStatus`) from task 8's "Depends On" column in `tasks.md` — task 8 doesn't import it. Task 4 still ships in parallel as a shared helper for future callers (parts 10, 23). Updated the ordering rationale block accordingly.

The reference to `pushWorkflowStatus` in task 8's table description ("stage a `pushWorkflowStatus('completed')`") and explanatory text (lines 91, 95, 97, 210) stays — those name the helper conceptually without claiming task 8 imports or calls it. Matches the design's wording.

## No Issues

- **Lifecycle ordering** — task 8's sub-step 4a / 4b / 4c table matches the design's ordering table line by line.
- **`recomputeGroups` signature** — task 3 and task 5 / 8 / 9 callers all agree on `{ declaredGroups, actions }`.
- **`computeAutoUnblocks` extension** — task 6's new inputs (`groups`, `declaredGroups`) match the design's "Replace part 6's action-type-only `computeAutoUnblocks` with mixed resolution" and the runtime resolution precedence (group id first, then action type).
- **`reevaluateBlockedActions` signature** — task 7's `{ workflowActions, actionsConfig, groups, declaredGroups, eventId }` matches the post-write walk requirements in the design.
- **`CancelWorkflow` extension** — task 9's projection extension + folded `$set` matches the design's `CancelWorkflow` integration section verbatim.
- **No `completed_groups` on cancel** — task 9 acceptance criterion ("Assert the key is absent (not just falsy)") matches the design's invariant.
- **Empty-group shape** — task 3 ("Empty groups get `{ id, status: 'done', summary: { done: 0, not_required: 0, total: 0 } }`"), task 5 ("Empty groups serialize as ..."), task 9 ("one empty group — that group is `{ id, status: 'done', summary: { done: 0, not_required: 0, total: 0 } }`") all match the design's empty-group serialisation bullet.
- **Build-time validator** — task 2's behaviour matches the design's "Build-time `blocked_by` resolution check" section.
- **Out of scope** — task 8 explicitly excludes `on_complete` hook firing (defers to part 11) and end-to-end coverage (defers to part 22), matching the design's "Out of scope / deferred" section.
- **Cross-task references** — tasks reference each other by number and file name consistently (e.g. task 5 → task 3, task 8 → tasks 3 / 6 / 7, task 9 → tasks 1 / 3).
- **Verification posture** — tasks.md verification section matches the design's testing-conventions cross-link and the design's "End-to-end coverage lands in part 22" deferral.
