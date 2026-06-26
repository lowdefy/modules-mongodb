# Consistency Review 5

## Summary

Scanned design.md against task files for review-6's six findings (five resolved, one rejected). Most resolutions were already propagated by the in-flight edits sitting on the branch (D14 paragraph, Task 8 edit 4 + anchor refs, Task 14 YAML-channel test, Task 15 contract paragraph, Related-section rewrite, dropped Part 32 callout). Found 3 residual task-side drifts — all auto-resolved.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md` … `review/review-6.md`, `review/consistency-2.md`, `review/consistency-3.md`, `review/consistency-4.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01-…` through `tasks/15-…`
- **Plans:** none exist
- **Supporting files:** none alongside `design.md`

## Inconsistencies Found

### 1. Task 14 still cites the removed Part 32 cross-reference in D14

**Type:** Design-vs-Task Drift (stale reference)
**Source of truth:** review-6 finding #5 (resolved) → design.md (the original lines 319-324 "Cross-reference Part 32" block was removed; the Related-section entry at line 723 was rewritten as "adjacent topic, no shared edits")
**Files affected:** `tasks/14-wire-dispatchLogEvent-and-update-defaults.md`

Task 14's Notes section ended with:

> Coordination with Part 32: D14 of this design notes that Part 32's "`_nunjucks` evaluation — equivalence verified" section is obsoleted by this part. Once this task lands, the two edits to Part 32 listed in D14 should follow (separate work; not part of this task).

D14 no longer references Part 32 — that callout was dropped per review-6 #5 (Part 32 shipped without those edits; the referenced "two edits Part 32 needs" came from Part 32's review thread, not its design, and were never actionable). The Task 14 note points the implementer at a non-existent cross-design dependency.

**Resolution:** Removed the stale "Coordination with Part 32" paragraph from Task 14's Notes section.

### 2. Task 8 Files list undercounts handleSubmit edits

**Type:** Internal Contradiction
**Source of truth:** Task 8's own step 3 (now lists four explicit edits — the fourth being the step-6 `form_data` in-memory mirror added per review-6 finding #2)
**Files affected:** `tasks/08-wire-updateAction.md`

Task 8's Files list still said `handleSubmit.js — modify (three edits)` while its body had been updated to four explicit edits.

**Resolution:** Changed Files entry to `modify (four edits)`.

### 3. Task 8 acceptance criteria missing the `form_data` mirror

**Type:** Internal Contradiction
**Source of truth:** Task 8's own step 3 edit 4 + step 4 test case for the mirror; review-6 finding #2's resolution explicitly committed this edit as a fourth `handleSubmit.js` edit
**Files affected:** `tasks/08-wire-updateAction.md`

Task 8 acceptance criteria covered the `actionDisplay`/`metadata` pass-through and the `context.action` / `context.workflow` refresh, but had no acceptance criterion for the step-6 in-memory `form_data` mirror — even though the body documents the edit and the test plan asserts it.

**Resolution:** Added an explicit acceptance criterion: "handleSubmit.js step 6 mirrors the form_data write into context.workflow in memory so step 7's event-display render reads post-write workflow.form_data.\*."

## No Issues

The following review-6 resolutions were checked and are already consistent across design.md and task files:

- **D14 (#1) — third "YAML `event_overrides`" channel** named alongside engine-default and pre-hook layers; D14 already enumerates the three sources, says "no `_nunjucks: { template, on }` wrapping anywhere on the engine path", and the "Why the YAML channel matters specifically" paragraph documents the operator-pass behaviour. Task 14 includes the YAML-channel render test. Task 15 documents the authoring contract.
- **D14 — operator-literal walker (#4 rejected)** — D14's "Why the YAML channel matters" paragraph correctly states enforcement is by documentation + operator-pass behaviour, not special handling in `renderTree`. D13 walker stays simple.
- **handleSubmit edit 4 / `form_data` staleness (#2)** — design.md handleSubmit Modified bullet enumerates four edits; Task 8 step 3 documents edit 4 with the inline shape; Task 8 step 4 adds the two assertion cases (no-`current_key` path and `current_key` path).
- **`kind: form` page-ID convention (#3)** — D4 cites Part 12's `makeActionPages` (design.md:25-26) with a file:line reference and notes verb-gating per-app.
- **Stale Part 32 cross-references (#5)** — the original "Cross-reference Part 32" block in D14 is gone; Related-section entry rewritten to "narrowed status overrides to the pre-hook channel. Adjacent topic, no shared edits". Only the Task 14 stale reference remained (fixed above).
- **Stale line-number references in Task 8 (#6)** — Task 8 uses anchor phrases ("the inner `for (const doc of matchingDocs)` block, and its sibling `entry.upsert === true` branch"; "after `recomputeWorkflowAfterActionWrite` returns"; "same point as edit 2").
- **`tracker.child_workflow_type` rename** — design Schema additions row, design `createAction.js` / `StartWorkflow.js` Modified bullets, and Task 7 all consistently use the renamed field.
- **`entry_id` connection wiring + `entryId` threading** — design D4 Mechanic, `WorkflowAPI/schema.js` and `connections/workflow-api.yaml` Modified bullets, Task 3 helper signature/tests, Task 6 step 4/5, Tasks 7/8/9 caller threading all consistent.
- **`recomputeWorkflowAfterActionWrite` post-write workflow return shape** — design Modified bullet and Task 8 step 2 carry the identical code snippet and forward-looking note.
- **Cross-design refs** — Part 28 (custom kind), Part 32 (status-overrides — described as adjacent, no shared edits), Part 12 (makeActionPages, cited in D4) consistent.
- **No client-name leakage** in any task or in design.md.
