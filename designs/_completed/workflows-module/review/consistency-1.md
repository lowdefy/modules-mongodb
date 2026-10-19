# Consistency Review 1

## Summary

First top-level consistency pass across the workflows-module design tree. Read all 22 part design files, all per-part reviews and consistency reports (parts 4, 5, 12, 21), all task files (parts 3, 4, 5, 12, 14, 21), and the top-level design + implementation-plan. Found 4 inconsistencies — all auto-resolved (3) or resolved with user input (1).

## Files Reviewed

**Top-level:**

- `designs/workflows-module/design.md`
- `designs/workflows-module/implementation-plan.md`

**Part designs (22):**

- `parts/01-call-api-primitive/design.md` through `parts/22-workflows-e2e-suite/design.md`

**Per-part reviews:**

- `parts/04-workflow-config-schema/review/{review-1, consistency-1}.md`
- `parts/05-start-cancel-handlers/review/{review-1, consistency-2, consistency-3}.md`
- `parts/12-resolver-pages/review/{review-1, consistency-1}.md`
- `parts/21-entity-type-to-collection/review/{review-1, consistency-1}.md`

**Task files:**

- `parts/03-engine-plugin-shell/tasks/` (tasks.md + 5 files)
- `parts/04-workflow-config-schema/tasks/` (tasks.md + 3 files)
- `parts/05-start-cancel-handlers/tasks/` (tasks.md + 6 files)
- `parts/12-resolver-pages/tasks/` (tasks.md + 3 files)
- `parts/14-form-components-library/tasks/` (tasks.md + 9 files)
- `parts/21-entity-type-to-collection/tasks/` (tasks.md + 5 files)

## Inconsistencies Found

### 1. Top-level design.md still says "20 parts"; parts 21 and 22 missing from Parts table and Dependency graph

**Type:** Design-vs-Design (internal contradiction with the part folder layout)
**Source of truth:** Parts 21 and 22 are landed/in-flight follow-ons; `implementation-plan.md` already lists both under a "Follow-ons (added after the original waves)" section.
**Files affected:** `designs/workflows-module/design.md`
**Resolution:**

- Updated "20 independently-implementable parts" → "22 independently-implementable parts" (line 3)
- Added a sentence after the lede explaining parts 21–22 are follow-ons, pointing at a new `## Follow-on parts` section
- Updated the Layers preamble to read "original 20 parts group into 5 layers"
- Added a new `### Follow-on parts` sub-section under Parts with rows for 21 (entity-type-to-collection) and 22 (workflows-e2e-suite)
- Added rows 21 and 22 to the Dependency graph table
- Added two new bullets to "Hard gates" describing the dependency posture of parts 21 and 22
- Added a `## Follow-on parts` narrative section explaining how each follow-on was spun out (part 21 from part 12 review-1 #1; part 22 lifted out of part 20's closeout)

### 2. Part 21 Size disagrees between part design.md (M) and implementation-plan.md (S)

**Type:** Design-vs-Plan drift
**Source of truth:** `parts/21-entity-type-to-collection/design.md:3` — `**Size:** M`. Design files outrank plan files in the hierarchy.
**Files affected:** `implementation-plan.md` (Follow-ons row for part 21) and the new top-level design.md row added in finding #1.
**Resolution:**

- Updated `implementation-plan.md:89` to record Size **M** for part 21 (was S)
- The newly-added part 21 row in `design.md` was authored with **M** to match the part's own header

### 3. Part 22's design asserts every shipping part (5–20) carries a "End-to-end coverage lands in part 22" verification line; only parts 5, 12, 19 actually did

**Type:** Internal contradiction across part designs
**Source of truth:** `parts/22-workflows-e2e-suite/design.md:105` — "Every shipping part (5–20) carries a single line in its Verification section: 'End-to-end coverage lands in part 22. This part's verification is unit-tests + handler-level integration smoke only.'"
**Files affected:** Parts 6, 7, 8, 9, 10, 11, 13, 15, 16, 17, 18, 20 — none of which carried the line.
**Resolution:** Asked user — user chose "propagate now". Added the verbatim Verification-line sentence to every missing part. Each addition was placed as the final bullet under the existing `## Verification` section. Also, per part 22's contract, struck part 20's stale "End-to-end Playwright e2e tests — recommend `/r:dev-playwright-gen` as a follow-up" out-of-scope bullet (replaced with a pointer to part 22). Files modified:

- `parts/06-submit-action-writes/design.md`
- `parts/07-group-state-machine/design.md`
- `parts/08-side-effect-dispatch/design.md`
- `parts/09-hook-invocation/design.md`
- `parts/10-tracker-subscription/design.md`
- `parts/11-group-on-complete-fanout/design.md`
- `parts/13-resolver-apis/design.md`
- `parts/15-resolver-form-builder/design.md`
- `parts/16-page-templates/design.md`
- `parts/17-shared-pages/design.md`
- `parts/18-entity-components/design.md`
- `parts/20-module-manifest/design.md` (both Out-of-scope strike and Verification addition)

### 4. Implementation-plan.md no longer in sync with top-level design.md's part count

**Type:** Design-vs-Plan drift (downstream of finding #1)
**Source of truth:** The (now-updated) `design.md` table contains all 22 parts.
**Files affected:** `implementation-plan.md`
**Resolution:** The pending diff (already uncommitted in the working tree) on `implementation-plan.md` already includes a `## Follow-ons` section listing parts 21 and 22 with the same Size/Repo/Status data — so the plan was already ahead of the design. Bringing design.md up to 22 parts (finding #1) resolves the directional drift. The only further edit needed was the Size fix in finding #2.

## No Issues

Areas checked where everything was consistent:

- **`entity_type` → `entity_collection` rename (part 21)** propagated correctly across all unimplemented sibling parts. Parts 5, 12, 19 all carry the `entity_collection`-only payload + explicit pointer to part 21. Part 18 confirmed to need no edit (doesn't reference the field). Parts 3, 4, 14 designs and tasks remain frozen by intent ("don't touch implemented parts" rule from part 21 review-1 #6). Parts 03 task files still reference `entity_type` in JSDoc/projection — that's intentional and matches the shipped code; part 21 amends the shipped code separately, not the historical task plan.
- **Part 5 review decisions** (parent_entity_id/parent_entity_collection dropped from payload, half-linked failure mode accepted, idempotency claim struck, display_order added, change-stamp section, force:true on parent push, validation block, references reserved-key merge order) all reflected in part 5 design.md and have matching cross-references in part 19's design.md (operational-apis Api payload list).
- **Part 12 review decisions** (entity_id runtime-only, action_config shape, page_ids only for emitted verbs, build-time app_name validation, placeholder templates) all reflected in part 12 design.md and tasks/.
- **Part 4 review decisions** (drop "unknown keys" framing in favor of channel separation, 7 validators documented, schema required arrays, manifest top-of-file comment) all reflected in part 4 design.md and tasks/.
- **Per-part consistency runs already applied:** parts 4 (consistency-1), 5 (consistency-2, consistency-3), 12 (consistency-1), 21 (consistency-1) all clean against their own designs.
- **Dependency graph** in `design.md` matches every part's own "## Depends on" section (now including 21 and 22).
- **Repo footprint** in `implementation-plan.md` accurately lists all 22 parts (with part 21 in both `plugins/...` and `modules/workflows/`, part 22 in `apps/demo/`).
