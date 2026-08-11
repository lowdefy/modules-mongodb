# F42 — Wrong-password login error is a transient toast; should be a persistent inline alert (toast too fast to read)

**Status:** `needs-design` · **Area:** user-account / login

A wrong-password sign-in surfaces its error as a **transient toast**
("Incorrect email or password. Please try again.") that auto-dismisses. A toast disappears
too quickly for slower / older users to read, leaving them confused about why sign-in failed
and whether anything happened. The decision (reporter, 2026-08-07): a failed sign-in must show
a **persistent inline alert** the user can read at their own pace, like the hard-wall errors
do.

## Current behaviour (this is intentional today, not a broken fix)

`pages/login.yaml`'s `onClick.catch` deliberately splits error presentation by code:

- `map_login_error` flips `login_view: noaccess` **only** for `MEMBERSHIP_REQUIRED` and
  `EMAIL_NOT_VERIFIED` — those get the persistent inline `login_error_alert`.
- `toast_login_error` fires for every **other** code (its `skip` lists exactly those same two),
  so `INVALID_EMAIL_OR_PASSWORD` hits the toast branch and the view stays on `signin`.

The `error.cause.code` mapping itself **works** — the toast showed the code-specific copy
(login.yaml:353), not the generic default. So this is not the "upstream fix that doesn't work"
it first looked like; the toast is the current design's deliberate treatment for retryable
password errors. The finding is that that treatment is **wrong for accessibility**.

## The fix direction (a persistent inline alert already exists)

The signin view already renders a **persistent** retryable-notice alert, `login_notice_alert`
(login.yaml:133), driven by `login_notice_title` / `login_notice_desc` and used today for a
retryable `INVALID_TOKEN` (expired magic link). The clean fix is to route
`INVALID_EMAIL_OR_PASSWORD` through that same notice-alert state (an inline, dismiss-at-leisure
alert on the signin view) instead of — or in addition to — the toast, so the message persists
until the user acts.

## The open decision

- Which retryable sign-in codes move from toast → persistent inline alert:
  `INVALID_EMAIL_OR_PASSWORD` for sure; likely the rate-limit (429) and unmapped-default cases
  too, for the same accessibility reason.
- Whether the toast is **dropped** or **kept alongside** the inline alert (double-signalling).
- Alert placement/type on the signin view (reuse `login_notice_alert` as `warning`, or an
  `error`-typed inline alert), so it reads clearly without shifting the form.
