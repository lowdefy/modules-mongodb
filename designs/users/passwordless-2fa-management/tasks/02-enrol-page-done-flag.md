# Task 2: Enrol page — drive the done-state from a local `enrol.done` flag (Decision 3)

## Context

`modules/user-account/pages/two-factor-enrol.yaml` is the forced-enrolment page. Today every
render decision keys off `_user.two_factor_enrolled` — a **session** fact refreshed only on
`UpdateSession`. The engine's `required` gate, by contrast, is recomputed per request from a
fresh `getSession` (`session.user.twoFactorEnabled` for TOTP, plus a DB passkey count for the
unenrolled-TOTP case). When the client fact reads truthy while that gate reads not-enrolled, the
done-state + Continue render and `Link {home: true}` bounces straight back off the gate (F48 #2).

Fix: **replace `_user.two_factor_enrolled` across the whole page with a local `enrol.done`
flag**, set only by this page's own successful enrolment chains. The page was reached _because_
the gate said "not enrolled", so the only legitimate route to "done" is completing an enrolment
here; a flag set by that completion cannot disagree with a gate that has, by then, been satisfied.

This task ships **now** — pure in-module config, no engine dependency.

`_user.two_factor_enrolled` currently drives **seventeen** blocks. Moving only some leaves the
rest inconsistent (one combination turns the redirect loop into a blank page), so all seventeen
move together.

## Task

In `modules/user-account/pages/two-factor-enrol.yaml`:

**1. Seed the flag.** In the `seed_enrol` `onInit` `SetState` (currently sets `enrol.phase:
password`, `enrol.codes_saved: false`), add `enrol.done: false`.

**2. Set the flag `true` in both success chains** (append a `SetState` after each existing
`UpdateSession`):

- TOTP: after `refresh_enrol_session` (`UpdateSession`, in `enrol_confirm.onClick`), add a
  `SetState` step setting `enrol.done: true`.
- Passkey: after `enrol_passkey_session` (`UpdateSession`, in `enrol_passkey_btn.onClick`), add a
  `SetState` step setting `enrol.done: true`.

**3. Ten pre-done blocks** — replace their `_not: { _user: two_factor_enrolled }` conjunct with
`_not: { _state: enrol.done }`, keeping any existing `_eq [enrol.phase, ...]` conjunct exactly as
is. (`enrol_title` and `enrol_lead` have only the `_not` gate — they become
`_not: { _state: enrol.done }` outright.) The ten:
`enrol_title`, `enrol_lead`, `enrol_totp_intro`, `enrol.password`, `enrol_generate`,
`enrol_passkey_divider`, `enrol_passkey_btn`, `enrol_scan_intro`, `enrol_scan_row`,
`enrol_confirm`.

Why they must move (not stay on the ambient fact): a stale-truthy arrival (member who disabled
2FA elsewhere, session fact still enrolled, force-routed here) would render `_not: true` → every
pre-done block hidden _and_ `enrol.done` false → every done block hidden = a blank page.
`_not: enrol.done` reads correctly on arrival (false → form shows).

**4. Seven done-cluster blocks** — replace their positive `_user: two_factor_enrolled` gate with
`_state: enrol.done`:
`enrol_done_msg`, `enrol_codes_msg`, `enrol_codes_grid`, `enrol_codes_alert`, `enrol_codes_copy`,
`enrol.codes_saved`, `enrol_continue`.

The **five backup-code blocks** (`enrol_codes_msg`, `enrol_codes_grid`, `enrol_codes_alert`,
`enrol_codes_copy`, `enrol.codes_saved`) currently AND the enrolment gate with
`_boolean: { _state: enrol.backup_codes }` — **keep that conjunct**, so each becomes
`_and: [ { _state: enrol.done }, { _boolean: { _state: enrol.backup_codes } } ]`. Do NOT gate them
on `enrol.backup_codes` alone: `stash_enrol_totp` populates `enrol.backup_codes` at the enable
step (before verify), so codes gated on presence alone would leak into the scan phase — the
completion signal is what keeps them hidden until verified. `enrol_done_msg` and `enrol_continue`
get plain `_state: enrol.done` (no backup-codes conjunct).

`enrol_continue.disabled` already keys off `enrol.backup_codes` / `enrol.codes_saved` only —
leave it unchanged.

**5. Rewrite the header comment** (`:1-24`) to record: the done-state is now driven by the local
`enrol.done` flag (seeded false, set true by this page's own enable/verify and passkey chains),
not the ambient `_user.two_factor_enrolled`; and that the two `UpdateSession` calls
(`refresh_enrol_session`, `enrol_passkey_session`) **stay load-bearing** — they refresh
`session.user.twoFactorEnabled`, which the `required` gate on Continue's home destination reads,
so a future reader must not mistake them for dead code now that the page no longer reads the
session fact.

## Acceptance Criteria

- `_user.two_factor_enrolled` no longer appears anywhere in `two-factor-enrol.yaml` (grep-clean).
- `enrol.done` is seeded `false` onInit and set `true` in both the TOTP-verify and passkey
  success chains, after their respective `UpdateSession`.
- On arrival (`enrol.done` false) the "Add a second factor" form shows; after a completed
  enrolment the done-state shows (codes only when `enrol.backup_codes` is populated).
- Both `UpdateSession` calls are retained.
- `pnpm ldf:b` from `apps/demo` builds clean (verify in Task 6 alongside the other changes).

## Files

- `modules/user-account/pages/two-factor-enrol.yaml` — modify — seed + set `enrol.done`, move all
  17 blocks off `_user.two_factor_enrolled`, rewrite header comment.

## Notes

- Known, deliberate tradeoff: an already-enrolled caller who re-arrives (Back button, manual nav)
  now sees the form rather than a "Two-factor is set up" screen, because `seed_enrol` re-seeds
  `enrol.done: false`. On arrival this caller is indistinguishable from the stale-truthy
  disabled-elsewhere caller (both hold `_user.two_factor_enrolled === true` yet want opposite
  screens); defaulting to the form is correct for the population F48 #2 is about. Do not add a
  guard to "fix" this — it is the intended behaviour.
- Task 4 (Decision 2) edits this same file and AND-s `has_credential` into the `enrol.password`
  and `enrol_totp_intro` gates you produce here. Leave those two gates in the
  `_and: [ _not enrol.done, _eq phase password ]` shape so Task 4 can extend them cleanly.
