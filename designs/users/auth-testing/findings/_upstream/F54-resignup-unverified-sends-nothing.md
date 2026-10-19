# F54 — Re-signup of an unverified email shows "check your email" but sends nothing — upstream

**Status:** `needs-design` · **Area:** user-account / signup

Split out from [F2](../_completed/F2-login-resend-verification.md). A user who signed up, lost the
verification email, and — a natural recovery instinct — **signs up again** with the same
(still unverified) email is routed to the same "check your email" screen but **nothing is sent
server-side**: no second `users`/`user-accounts` row, the existing credential is untouched
(password hash and timestamps unchanged), and no new verification email arrives (confirmed in
Mailpit, rig 2026-08-07). The screen instructs the user to check an inbox that will never
receive anything.

## Root cause (upstream — BetterAuth)

This is BetterAuth `signUpEmail` behaviour, not module code. With
`emailAndPassword.requireEmailVerification: true`:

- `better-auth/dist/api/routes/sign-up.mjs:161` sets
  `shouldReturnGenericDuplicateResponse = requireEmailVerification || autoSignIn === false`
  → true for this app.
- For an **existing** email (`sign-up.mjs:165-207`) it hashes the password (timing defence),
  builds a **synthetic** user and returns `{ token: null, user: <synthetic> }`. It creates no
  row, touches no credential, and **sends no verification email**. This identical-to-new-user
  response is a deliberate enumeration defence.
- The **new-user** send is gated at `sign-up.mjs:241` on
  `emailVerification.sendOnSignUp ?? requireEmailVerification` — so a genuine new signup does
  get one email, but the existing-unverified branch above never reaches it.

Client-side, `signup.yaml`'s `SignUp` sees only `token: null` and flips to `signup_view:
check` — the same branch a real new signup takes — so it cannot tell the two apart.

## The open decision

The only fix that makes the screen truthful is to **always send the verification email from
the page after signup** and stop relying on BetterAuth's auto-send:

1. Set `emailVerification.sendOnSignUp: false` in the app auth config.
2. Add an explicit `SendVerificationEmail` (email `_state: email`) in `signup.yaml`'s
   no-token branch.

Result: exactly one email for both a new signup and an unverified re-signup, and the "check
your email" screen tells the truth. `SendVerificationEmail` is enumeration-safe server-side
(constant-time floor, always returns success, only actually sends for a found-and-unverified
account), so this leaks nothing.

**Why this sits upstream / deferred.** The double-send wrinkle forces the `sendOnSignUp: false`
switch — without it, an unconditional page-side send gives every genuine new user two identical
verification emails (BetterAuth's auto-send plus ours). But `sendOnSignUp` lives in the
**consumer app's auth config**, not the module, so the module cannot enforce the pairing: the
page-side send is only correct if the app also disables the auto-send. That coupling is the
decision to make here — whether to take on an app-config-dependent behaviour, or wait for an
upstream option to send-once on re-signup.

## Relationship to F2

[F2](../_completed/F2-login-resend-verification.md) (the login resend affordance, shipped) gives this user
an **eventual** recovery path: once they give up re-signing-up and try to sign in, they hit the
`EMAIL_NOT_VERIFIED` wall, which now offers a resend. F54 is only about making the re-signup
screen itself honest.
