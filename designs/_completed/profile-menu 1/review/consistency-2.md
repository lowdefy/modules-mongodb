# Consistency Review 2

## Summary

Checked `design.md` against `review-1.md` for drift. Found 2 review-vs-design inconsistencies, both where review-1 resolution annotations described an intermediate iteration (start/end fragment split in `layout`) that the final design explicitly superseded via a simpler single-fragment approach owned by `user-account`. Both auto-resolved by updating the review-1 annotations to reflect the final decision. No task or plan files exist yet.

## Files Reviewed

**Design**
- `designs/profile-menu/design.md`

**Supporting**
- (none)

**Reviews**
- `designs/profile-menu/review/review-1.md`

**Tasks**
- (none — no `tasks.md` or `tasks/` directory)

**Plans**
- (none — no `plan/` directory)

## Inconsistencies Found

### 1. Review-1 finding #2 annotation described an intermediate `profile-default` structure that the final design dropped

**Type:** Review-vs-Design drift
**Source of truth:** `design.md` Key Decisions #3 and #4, which explicitly reject the start/end split and move ownership to `user-account`
**Files affected:** `review/review-1.md` (finding #2 resolution annotation)
**Resolution:** Rewrote the finding #2 `> **Resolved.**` annotation. Old annotation claimed `profile-default` was redefined as `_build.array.concat` of `_ref: { module: layout, menu: profile-start-links }` and `_ref: { module: layout, menu: profile-end-links }`. New annotation states the start/end split was dropped entirely; `profile-default` is a single literal menu (`Profile → Divider → Logout`) owned by `user-account`, with rationale pointing to Key Decisions #3 and #4.

Design evidence of supersession:
- Design lines 68–90 define `profile-default` as a single literal menu in `modules/user-account/menus/profile-default.yaml`.
- Key Decision #3 (line 251): "`user-account` owns `profile-default`, not layout."
- Key Decision #4 (line 253): "An earlier iteration split the default into `profile-start-links` + `profile-end-links` … The simpler contract is: take the default whole, or write your own whole."
- Files Changed (lines 267–280) lists only `modules/user-account/menus/profile-default.yaml` as new — no start/end fragments.

### 2. Review-1 finding #4 annotation referred to `profile-end-links`, which no longer exists

**Type:** Stale reference in review annotation
**Source of truth:** `design.md` (no mention of `profile-end-links` in Files Changed; Key Decision #4 explicitly discarded the split)
**Files affected:** `review/review-1.md` (finding #4 resolution annotation)
**Resolution:** Rewrote the finding #4 annotation. Old annotation described keeping `profile-end-links` as-is with the divider leading. New annotation marks the concern moot (the file isn't created under the final design), and notes that the orphan-divider safety it raised is still handled by `cleanDividers` from finding #1's Lowdefy prerequisite for custom consumer menus.

## No Issues

Checked and confirmed consistent:
- Finding #1 (Resolved) → `filterMenuList` prerequisite section in `design.md` (lines 171–243) matches the annotation: pass `MenuDivider`, add `cleanDividers` post-pass, tests enumerated, prerequisite PR called out in Files Changed.
- Finding #3 (Resolved) → No `user-admin/menus/profile-links.yaml` in Files Changed; Key Decision #5 (line 255) confirms per-module fragment pattern is dropped.
- Finding #5 (Accepted) → `_module.var: profile_menu_id` nested inside `_menu` matches design lines 46–48 and `module.lowdefy.yaml` var declaration (lines 52–60).
- Finding #6 (Accepted) → Key Decision #6 (line 257) matches: no fallback for a missing `profile` menu; bare avatar is the intended signal.
- `design.md` is internally consistent: Solution, Prerequisite, Key Decisions, Files Changed, and Non-goals all align with the final single-fragment, `user-account`-owned `profile-default` approach.
- No task or plan files exist to check.
