# F2 — No resend-verification affordance for a locked-out unverified user

**Status:** `needs-design` · **Area:** user-account / login

A user who signed up, lost or missed the verification email, and later returns to **log in**
hits `EMAIL_NOT_VERIFIED`. The login page's intended `noaccess` alert copy is "Check your
inbox for the verification link, then sign in again" — a **dead end** if the email is gone:
`SendVerificationEmail` resend buttons live only on `signup.yaml` and `verify-email.yaml`,
which a returning user has no obvious route back to.

The campaign explicitly calls for "EMAIL_NOT_VERIFIED (**with resend affordance**)"
(Phase 1, login).

## Decision (resolved) — route to verify-email

The `noaccess` wall's `EMAIL_NOT_VERIFIED` branch gains a **Resend verification email** button
that routes to `verify-email` with the typed address prefilled (`urlQuery.email: _state:
email`), reusing the enumeration-safe resend control already there. This adds no send logic to
`login.yaml` and keeps a single canonical resend site. Chosen over an in-place send on login
(nicer one-click UX but duplicates the `SendVerificationEmail` wiring and a confirmation state
onto a third page).

Implementation: a new `login_error_code` state (seeded in both the onInit `?error=` path and
the password-catch) gates the button to `EMAIL_NOT_VERIFIED` alone, so the shared
`MEMBERSHIP_REQUIRED` wall is unaffected. The wall copy now ends "…or resend it below." Landing
on `verify-email?email=<addr>` with no `?verified`/`?error` shows the check view with the
existing `verify_resend` wired — no change needed on `verify-email.yaml`.

## Reproduced (rig, 2026-08-07)

`test1@demo.test` (unverified) attempted login → the `noaccess` state renders with **friendly
copy and no raw code**:

> **Verify your email to continue**
> Your email address hasn't been verified yet. Check your inbox for the verification link,
> then sign in again.

The alert renders correctly (no `EMAIL_NOT_VERIFIED` code leak, no session minted), but there
is **no resend control** — the copy points at an inbox the user may no longer have the link
in. Confirms the dead-end the resend button above resolves.

### Same dead-end from the signup side (re-signup sends nothing)

Re-signing-up with an existing unverified email hits the same "check your email" screen while
sending nothing server-side — a second entry into the dead-end. Split out to
[F54](_upstream/F54-resignup-unverified-sends-nothing.md), because its only clean fix depends
on the consumer app's `emailVerification.sendOnSignUp` config (see that finding). The login
resend above already gives this user an eventual recovery path once they try to sign in.
