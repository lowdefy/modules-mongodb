# Consistency Review 1

## Summary

Checked the full `user-admin-better-auth` file tree (design, upstream-asks, both finding reviews, mockups) against the decision register drawn from review-1 and review-2. Every review finding carries a resolution annotation and every corresponding edit is already present in the design files — **zero inconsistencies required fixing**. One historical-only observation (a now-superseded status note inside review-2) is recorded but deliberately left unmodified.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** `upstream-asks.md`
- **Reviews:** `review/review-1.md` (14 findings, all annotated), `review/review-2.md` (6 findings + a "still open from review-1" recap)
- **Mockups:** `mockups/index.html`, `mockups/screens/{all,invite,suspend-dialog,view}.html` (all.html read in full; others inventoried)

No `tasks.md`, `tasks/`, or `plan/` exist — the design has not been broken into implementation tasks yet, so there is no design→task or design→plan drift surface.

## Decision Register (latest word per finding)

Review-2 is the most recent review; where it re-verified a review-1 resolution, both agree. Extracted decisions:

- **Co-location (r1 #1):** documented precondition in Decision 1. ✓ present (design.md:53, :144)
- **Impersonation (r1 #2):** kept, backed by `auth.userAdminRole` AC. ✓ (Decision 5, ask 3)
- **Stale asks (r1 #3, #4):** asks 1–5 resolved, `_organization` operator for config read. ✓
- **Ask 6 dropped / `auth.email` (r1 #5, r2 #3):** notifications dropped, no send endpoint. ✓
- **Ban fields (r1 #6):** permanent-ban-only, `banned === true`. ✓ (Decision 2)
- **Search downgrade (r1 #8):** low-thousands bound, `$match` is the only cross-join option. ✓
- **`suspension` default true (r1 #9):** accepted, premise documented. ✓ (Decision 4)
- **Role catalog (r1 #10):** widened to upstream ask 7 + orphaned-role handling. ✓ (Decision 8, ask 7)
- **Cross-app disclosure (r1 #11):** accepted, premise documented, no gate. ✓ (Decision 6)
- **Partial-failure (r1 #12):** specified + accepted. ✓ (Decision 3)
- **Role-filter split (r1 #13):** `$in`/equality on split array. ✓ (Decision 1)
- **Mockup tabs (r1 #14, r2 #14):** clarifying caption added. ✓ (all.html:150)
- **Shared-folder `_ref` / no user-account dependency (r2 #1):** shared-folder framing + `write-profile` re-denorm. ✓ (Decisions 3, 7, 8)
- **Sessions `token` projection (r2 #2):** projected out. ✓ (Decision 5, design.md:99)
- **Upstream hooks stale exemplar (r2 #3):** _rejected_ — left for hooks design; correctly **no** pointer added to Decision 7. ✓
- **Vendored adapter (r2 #4):** pnpm-patch/fork replaced by vendored `@lowdefy/connection-mongodb`. ✓ (design.md:7, :158; upstream-asks.md:71)
- **Engine-floor step list (r2 #5):** rewritten to the uniform mechanism, no hand-listed set. ✓ (Decision 3, design.md:79)
- **Invited/Expired derivation (r2 #6):** derived from `expiresAt`, no `expired` status. ✓ (Decision 2, design.md:67)

## Inconsistencies Found

None. All checked areas are consistent.

## Verifications Performed (all consistent)

- **Review-vs-Design:** every resolution annotation's described edit is present in `design.md`/`upstream-asks.md` (spot-checked all 20 findings above).
- **Design-vs-Supporting:** `design.md` ask summary ("asks 1–5 resolved, 6 dropped, 7 open", design.md:152) matches `upstream-asks.md`'s status header and per-ask section titles (RESOLVED ×5, DROPPED, OPEN) exactly.
- **Stale references:** no surviving "pnpm patch / fork PR", "plain/bare contact request" (only the corrected "not a bare contact write" framing), or "admin Decision 6" misattribution remains. `_organization` operator (not an `org` var) used uniformly.
- **Internal contradiction check — profile write pathway:** r2 #1 (add `write-profile` = contact write + `UpdateUserProfile` re-denorm) and r2 #5 (drop `UpdateUserProfile` from the floor enumeration as "never called") were resolved in the same pass and _appear_ to conflict. Verified the final prose reconciles them correctly: the module **does** call `UpdateUserProfile` for the re-denorm targeting the _edited_ user (reframe table design.md:21, Decision 3 design.md:77, :79), and the self-target exemption "which this module never hits" is stated explicitly (design.md:79). Consistent.
- **Module surface:** APIs row carries no `send-invitation-email` endpoint (Decision 7); Connections row lists `user-organizations`, matching the Decision 4/6 membership-enumeration reads; Dependencies are `layout`/`events` only, with both shared fragments correctly excluded as `modules/shared/` `_ref`s.
- **Open questions:** only "Invitations presentation" remains — the single open item both reviews flagged (r1 #14 / r2 #14). No resolved item lingers as open.
- **Mockup:** `all.html` stacks both tables but carries the caption tying the live layout to the tabs decision and naming the open question (all.html:150).

## Observation (no action — historical record)

`review-2.md` §"Still open from Review 1" (lines 96–102) lists findings **#9, #10, #11, #12, #14** as carrying "no resolution annotation yet." Those annotations now exist in `review-1.md` (added by a later `design-action-review` pass). This is **not** a live inconsistency: per the source-of-truth chronology, review-1's annotations are the current decisions and supersede review-2's write-time snapshot. Review files are historical records; the note was accurate when written, so it is left unchanged rather than rewritten.
