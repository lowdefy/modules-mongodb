# Consistency Review 1

## Summary

Checked the full Part 28 file tree (design.md, two reviews, tasks.md, and nine
task files) against the resolved review decisions. Both reviews are fully resolved
and the design was rewritten to match, so review-vs-design drift was nil. Found 3
inconsistencies — all stale references, all auto-resolved.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`, `review/review-2.md` (both fully resolved)
- **Tasks:** `tasks/tasks.md`, `tasks/01-fsm-custom-alias.md`,
  `tasks/02-register-custom-kind.md`, `tasks/03-cell-validation-shared-validator.md`,
  `tasks/04-engine-link-routing.md`, `tasks/05-resolver-no-change-tests.md`,
  `tasks/06-docs-concept-specs-readme.md`, `tasks/07-workflows-test-fixture.md`,
  `tasks/08-e2e-custom-action-spec.md`, `tasks/09-demo-showcase.md`
- **Plans:** none exist

## Inconsistencies Found

### 1. Consumer doc home: design says README, task 6 (correctly) says `docs/`

**Type:** Design-vs-Task
**Source of truth:** CLAUDE.md ("source-side READMEs are stubs that point into
`docs/` — do not add content"; "Consumer-facing documentation lives in `docs/`").
Task 6 already redirects to `docs/workflows/how-to/custom-actions.md` and flags the
deviation.
**Files affected:** `design.md` (proposed-change item 5 at line 16, Files-changed
row for `modules/workflows/README.md` at line 236, §Related at line 250).
**Resolution:** Updated all three design references to point at `docs/workflows/`
(consumer how-to page), each noting the README stub stays unchanged per CLAUDE.md.
The design now matches task 6, and the project rule is satisfied.

### 2. tasks.md overview references the retired `workflow-action-*` pages

**Type:** Stale Reference
**Source of truth:** review-2 #1 (Resolved) — Part 56 D3 retired the three shared
`workflow-action-{view,edit,review}` pages; the design now uses the per-workflow
`{workflow_type}-action` page.
**Files affected:** `tasks/tasks.md` Overview (line 7).
**Resolution:** Rewrote the overview sentence — custom's working surface is
app-owned "instead of the module's generated pages (the per-action `form` pages or
the shared `{workflow_type}-action` page, which custom keeps only as its read-only
observer fallback)." Removes the dead `workflow-action-*` page id.

### 3. tasks.md Scope metadata understates the review history

**Type:** Stale Status/Reference
**Source of truth:** The design folder state — review-2 and the task files now exist,
and the tasks encode review-2's `{workflow_type}-action` decision, contradicting the
note that the folder "contains only design.md and the skipped review file" / "Review
files skipped: review-1.md".
**Files affected:** `tasks/tasks.md` Scope section (lines 63–69).
**Resolution:** Updated the Scope block to name both reviews as fully resolved into
`design.md` (not re-folded), and noted the tasks encode the resolved decisions.

## No Issues

- **review-1 / review-2 → design.md:** every resolution annotation is reflected in
  the current design (the `computeEngineLinks` per-verb routing, the shared sentinel
  helper + deletion of `substituteActionIdSentinel.js`, the `validateAction`
  custom-arm guard, the `view_link` permit + shared cell-shape validator, the
  `{workflow_type}-action` page generalization, the `done`-stage precedence rule,
  and the `planFieldsUpdate` no-recompute note). No review-vs-design drift remained.
- **Page rename propagation:** tasks 04, 06, 07, 08, 09 all use `{workflow_type}-action`
  / `custom-action-action` / `onboarding-action` / `action.yaml.njk` consistently —
  no surviving `{workflow_type}-check` or `check.yaml.njk` task references.
- **`workflow-action-review` mentions** in design lines 217/243 and task 09 (lines
  26, 112) correctly describe the _current_ demo e2e spec being replaced, not a
  design decision — left as-is.
- **FSM alias (task 1), kind registration (task 2), cell validation (task 3),
  engine routing (task 4), resolver no-change tests (task 5):** all match the design's
  §Build-time validation, §FSM, §Links, and §Page/Endpoint-emission sections, including
  the `done`-stage `link`-wins-`view` precedence and the shared sentinel helper.
- **Dependency ordering** in tasks.md (1,2,4,6 parallel; 3←2; 5←2; 7←2,3,4; 8←7;
  9←2,3,4) is internally consistent and matches each task's stated `Depends On`.
- **Demo showcase (task 9)** matches design §Demo showcase: no `view_link`, fallback
  to `onboarding-action`, `quote-builder` page, `update_lead_quote` request.
