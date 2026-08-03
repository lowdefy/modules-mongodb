# Consistency Review 1

## Summary

Swept the full `user-account-better-auth` file tree — design.md, both upstream-asks
files, all three reviews (all findings resolved/annotated), tasks.md, and all 20 task
files. One inconsistency found and auto-resolved; everything else is consistent, with
all three reviews' decisions correctly propagated into the design and task set.

## Files Reviewed

- **Design**: `design.md`
- **Supporting**: `upstream-asks.md`, `upstream-asks-2.md`
- **Reviews**: `review/review-1.md`, `review/review-2.md`, `review/review-3.md` (all
  findings resolved)
- **Tasks**: `tasks/tasks.md` + `tasks/01-…`–`tasks/20-…` (21 files)

## Inconsistencies Found

### 1. Ask-1 catalog table listed 12 actions but the status (and design) say 11 — `UpdateUser` was excluded on delivery

**Type:** Internal Contradiction (flagged for the consistency pass by review-1 #5's resolution)
**Source of truth:** review-1 #5 resolution + `design.md` line 148 (ask-1 summary) — `UpdateUser` is **excluded** from the delivered catalog (user-profile Decision 5).
**Files affected:** `upstream-asks.md` (ask 1 catalog table)
**Resolution:** The ask-1 status line reads "11 actions per the table" and the caveat
states the self-service `UpdateUser` action is excluded, yet the table still led with a
`UpdateUser` / `updateUser` row (12 rows total). The design's own ask-1 list enumerates
exactly 11 catalog actions with no `UpdateUser`. Removed the `UpdateUser` row so the
table lists the 11 delivered actions, matching the status wording and the design. The
status caveat (why it was excluded) and the Problem section (which still records
`updateUser` as an original need) preserve the "asked-but-excluded" narrative.

## No Issues

Verified consistent — no changes needed:

- **Review decisions → design/tasks.** All three reviews are fully resolved and their
  decisions are reflected downstream: method-split error handling (review-1 #1), two-layer
  gating via `_build.authConfig` + credential read (review-1 #2), create-or-link upsert on
  `lowercase_email` (review-1 #3), link-only upstream hook + module-side create with
  branched write-back (review-1 #4), explicit `profile.profile_created` marker +
  denormalized `_user` (review-1 #5), `_user.profile.contactId` and
  `INVALID_EMAIL_OR_PASSWORD` (review-1 #6).
- **Shared-fragment home (review-3 #1, the load-bearing one).** Design Decisions 6/7/8 and
  the Module surface Components row all specify var-free
  `modules/shared/contact/{write-profile,create-or-link-contact}.yaml` `_ref`'d by relative
  path — **not** manifest exports. Task 01 declares no component stubs for them (component
  count 4); tasks 05/06 author them in the shared folder with `_ref` vars; tasks 07/08
  `_ref` them by relative path. No residual "owned/exported by user-account" language
  (review-1 #3's superseded framing) survives.
- **Cross-module freshness invariant (review-2 #1).** Decision 6, Decision 8, ask-5 caveat,
  and the module-surface row all state the shared `write-profile` fragment pairs the
  contact write with `UpdateUserProfile`; no lingering "only writer" claim.
- **name/image write target (review-2 #3).** Design lines 84/94 and proposed-change bullet 5
  consistently say the fragment writes `profile` onto `user.profile` **and** `name`/`image`
  onto top-level `user.name`/`user.image`.
- **ask-4 binding rule (review-2 #4).** upstream-asks.md ask 4 states any number of hooks may
  bind a point; the stale "one binding per point" clause is gone.
- **Error-map default branch (review-2 #5).** Decision 2 and tasks 09–15 all specify the
  catch-all `default` alongside the three named codes.
- **Passkey sign-in (review-2 #2).** Decision 2, upstream-asks-2 ask 6, and task 09 all treat
  `PasskeySignIn` as not-yet-delivered with the drop-the-button fallback.
- **Index shape (review-3 #3).** Design Decision 7 and task 03 both pin
  `lowercase_email` as partial-unique on `$exists`, documentation-only, with the CRM-contact
  rationale and omit-when-absent constraint.
- **Demo full method matrix (review-3 #2).** Task 01 requires it; tasks 09/18 reference it.
- **Task-01 delete list (review-3 #4).** Includes `form_profile` / `view_profile`.
- **Dependency table (review-3 #5).** tasks.md shows task 05 depending on 01 only; task 05's
  Notes agree; 03 remains a dependency of task 06.
- **Surface counts.** 10 pages, 6 connections (1 app + 5 read-only), 4 components, 2 APIs,
  2 menus, 7 `authPages` roles — consistent across design.md, task 01, and tasks.md.
- **Round-count claims.** Design (5 delivered + 1 outstanding), upstream-asks (5),
  upstream-asks-2 (ask 6) all agree.
