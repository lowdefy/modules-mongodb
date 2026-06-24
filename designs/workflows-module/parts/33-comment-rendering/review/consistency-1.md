# Consistency Review 1

## Summary

Scanned the full Part 33 tree — `design.md`, all four finding reviews, `tasks.md`, and tasks 01–08 — against the review decision register. The tree is highly consistent: all four reviews are fully actioned and `design.md` plus the task files were reshaped to match (the D4 "comment owns the description" reshape, the check-surface id split, the single fold call site, build-reject + merge-strip enforcement, and the corrected "form submits carry comments"). One stale provenance reference was auto-resolved; no contradictions required the user.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** none (the folder has no non-review, non-task `.md` files)
- **Reviews:** `review/review-1.md`, `review-2.md`, `review-3.md`, `review-4.md` (chronological)
- **Tasks:** `tasks/tasks.md`, `tasks/01-fold-comment-helper.md`, `02-deep-merge-event-display.md`, `03-plan-event-dispatch-comment.md`, `04-thread-comment-plan-submit.md`, `05-check-view-timeline-swap.md`, `06-form-template-timelines.md`, `07-tighten-comment-validate.md`, `08-reject-authored-event-description.md`
- **Plans:** none (no `plan/` directory)

## Inconsistencies Found

### 1. Stale review-file count in the tasks provenance block

**Type:** Stale Reference
**Source of truth:** `review/` directory contents (4 review files now present) + the fact that tasks 02/03 were revised and task 08 added per review-4's action-review.
**Files affected:** `tasks/tasks.md` (Scope section, "Review files skipped")
**Resolution:** Updated "`review/` (2 files)" → "`review/` (4 files)" and added a one-line note that the tasks were subsequently revised to carry the review-3/review-4 decisions (the empty-comment fold gate, the `current_action.change_request_comment` split, and D4's comment-only description with build-reject + merge-strip). The old count predated reviews 3–4 and implied the tasks were never updated from later reviews, which is contradicted by the modified task files.

## No Issues

Everything else checked out — coverage notes:

- **D4 reshape (review-4 #2) — comment owns the description.** Propagated consistently: D4 title/body, the per-field precedence list (line 59), the consequence paragraph (line 61), Proposed-change item 4, In-scope, Part 32 relation (line 156), and tasks 02 (merge-strip), 03 (pre-hook-description-stripped test), and 08 (build-reject) all agree the description slot is comment-only. The negated "static author description" phrasings that remain are correct framings of what the design *rejects*, not stale survivals of the old claim.
- **"Form submits carry comments" (review-4 #2).** The false "form submits carry no comment" claim is gone; D4 line 61 and the Background capture/send notes state submits carry an optional comment (mandatory on `request_changes`), and Verification line 145 adds the `approve`/`submit`-with-optional-comment integration case.
- **Check-surface id split (review-4 #1).** Consistent across Background (lines 17–18), D5 (lines 78, 80), Files-changed (line 110), In-scope (line 123), `tasks.md` (table row 7, baseline note), and task 07 — all describe splitting the modal input onto `current_action.change_request_comment` and **tightening** its existing `_ne null` validate (not adding a new rule), leaving the optional `:268` input untouched. Line references (`:268`, `:626`, `:599`, `:616`, `:624`) match between design and task 07.
- **Single fold call site (review-2 #4, architecture a).** D3, Contract-to-neighbours, and task 03 consistently state one call site inside `planEventDispatch`; `planFieldsUpdate`/Part 24 does **not** call `foldCommentIntoEvent` itself.
- **Empty-comment fold gate (review-3 #1).** `comment.text` non-empty OR `comment.fileList` non-empty — consistent in D3, D5, task 01 (nine unit cases incl. empty-document and image-only), and task 07's validate.
- **Merge → render → fold ordering (review-2 #1).** Pinned in D4, the planEventDispatch Files-changed bullet, and task 03 (with the template-passthrough test).
- **Post-rename filenames (review-3 #3).** `design.md` and tasks consistently use `workflow-action-view.yaml` / `check-action-surface.yaml` / `get_workflow_action`; pre-rename `simple-*` / `get_action` names appear only inside the historical review files.
- **Test migration (review-3 #2).** Verification § Test migration and task 02 both point at `mergeEventOverrides.test.js`, migrate the YAML-clobber regression onto `display.{app_name}.description`, and delete (not migrate) the pre-hook-overrides-comment case; D4 acknowledges the precedence inversion as intended.
- **Task inventory.** `tasks.md` table lists tasks 1–8; all eight task files exist; dependency edges (3←1,2; 4←3; others independent) and the ordering rationale match the task contents.
- **Files-changed ↔ tasks.** The `makeWorkflowsConfig` reject (design line 111) maps to task 08; the `mergeEventOverrides` deep-merge + strip (line 103) to task 02; `planSubmit` threading (line 102) to task 04; the four form templates + check view page (lines 108–109) to tasks 05/06.
