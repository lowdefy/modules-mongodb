# Consistency Review 5

## Summary

Checked all design, task, and review files after review-4 action review (which dropped `title` prop, fixed React keys, and added empty Descriptions for title-only groups). Found 4 inconsistencies — all auto-resolved. Three were stale "flat groups" references from before review-2's nesting fix; one was a missing scope entry.

## Files Reviewed

**Design:**

- `design.md`

**Reviews:**

- `review/review-1.md` (9 findings, all resolved)
- `review/review-2.md` (5 findings, all resolved)
- `review/consistency-3.md` (3 inconsistencies, all resolved)
- `review/review-4.md` (3 findings, all resolved)

**Tasks:**

- `tasks/tasks.md`
- `tasks/01-copy-adapt-preprocessing.md`
- `tasks/02-block-scaffold.md`
- `tasks/03-swap-profile-views.md`

## Inconsistencies Found

### 1. Task 1 Context says "flat groups `[{ title, fields }]`"

**Type:** Design-vs-Task Drift
**Source of truth:** Review 2 finding #1 — resolved to recursive `collectGroups` preserving nesting as `[{ title, fields, children }]`
**Files affected:** `tasks/01-copy-adapt-preprocessing.md`
**Resolution:** Changed Context section from "flat groups `[{ title, fields }]`" to "a tree of groups `[{ title, fields, children }]`" with note about nesting preservation. The Task body already had the correct description.

### 2. Task 2 Context says "outputs `[{ title, fields }]`"

**Type:** Design-vs-Task Drift
**Source of truth:** Same as #1 — review 2's nesting decision
**Files affected:** `tasks/02-block-scaffold.md`
**Resolution:** Changed Context from "`[{ title, fields }]`" to "`[{ title, fields, children }]` (a tree of groups preserving nesting)".

### 3. tasks.md Overview says "flat groups directly"

**Type:** Design-vs-Task Drift
**Source of truth:** Same as #1 — review 2's nesting decision
**Files affected:** `tasks/tasks.md`
**Resolution:** Changed Overview from "adapted to output flat groups directly" to "adapted to output a tree of groups preserving nesting hierarchy".

### 4. tasks.md Scope missing consistency-3 and review-4

**Type:** Stale Reference
**Source of truth:** File inventory — both review files exist with all findings resolved
**Files affected:** `tasks/tasks.md`
**Resolution:** Added `review/consistency-3.md` and `review/review-4.md` to the scope's review files list.

## No Issues

The following areas were checked and found consistent:

- **Review 4 decisions propagated to design.md:** `title` prop removed from properties YAML, feature parity lists, root-level fields description, and key decisions. React keys use `${depth}-${index}`. Empty Descriptions renders for title-only groups.
- **Review 4 decisions propagated to task 02:** Schema has no `title` property. Acceptance criteria has no `properties.title` line. Component code has updated keys and title-only handling.
- **Design.md component code matches task 02 component code:** Import paths, props, descProps, renderDescriptions, renderGroup (including all three review-4 fixes) are identical.
- **Design.md preprocessing output format matches task 01:** Both describe `[{ title, fields, children }]` tree structure with nesting.
- **Task 03 unchanged and consistent:** Profile view swap instructions reference correct properties (`bordered: true`, `column: 2`, `size: small`) — no `title` was ever included here.
- **No stale `properties.title` references remain** in any design or task file (verified via grep).
- **Section titles via `group.title`** are correctly distinguished from the removed block-level `title` throughout — `renderHtml` usage for section titles is correct.
- **meta.js** in design.md and task 02 are identical (icons, slots, cssKeys).
