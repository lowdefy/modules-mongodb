# Task 8: Consumer docs — recovery, the send_routine obligation, enrolment

## Context

`docs/` is the source of truth for consumer-observable behaviour. Three consumer-facing facts land in
this change and must be documented:

- **Admin recovery** (user-admin): a Security-tile "Reset two-factor authentication" control and a
  "Revoke passkeys" control (all-or-per-key), each revoking sessions, auditing, and notifying. Built when
  `auth.twoFactor` / passkeys are enabled; per-action org permissions (`reset-two-factor` /
  `revoke-passkeys`) let a deployment grant member management while withholding recovery (Decision 4).
- **The send_routine obligation** (Decision 8): the recovery notice is dispatched through
  `notifications.send-notification`, which defaults to an unbound `send_routine` (`[]`, a no-op). The
  module cannot close this — so the docs must carry the obligation: **a deployment enabling
  `auth.twoFactor` must bind `notifications.send_routine`** or the security notice silently goes nowhere.
  Note the new hard `notifications` dependency on user-admin (task 3).
- **Enrolment + `twoFactorEnrolled`** (user-account, Decisions 5–6): with `auth.twoFactor.required`, an
  unenrolled caller is redirected to the contributed `twoFactorEnrol` page (TOTP or passkey, both
  reachable including passwordless). `_user.twoFactorEnrolled` = `twoFactorEnabled || passkeyCount > 0`
  means **holds a factor that satisfies `auth.twoFactor.required`** (a passkey counts). `required` is an
  **enrolment floor, not a per-session challenge guarantee** — state this honestly.

Existing docs to extend (find the right home; do not create pages the module doesn't need):
`docs/user-admin/index.md`, `docs/user-account/index.md`, `docs/user-account/concepts/auth-methods.md`,
`docs/shared/event-display.md`. Follow `docs/CONTRIBUTING.md` front-matter schema on any new page.

## Task

- Document the recovery controls and their behaviour (reach is suite-wide, sessions revoked, audit +
  notify, org-permission gating, no exemption) in the user-admin docs.
- Document the **send_routine binding obligation** for `auth.twoFactor` deployments prominently in the
  user-admin docs (and cross-reference from the notifications docs if that is where dispatch is
  described).
- Document the enrolment page, the `required` behaviour, and the `twoFactorEnrolled` meaning (passkey
  counts; enrolment floor not challenge guarantee) in the user-account docs.
- If the two new event types warrant a mention in `docs/shared/event-display.md`, add them.
- Run `pnpm docs:gen` and commit the regenerated `docs/llms.txt` (front-matter lint + llms.txt run on
  CI). **No `vars.md` change** — no new manifest vars (Decisions 4, 9) — so `gen-var-docs` output must be
  unchanged; if `docs:gen` reports a `vars.md` diff, a manifest var slipped in upstream and must be
  investigated, not committed.

## Acceptance Criteria

- Recovery, the send_routine obligation, and enrolment/`twoFactorEnrolled` are all documented in the
  appropriate existing `docs/` pages.
- `pnpm docs:check` passes (front-matter valid, `llms.txt` up to date).
- No change to any `reference/vars.md`.

## Files

- `docs/user-admin/index.md` — modify — recovery controls + send_routine obligation.
- `docs/user-account/index.md` and/or `docs/user-account/concepts/auth-methods.md` — modify — enrolment +
  `twoFactorEnrolled` meaning + enrolment-floor caveat.
- `docs/shared/event-display.md` — modify (if the new events belong there).
- `docs/llms.txt` — regenerate via `pnpm docs:gen` (do not hand-edit).

## Notes

Copy exact behaviour from the design's Decisions 4, 5, 6, 8 — do not soften the enrolment-floor caveat or
the send_routine obligation, both of which are deliberate honesty statements the module must not undercut.
