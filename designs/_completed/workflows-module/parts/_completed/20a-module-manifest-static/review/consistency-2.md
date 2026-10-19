# Consistency Review 2

## Summary

Eight inconsistencies found after the review-1 resolutions — four inside `design.md` (residual stale phrasing from earlier sections that didn't get rewritten when later decisions landed), three in cross-file siblings (20b, implementation-plan), and one destructive cleanup (Part 27 directory) that was held for confirmation and then applied. All eight resolved.

## Files reviewed

- **Design:** `designs/workflows-module/parts/20a-module-manifest-static/design.md`
- **Reviews:** `designs/workflows-module/parts/20a-module-manifest-static/review/review-1.md` (14 findings, all resolved during action review)
- **Sibling parts:** `designs/workflows-module/parts/20b-module-manifest-dynamic/design.md`, `designs/workflows-module/parts/27-demo-workflows-wiring/design.md`
- **Plan:** `designs/workflows-module/implementation-plan.md`
- **Referenced specs (read-only):** `designs/workflows-module-concept/module-surface/spec.md`, `designs/workflows-module-concept/action-authoring/spec.md`, `designs/workflows-module/parts/_completed/17-shared-pages/design.md`, `modules/workflows/module.lowdefy.yaml`

(No `tasks/` directory yet; no separate plan-step files for 20a.)

## Inconsistencies found

### 1. Stale "tracker-only" framing described the demo as all-tracker

**Type:** Internal contradiction (design.md vs design.md)
**Source of truth:** Review-1 finding #6 resolution — child workflow is `kind: task` ("installation step"), parent is tracker-only.
**Files affected:** `design.md` lines 80–85 (pre-edit).
**Resolution:** Rewrote the bullets to separate the parent (three tracker actions on `leads-collection`) from the child (one `kind: task` "installation step" action). Removed the stale "child workflow on a `tickets` entity" reference and renamed the variant header from "tracker-only" to "tracker-only-parent" to disambiguate.

### 2. Part 19 listed as shipping five operational APIs

**Type:** Stale reference (design.md "Depends on" section)
**Source of truth:** `designs/workflows-module/parts/_completed/19-operational-apis/design.md` — Part 19 ships four APIs natively; Part 23 adds `close-workflow` as a fifth and Part 25 adds `get-action-group-overview` as a sixth.
**Files affected:** `design.md` line 154.
**Resolution:** Corrected to "four operational APIs" with the actual four names. Removed the spurious "build-time validator hooks for `vars.entities`" bullet that didn't belong there — that validator is part 4's obligation per [part 17 design.md line 96](modules-mongodb/designs/workflows-module/parts/_completed/17-shared-pages/design.md).

### 3. 20b kept Part 27 as an open question after 20a committed to retirement

**Type:** Cross-file drift (design.md vs sibling 20b/design.md)
**Source of truth:** Review-1 finding #14 resolution — Part 27 is retired.
**Files affected:** `20b-module-manifest-dynamic/design.md` lines 19 and 128.
**Resolution:** Step 5 of 20b's "Proposed change" now points at 20a's retirement decision instead of saying "optionally retire... revisit during execution." 20b's "Open questions" section drops the "Retire Part 27?" bullet entirely.

### 4. Implementation-plan "Shipped so far" still claimed Part 27 owns the demo wiring

**Type:** Stale reference (implementation-plan vs review-1 finding #14)
**Source of truth:** Review-1 finding #14 resolution.
**Files affected:** `implementation-plan.md` line 5.
**Resolution:** Rewrote the runtime-light-up sentence — runtime light-up needs parts 20a, 20b, and 24 (no longer "20 + 24 + 27"). The "spun out to part 27" sentence replaced with a one-liner noting the retirement and where its scope went.

### 5. Implementation-plan still listed Part 27 in the Follow-ons table

**Type:** Stale reference (implementation-plan vs review-1 finding #14)
**Source of truth:** Review-1 finding #14 resolution.
**Files affected:** `implementation-plan.md` line 95.
**Resolution:** Removed the part 27 row.

### 6. Implementation-plan repo footprint still attributed `apps/demo/` to part 27

**Type:** Stale reference (implementation-plan vs review-1 finding #14)
**Source of truth:** Review-1 finding #14 resolution + the 20a/20b demo-wiring split.
**Files affected:** `implementation-plan.md` line 104.
**Resolution:** Replaced "20 (wiring only), 22 (e2e suite), 27 (demo workflows wiring)" with "20a (tracker-only demo wiring), 20b (form/task demo extension), 22 (e2e suite)."

### 7. Implementation-plan tail "converge at part 20" referenced the pre-split part

**Type:** Stale reference (implementation-plan vs the 20a/20b split itself)
**Source of truth:** The split decision recorded across `20a-module-manifest-static/design.md` and `20b-module-manifest-dynamic/design.md`.
**Files affected:** `implementation-plan.md` line 106.
**Resolution:** Updated to "converge at parts 20a / 20b."

### 8. Part 27 directory still on disk despite 20a's committed retirement

**Type:** Stale reference / destructive cleanup
**Source of truth:** Review-1 finding #14 resolution — "(c) deleting `designs/workflows-module/parts/27-demo-workflows-wiring/`."
**Files affected:** `designs/workflows-module/parts/27-demo-workflows-wiring/design.md` (and the directory itself).
**Resolution:** **Applied after user confirmation.** Deleted the directory (`rm -rf designs/workflows-module/parts/27-demo-workflows-wiring`). Before the delete, the one remaining live link inside `20a/design.md`'s "Closed during review" section (`[Part 27 (demo-workflows-wiring)](../27-demo-workflows-wiring/design.md)`) was rewritten as plain text so the retirement record no longer 404s. Narrative references to Part 27 inside completed-parts task files (`_completed/17-shared-pages/tasks/`, `_completed/18-entity-components/tasks/`, `_completed/25-group-overview-page/tasks/`) were intentionally left intact — they're historical records of what those parts spun out at the time and rewriting them would be revisionism (per the repo's "Review changes touching implemented parts" memory).

## No issues found in

- The `vars` section (review-1 findings #5 and #9 resolutions land cleanly).
- The `dependencies` section (review-1 finding #4 — only `layout`, with the `events`/`notifications` rationale in-line).
- The `connections` section (matches the proposed-change step 1 file list).
- The plugin pin (`^0.6.0`, matches `plugins/modules-mongodb-plugins/package.json` and the existing manifest).
- The verification walk-through (six steps, matches the e2e spec assertions in finding #12).
- The `Out of scope` list — no contradictions with the new "Child workflow rendering — skipped in 20a" section.
- The `Open questions` section — empty as expected; the three resolved questions are recorded below it.
