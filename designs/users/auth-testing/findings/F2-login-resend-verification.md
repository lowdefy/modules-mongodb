# F2 — No resend-verification affordance for a locked-out unverified user

**Status:** `needs-design` · **Area:** user-account / login

A user who signed up, lost or missed the verification email, and later returns to **log in**
hits `EMAIL_NOT_VERIFIED`. The login page's intended `noaccess` alert copy is "Check your
inbox for the verification link, then sign in again" — a **dead end** if the email is gone:
`SendVerificationEmail` resend buttons live only on `signup.yaml` and `verify-email.yaml`,
which a returning user has no obvious route back to.

The campaign explicitly calls for "EMAIL_NOT_VERIFIED (**with resend affordance**)"
(Phase 1, login).

## The open decision

Where the resend affordance lives:

- **Add a resend button to the login page's unverified state** → `SendVerificationEmail` for
  the entered email, in place.
- **Route the user to `verify-email`** with the email prefilled, reusing the resend control
  that already exists there.

Independent of the error-code-mapping path — this stands even once the alert renders
correctly.

## Reproduced (rig, 2026-08-07)

`test1@demo.test` (unverified) attempted login → the `noaccess` state renders with **friendly
copy and no raw code**:

> **Verify your email to continue**
> Your email address hasn't been verified yet. Check your inbox for the verification link,
> then sign in again.

The alert renders correctly (no `EMAIL_NOT_VERIFIED` code leak, no session minted), but there
is **no resend control** — the copy points at an inbox the user may no longer have the link
in. Confirms the dead-end; the open decision above stands.

### Same dead-end from the signup side (re-signup sends nothing)

Signing up **again** with an existing **unverified** email (`test1@demo.test`, 2026-08-07)
routes to the same **"check your email"** screen but does **nothing** server-side: no second
`users`/`user-accounts` row, the existing credential is **untouched** (password hash and
timestamps unchanged — no clobber), and — confirmed in Mailpit and by the user — **no new
verification email is sent**. The screen tells the user to check their inbox while sending
nothing.

Re-signup is a natural recovery instinct for a user who lost the original link, so it is a
second entry into the same dead-end. A safe, enumeration-preserving fix would **resend the
verification email** for an existing _unverified_ account on re-signup (the account is
unverified anyway, so nothing is leaked) — making the "check your email" instruction truthful.
Fold this into the resend decision above.
