# F44 — Manage-modal TOTP enrolment redirects to home as codes render (codes flash, then lost)

**Status:** `investigate` · **Area:** user-account / 2FA enrolment

Enrolling TOTP via the account page's **Manage modal** (`modal_enroltotp.yaml`) — the
self-service happy path — completed, the backup-codes grid **flashed on screen**, and then the
user was **redirected to the home page** before the codes could be read or saved. The
"I've saved my backup codes" gate + Done button never got a chance to hold the modal open.

## Symptom (reporter, 2026-08-11)

- Add 2FA from the Manage modal on the account page.
- The backup codes appear briefly (the `codes` phase renders — grid, "you won't see these
  again" alert), then the page navigates to home. Codes are gone.

## Why this matters

BetterAuth returns plaintext backup codes **exactly once**, in the `TwoFactorVerify`/enable
response, and stores them encrypted thereafter. A redirect that fires while the codes are on
screen means the codes are **unrecoverable** — same broken-recovery outcome as F35, reached by
a different route.

## Relationship to existing findings

- **Supersedes F35's scope-narrowing.** [F35](./F35-totp-enrol-backup-codes-not-shown.md)
  concluded the defect was _specific to the forced-enrol page_ and explicitly recorded that
  "the self-service **Manage modal** renders backup codes correctly (confirmed live this run)."
  This report says the modal **no longer holds** the codes — so either a regression since that
  run, or the modal shares the recovery-path failure after all. F35's scope claim needs
  re-checking against this.
- **Suspected shared cause with F33.** The confirm chain runs `TwoFactorVerify` then
  `refetch_account` (which re-fetches `get_account` etc.); enabling 2FA changes the session's
  factor state. If the account page's session-freshness guard reacts to that change the same
  way [F33](./F33-onboarding-updatesession-stale-redirect.md) describes — routing on a
  session mutation before/without a settled `UpdateSession` — it would bounce the user off the
  account page mid-modal. `refetch_account` itself contains no navigation (verified:
  `modules/user-account/actions/refetch_account.yaml` is Request + SetState only), so the
  redirect comes from elsewhere in the chain or from a page-level guard.

## The open question

Where does the home redirect originate, and is it new?

- Does completing `TwoFactorVerify` in the modal trigger a page/route guard (session-freshness,
  like F33) that redirects when the session's 2FA state flips mid-session?
- Is this a regression since the run that recorded "modal works" in F35, or was the earlier
  observation of a state that didn't redirect (e.g. a `replace`/`codes_only` intent vs a
  first-time `enrol`)?

Repro a clean first-time enrol from the Manage modal and capture the navigation source (which
action/guard fires the redirect). High impact — the modal is the primary self-service path to
a usable recovery set.
