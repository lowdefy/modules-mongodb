# Consistency Review 2

## Summary

Second consistency pass over `user-admin-better-auth`, focused on the surface that
appeared since `consistency-1`: **review-3** (task-file review, 8 findings, all
annotated) and the full **`tasks/`** tree (01–19 + `tasks.md`). Verified every
review-3 resolution is actually reflected in the task files, then checked
design ↔ task ↔ mockup drift. All eight review-3 resolutions are correctly
applied. **Two inconsistencies found, both auto-resolved** (design edits) — a
stale tile name and a verified invite-reconciliation decision the design was
silent on.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** `upstream-asks.md`, `mockups/screens/{all,view,invite}.html`, `mockups/index.html`
- **Reviews:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md` (all findings annotated), prior `review/consistency-1.md` (context only)
- **Tasks:** `tasks/tasks.md` + `tasks/01`–`tasks/19`

## Decision Register (latest word — review-3 additions)

review-3 is the newest review; its resolutions supersede on the task surface. All
verified present in the task files:

- **#1 skill/guide paths:** `.claude/skills/lowdefy-*` → `lowdefy-docs` MCP; `.claude/guides/*` → `docs/shared/change-stamps.md` / `docs/events/`. ✓ tasks 1,2,3,4,5,9,13 (task 17 needed no change — its ref was already the MCP)
- **#2 modal count:** "six" → "seven". ✓ tasks 10 (body), 11 (body + acceptance)
- **#3 fragment `_var` interface:** caller-injected `_var`s enumerated. ✓ task 2 (both fragments), tasks 3 & 5 pass them
- **#4 pagination wiring:** `$skip`/`$limit` after `$sort` + `$facet`/`$count`. ✓ task 9 (Pagination section + acceptance)
- **#5 expired re-invite:** cancel-then-invite in the `invite` routine. ✓ task 5 (verified vs better-auth 1.6.23); noted in tasks 9, 17
- **#6 demo `_ref` orphans:** delete `roles.yaml`, rename the two attr-field files. ✓ task 1 (body + Files)
- **#7 community-plugin drop:** app-wide drop of `@lowdefy/community-plugin-mongodb`. ✓ task 1 (manifest + `apps/demo/lowdefy.yaml` + acceptance)
- **#8 catalog operator:** `_build.authConfig.roles` named. ✓ tasks 8, 12, 16

## Inconsistencies Found

### 1. Detail-page tile named "Access" in the design, "Attributes" in the mockup and tasks

**Type:** Internal Contradiction / Design-vs-Task
**Source of truth:** the mockup (`view.html`) + tasks 10/11/12 (concrete UI; the more recent, concrete artifacts)
**Files affected:** `design.md:77` said the tile was **Access**; `mockups/screens/view.html` renders it **Attributes** (block id `attributes_tile`), and tasks 10, 11, 12 all call it the **Attributes tile**.
**Why the mockup wins here:** the mockup's **Security** tile is subtitled **"Access & sign-in"** (confirmed in `view.html`), so a sibling tile literally titled "Access" would clash — "Attributes" is the deliberate label. The write pathway/routine name (`update-access`, `modal_access`, "access save") is consistent everywhere and was left unchanged.
**Resolution:** updated `design.md` Decision 3 tile list to **Attributes**, with a parenthetical recording that the display label is "Attributes" (not "Access") to avoid the Security-tile clash while the "access" pathway name is retained.

### 2. Expired-invitation re-invite path decided in review-3 but absent from the design

**Type:** Review-vs-Design
**Source of truth:** review-3 finding #5 (resolved; verified against `better-auth@1.6.23`)
**Files affected:** `design.md` Decision 7 described only generic "resend/cancel" and "resend rides `InviteMember`'s native `resend`"; Decision 2 listed invitation actions as "resend/cancel". Neither reflected that native `resend` cannot refresh an **Expired** row and that `createInvitation`'s guard ignores expired rows — so re-inviting an Expired invitation needs **cancel-then-invite**. That verified decision lived only in the task files (task 5, referenced by 9 and 17).
**Resolution:** propagated the review-3 #5 decision into the design — added the cancel-then-invite reconciliation (with the 1.6.23 verification and the "every path self-reconciles" note) to Decision 7, and updated Decision 2's invitation-actions phrasing to "resend / cancel for Invited rows, re-invite for Expired ones". Design and tasks now agree.

## No Issues (checked, consistent)

- **APIs / connections / pages counts:** design Module-surface (12 APIs, 7 connections, pages `all`/`view`/`invite`) matches task 1's scaffold exactly.
- **Vars:** removals (`app_name`, `roles`, `app_domain`) and additions (`impersonation` false, `suspension` true, `download` false, admin-roles var) match design Decision 8 ↔ task 1.
- **Reads/scoping:** `_organization: id` (no `org` var), `$split` on CSV `member.role`, exact-element role filter, post-`$lookup` regex search, permanent-ban `banned === true`, `token` projected out — design Decisions 1/2/4/5 ↔ tasks 9/13, all aligned.
- **Status derivation:** Active/Suspended/Invited/Expired; `status:"pending"` + `expiresAt` split; no `expired` status — design Decision 2 ↔ tasks 5/9.
- **Decision 6 degradation:** count-0 (Apps hidden, plain Suspend, Delete enabled, copy collapsed) driven by other-membership count — design ↔ tasks 12/13.
- **Shared fragments:** `modules/shared/contact/{create-or-link-contact,write-profile}.yaml`, `_ref` by relative path, no `user-account` dependency, `write-profile` re-denorm — design Decisions 3/7/8 ↔ task 2.
- **Dependencies:** `layout`, `events` only; `notifications` dropped; invite email rides `auth.email`, no send endpoint — design Decision 8 ↔ tasks 1/5.
- **Upstream asks:** `design.md` summary (asks 1–5,7 resolved, 6 dropped, no open dependency) matches `upstream-asks.md`. Untouched by review-3; already cleared in consistency-1.
- **Task dependency graph:** `tasks.md` chains and gates internally consistent (re-confirmed; matches review-3's "Verified — no issue").

## Observations (no action)

- `tasks/tasks.md:75` "Review files skipped: review-1, review-2, consistency-1" is a provenance note from task generation (before review-3 existed). Accurate as history; not an inconsistency.
- `design.md` says the migration guide covers "v0.9"; task 18 says "v0.x". `v0.x` ⊇ `v0.9`; no conflict — left as is.
