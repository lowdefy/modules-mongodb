# F2 — No resend-verification affordance for a locked-out unverified user

**Status:** `needs-design` · **Area:** user-account / login

A user who signed up, lost or missed the verification email, and later returns to **log in**
hits `EMAIL_NOT_VERIFIED`. The login page's intended `noaccess` alert copy is "Check your
inbox for the verification link, then sign in again" — a **dead end** if the email is gone:
`SendVerificationEmail` resend buttons live only on `signup.yaml` and `verify-email.yaml`,
which a returning user has no obvious route back to.

The campaign explicitly calls for "EMAIL_NOT_VERIFIED (**with resend affordance**)"
(Phase 1, login).

## Decision (resolved) — send, then land on verify-email

The `noaccess` wall's `EMAIL_NOT_VERIFIED` branch gains a **Resend verification email** button
that **sends** the verification email (enumeration-safe) for the captured address, then
navigates to `verify-email`'s "check your email" view — truthful because the send just ran, and
carrying its own resend fallback. An earlier navigate-only version (route to `verify-email` and
resend there) was rejected in testing: a button labelled "Resend" that only navigated didn't
send, and the screen it landed on claimed a link had been sent when none had.

Implementation: the password-catch (`map_login_error`) captures the typed address into a
`login_resend_email` state, set **only** for `EMAIL_NOT_VERIFIED`. Its presence both gates the
button (so the shared `MEMBERSHIP_REQUIRED` wall is unaffected) and supplies the address to the
send and the follow-on navigation — the capture is necessary because flipping to the `noaccess`
view hides the `email` input, and an invisible input's value is dropped from state (so reading
`_state: email` at click time would be null; same reason `forgot-password` copies to
`forgot_email`). On click the button runs `SendVerificationEmail` then a `Link` to
`verify-email?email=<addr>` (check view). The `EMAIL_NOT_VERIFIED` copy ends "…or resend it
below." on the catch path (where the button shows); the onInit `?error=` redirect path carries
no address, so the button stays hidden there and its copy is unchanged.

Note: this depended on a separate platform fix. The auth-upgrade bump changed the auth actions'
`callbackUrl` param from a string to a structured object; `verify-email.yaml` and `signup.yaml`
still passed the old string form, which broke their resend/sign-up at runtime. Those four call
sites were migrated to the object form (`{pageId, urlQuery}`) as part of this change, since F2's
landing depends on `verify-email`'s resend working.

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
[F54](../_upstream/F54-resignup-unverified-sends-nothing.md), because its only clean fix depends
on the consumer app's `emailVerification.sendOnSignUp` config (see that finding). The login
resend above already gives this user an eventual recovery path once they try to sign in.
