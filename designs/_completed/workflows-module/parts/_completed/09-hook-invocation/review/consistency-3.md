# Consistency Review 3

## Summary

Audited design.md against review-1 and review-2 resolutions plus cross-design link paths. Found 4 stale link paths (Parts 6/7/8 moved into `_completed/` after this design was authored) and auto-resolved them. All review-1 and review-2 resolutions are correctly reflected in design.md; no review-vs-design drift, internal contradiction, or stale-decision content found.

## Files Reviewed

- design: `design.md`
- reviews: `review/review-1.md`, `review/review-2.md`
- cross-design (read for anchor / path validation):
  - `parts/_completed/06-submit-action-writes/design.md`
  - `parts/13-resolver-apis/design.md`
  - `parts/29-error-model-cleanup/design.md`
- no `tasks.md`, `tasks/`, or `plan/` files exist for this part.

## Inconsistencies Found

### 1. Stale link path to Part 6 (engine default per interaction)

**Type:** Stale Reference
**Source of truth:** Filesystem — `parts/_completed/06-submit-action-writes/design.md`
**Files affected:** `design.md` line 33
**Resolution:** Updated `../06-submit-action-writes/design.md` → `../_completed/06-submit-action-writes/design.md`. Other references on lines 9, 20, 46, 48, 102, 111 already used the `_completed/` path; this one was missed during the archival.

### 2. Stale link path to Part 7 (auto-unblocks)

**Type:** Stale Reference
**Source of truth:** Filesystem — `parts/_completed/07-group-state-machine/design.md`
**Files affected:** `design.md` line 37
**Resolution:** Updated `../07-group-state-machine/design.md` → `../_completed/07-group-state-machine/design.md`.

### 3. Stale link path to Part 8 (buildDefaultLogEventPayload)

**Type:** Stale Reference
**Source of truth:** Filesystem — `parts/_completed/08-side-effect-dispatch/design.md`
**Files affected:** `design.md` line 54
**Resolution:** Updated `../08-side-effect-dispatch/design.md` → `../_completed/08-side-effect-dispatch/design.md`.

### 4. Stale link paths to Part 6 in `force: true` propagation section

**Type:** Stale Reference
**Source of truth:** Filesystem — `parts/_completed/06-submit-action-writes/design.md`
**Files affected:** `design.md` line 90 (two occurrences in one line)
**Resolution:** Updated both `../06-submit-action-writes/design.md` and `../06-submit-action-writes/design.md#priority-rule` to use the `_completed/` prefix.

## No Issues

- All review-1 resolutions (#1 four-layer event merge, #2 auth-by-construction, #3 literal `module: 'workflows'` + hook-id template, #4 `comment` on pre-hook payload, #5 `hook_error` removal, #6 `post_hook_error` removal, #7 `actions[]` six-field shape + replace-on-collision, #8 `current_status` qualification, #9 lifecycle step numbers, #10 timeout decision, #11 force-rejection verification, #12 form_overrides field-path merge) are present in design.md.
- All review-2 resolutions (#1 no `{ rejected, reject_message }` surface; success-return collapsed to 6 fields, #2 singular `key` → plural `keys` normalization explicitly pinned, #3 `currentActionId` collision rule with status-graft fallback, #4 post-hook timing wording includes step 10, #5 `:reject` idempotency added to retry paragraph, #6 `buildDefaultLogEventPayload` layers-1+3 composition note, #7 `pre_hook_response` raw-return contract, #8 orphaned fixture-name bullet removed) are present in design.md.
- Anchor targets verified against current headings in Part 6, Part 13, and Part 29 — all resolve.
- Part 11 and Part 22 link paths (still in unscoped `parts/`) are correct.
- No `tasks.md` or plan files exist, so no design-vs-task or design-vs-plan drift possible.
- No internal contradictions detected in design.md.
- No stale "deferred until X" / "blocked on Y" notes — the upstream dependency callout in Depends-on is still load-bearing (the `runRoutine.js` tweak hasn't landed).
- No sections rendered moot by later decisions.
