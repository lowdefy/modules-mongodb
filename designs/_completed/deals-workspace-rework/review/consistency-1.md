# Consistency Review 1

## Summary

Checked the design, both finding reviews and all nine task files against what shipped. Found **nine** inconsistencies, all stemming from work decided and built after decomposition — the actions/tasks merge, pagination on both lists, and the collapse fixes. Eight auto-resolved from `design.md`; one is a question for the user (below), because it concerns whether to annotate superseded review resolutions.

**The usual source-of-truth hierarchy is inverted here.** Four review resolutions have been superseded by decisions taken *after* both review passes and already shipped. `design.md` is therefore the later word, not the reviews, and it was used as the authority throughout.

## Files Reviewed

**Design:** `design.md`
**Supporting:** `HANDOVER.md` (session handover; no decisions of its own)
**Reviews:** `review/review-1.md` (7 findings, all annotated), `review/review-2.md` (6 findings, all annotated)
**Tasks:** `tasks/tasks.md`, `tasks/01-form-data-by-workflow-type.md`, `tasks/02-related-deals-single-row.md`, `tasks/03-info-grid-slot-position.md`, `tasks/04-open-items-stacked.md`, `tasks/05-workspace-columns-and-card-numbers.md`, `tasks/06-left-panel-button-and-collapse.md`, `tasks/07-capture-activity-docblock.md`, `tasks/08-changeset-and-verify.md`

No `mockups/` folder exists.

## Inconsistencies Found

### 1. Task 4 specifies stacking; the code merges

**Type:** Design-vs-Task
**Source of truth:** `design.md` — "Combining actions and tasks is a real data merge, rendered by deals"
**Files affected:** `tasks/04-open-items-stacked.md`
**Resolution:** Added an "as built — superseded entirely" note, per the convention commit `2b79515e` set (annotate what was asked, don't rewrite it). The task's every instruction — two full-width child Boxes, "keep Actions above Tasks", both headers unchanged, both `_ref`s untouched — describes a shape that no longer exists.

### 2. Task 4's rejected alternative rests on a false premise

**Type:** Design-vs-Task
**Source of truth:** `design.md`, same section
**Files affected:** `tasks/04-open-items-stacked.md`
**Resolution:** Called out explicitly in the same note. The task's Notes reject a merged list because it "would need a component owning both modules' data" — the objection `design.md` now records as wrong, since `entity_workflows` and `open_tasks` are both already in page state. Left standing it would make a future merge look more expensive than it is, and point at the wrong obstacle. This is the same false premise the design carried until today.

### 3. Task 2's fixed-width scrolling strip was replaced by pagination

**Type:** Design-vs-Task
**Source of truth:** `design.md` — "Related deals: bound the strip by paging it"
**Files affected:** `tasks/02-related-deals-single-row.md`
**Resolution:** Extended the existing "as built" note to record the second divergence. Of the spec's three instructions only the `$limit: 20 → 10` and the single-line ellipsis survive; the fixed width, `nowrap` and horizontal overflow are gone, and `deal_list_item_compact.yaml` now carries no `layout` at all.

### 4. `tasks.md` Global Constraint "no new module vars" is broken by what shipped

**Type:** Design-vs-Task (constraint breach)
**Source of truth:** `design.md` — the `render` var decision
**Files affected:** `tasks/tasks.md`
**Resolution:** Struck through and annotated rather than deleted. `activities/open-tasks` gained `render` and `on_loaded`, both defaulted. Recorded that the constraint still holds for `deals` — no var added or renamed there — and why the alternative was worse: deals duplicating an aggregation over a doc shape activities owns *and writes*, including agenda-topic tasks. This is the most significant finding in the pass, because a Global Constraint is what `/r2:orchestrate`'s reviewers check against.

### 5. `tasks.md` Global Constraint fixes the card width at 180px

**Type:** Stale Reference
**Source of truth:** `design.md`
**Files affected:** `tasks/tasks.md`
**Resolution:** Struck through as moot — the card has no width at all now. Note that this constraint was already wrong before today (it shipped at 200px, per task 2's original as-built note), so it had been stale through two changes.

### 6. `tasks.md` task-table summaries for rows 2 and 4

**Type:** Stale Reference
**Source of truth:** `design.md`
**Files affected:** `tasks/tasks.md`
**Resolution:** Reworded to the outcome with an "as built" marker, so the table is not the one place that still advertises stacking and non-wrapping rows.

### 7. Work landed with no task file, and nothing said so

**Type:** Design-vs-Task
**Source of truth:** `design.md` and the branch's commits
**Files affected:** `tasks/tasks.md`
**Resolution:** Added a note under the task table. The merge, the pagination, the `min-width: 0` and `action_bar` fixes, and the `WorkflowProgress` button size were all built directly with no decomposition, so `design.md` is their only spec. Without this, the eight-task list reads as the full scope of the branch.

### 8. `tasks.md` still carries the info-grid pairing as a blocking open question

**Type:** Stale Status/Blocker
**Source of truth:** `design.md` — open questions, "Settled"
**Files affected:** `tasks/tasks.md`
**Resolution:** Struck through and replaced with the settled decision and the condition under which it would be revisited.

### 9. `design.md` contradicted itself on the open-items shape

**Type:** Internal Contradiction
**Source of truth:** `design.md`'s own merge section
**Files affected:** `design.md`
**Resolution:** The "Items 2, 3, 4 and 8 are one layout change" section still argued from "full-width stacked open items" and "a height-capped related-deals strip". Rewritten to argue from the merged list and the paginated grid — which strengthens the point rather than weakening it, since paging is what makes the narrower column viable.

## Asked user

### Superseded review resolutions

Four annotated resolutions now contradict shipped reality, and by this skill's stated hierarchy they outrank `design.md`:

- **review-1 #7** and **review-2 #6** — fixed-width `nowrap` strip; 180px module constant with a recorded derivation
- **review-2 #2** — "two span-12 columns become full-width sections", the two `ACTIONS`/`TASKS` headers "remain the only labelling"
- **review-2 #3** and **review-1 #6** — span-based collapse, inert below 768px

Nothing was changed in the review files: annotating resolutions is `/r2:resolve`'s job, and rewriting a resolution would erase the reasoning it records. Flagged so the user can decide whether these want "superseded by" pointers.

## No Issues

- **Task 1** (form-data by workflow type) — matches `design.md` and review-1 #4's resolution; the re-key shipped exactly as specified, including the `$ifNull` guard added during implementation.
- **Task 3** (info-grid slot position) — matches review-1 #2's resolution and review-2 #4's pairing table. One moved concat entry, no rename.
- **Task 5** (columns and card numbers) — 12/12 unchanged by today's work; its as-built note already covers the `float(0)` formatting divergence. Its "below 768px the two stack full width" line is still accurate, referring to the `sm` overrides on `pipeline_col`/`detail_col`.
- **Task 7** (capture_activity docblock) — matches review-1 #1's resolution; unaffected by anything since.
- **Task 6** — its existing as-built note was accurate; extended for the two later fixes rather than corrected.
- **`design.md` "Host follow-through"** — the two-shapes-of-`workflows` callout from review-2 #5 is intact, including the "do not align them" instruction, which today's changes do not touch.
- **`design.md` Non-goals** — still accurate; nothing shipped that it excludes.
- **`tasks.md` ordering rationale** — the 1→2 and 5→6 chains and the "items 2, 3, 4 and 8 should land together" note all still hold.
