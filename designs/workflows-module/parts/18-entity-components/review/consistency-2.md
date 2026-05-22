# Consistency Review 2

## Summary

Second consistency pass, run after `/r:design-task` produced the `tasks/` folder. Scanned all four task files plus `tasks.md` against design.md and the chronologically-ordered reviews (review-1, review-2, consistency-1). Three minor inconsistencies found in task files — all auto-resolved. The design itself is internally consistent (already cleaned up in consistency-1) and the tasks derive from the latest design state.

## Files Reviewed

**Design:**
- `design.md` — latest committed state after review-1, review-2, and consistency-1.

**Reviews (chronological):**
- `review/review-1.md` — 14 findings, 13 resolved + 1 deferred.
- `review/review-2.md` — 3 findings, all resolved (`ActionSteps`-based widget shape).
- `review/consistency-1.md` — six auto-resolved drift items tightening design.md against reviews 1 and 2.

**Tasks (new since consistency-1):**
- `tasks/tasks.md`
- `tasks/01-ship-action-role-check.md`
- `tasks/02-ship-workflow-header.md`
- `tasks/03-ship-actions-on-entity.md`
- `tasks/04-wire-module-manifest.md`

**Plans:** none exist.

## Inconsistencies Found

### 1. Task 02 internal contradiction on `is_overview_page` link-button visibility

**Type:** Internal contradiction (within task 02).
**Source of truth:** The task's own Notes section, which correctly describes the transitional state (the link button renders until Part 17's call-site follow-up lands).
**Files affected:** `tasks/02-ship-workflow-header.md`.
**Resolution:** Auto-resolved. Reworded the acceptance criterion (was "Workflow-overview link button suppressed") to describe the visibility expression's behaviour parametrically — passing `is_overview_page: true` suppresses, omitting renders. Calls out Part 17's pending call-site follow-up as a cross-design dependency, not a task-2 blocker. The acceptance criterion is now satisfiable against the current Part 17 call site.

### 2. Task 02 hedged on whether `blocks` is required at the YAML level

**Type:** Design-vs-Task drift (mild — task language asked the implementer to "note to the user," which leaves the contract unresolved).
**Source of truth:** design.md `workflow-header` vars table — `blocks: array of blocks, yes`.
**Files affected:** `tasks/02-ship-workflow-header.md`.
**Resolution:** Auto-resolved. Reworded the Notes paragraph to commit explicitly: `blocks` is required semantically per design; the YAML treats a missing value as `[]` for transitional safety while Part 17's call site catches up. Removed the "Note this to the user" hedge.

### 3. `tasks.md` "Out of scope" list missing Part 17 tracker-linking open question

**Type:** Stale reference / incomplete propagation.
**Source of truth:** `review/consistency-1.md` and `review/review-2.md` both list Part 17 design.md:182 (lingering tracker-linking open question that contradicts Part 17:53 and Part 18 review-1 #9) as a cross-design follow-up.
**Files affected:** `tasks/tasks.md`.
**Resolution:** Auto-resolved. Added a bullet under "Out of scope" calling out the Part 17 tracker-linking open-question follow-up.

## No Issues

- **Design.md** — internally consistent. No drift from review decisions; no leftover from review-2's `ActionSteps` rewrite.
- **Task 01 (action_role_check)** — aligned with review-1 #2 + #7 (roles-only, action sequence, `_state.action_allowed`). Vars contract matches. Call-shape examples match Part 16's shipped sites.
- **Task 03 (actions-on-entity)** — aligned with review-2's `ActionSteps`-based shape. Slot is a single `ActionSteps` block; no form-data rendering; tracker actions flow through `status_map.link` per review-1 #9.
- **Task 04 (manifest wiring)** — exports list matches design.md's three-component surface. Plain `_ref` registration distinct from the enum components' `_build.object.assign` pattern.
- **Dependency graph in `tasks.md`** — matches the actual `_ref` graph in design.md (task 3 depends on task 2; task 4 depends on 1, 2, 3).
- **Cross-design follow-ups** — both `review-2.md` and `consistency-1.md` list the same set (Part 17 DataView swap, Part 25 DataView swap, Part 17 tracker open-question); after this consistency pass, `tasks/tasks.md` also lists them.
- **Open questions** — only `workflow-header` collapse-state persistence remains, which is the original design's open question.

## Files Modified

- `tasks/02-ship-workflow-header.md` — two edits (acceptance criterion + Notes paragraph).
- `tasks/tasks.md` — one edit (added bullet to Out of scope).

No design.md edits were needed in this pass — the consistency-1 pass had already tightened it against both reviews.
