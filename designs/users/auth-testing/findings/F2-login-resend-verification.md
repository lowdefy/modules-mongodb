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
