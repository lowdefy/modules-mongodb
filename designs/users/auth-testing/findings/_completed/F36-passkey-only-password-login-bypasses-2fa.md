# F36 — Passkey-only user bypasses 2FA on non-passkey sign-in — password _and_ magic-link (required-2FA defeated)

**Status:** `needs-design` · **Area:** user-account / 2FA + auth (⚠️ **security-critical**)

With `twoFactor.required: true`, a user who has enrolled **a passkey but no TOTP** can sign in
with **email + password alone and is never challenged for a second factor** — they land
straight in the app. The passkey, their only second factor, is never exercised. Effective
result: a single-factor login on an account the deployment believes is 2FA-protected.

## Root cause (confirmed in code)

Two independent gates use two different notions of "has 2FA", and the gap between them is the
hole:

1. **The login challenge is gated on TOTP only.** `login.yaml` (submit handler, ~lines
   270-292) routes to the two-factor challenge page **only** when
   `login_do.response.twoFactorRedirect === true`; otherwise `Login` completes the session and
   navigates in. `twoFactorRedirect` is BetterAuth's twoFactor-plugin signal, raised **only
   when `user.twoFactorEnabled` (TOTP) is true** — confirmed by the in-code comment at
   `modal_enroltotp.yaml:24`: _"never touching `user.twoFactorEnabled` — which is what the
   sign-in hook gates."_ A **passkey does not set `twoFactorEnabled`** (observed: a
   passkey-only account has `user-two-factors` count 0 and `twoFactorEnabled` false).

2. **The required-enrolment floor is satisfied by a passkey.** `twoFactorEnrolled` (the fact
   the forced-enrolment page reads) is true for **passkey OR TOTP** (`two-factor-enrol.yaml:16`
   — "passkey enrolment ... and verified TOTP enrolment reach the same done state"). So a
   passkey-only user is **never forced to add TOTP**.

Combined: passkey-only ⇒ `twoFactorEnrolled = true` (no forced TOTP enrolment) **and**
`twoFactorEnabled = false` (no `twoFactorRedirect`, no challenge on password login). The
password path is completely unprotected, and nothing ever nudges the user to close the gap.

The deeper issue matches the reporter's phrasing: the system checks that a second factor is
**enrolled**, never that a second factor was **used in this authentication**. A passkey only
protects logins that _use the passkey_; the password login route ignores it.

**Not only the password path (2026-08-11).** The same bypass was observed on **magic-link**
sign-in: a magic-link user with a passkey (no TOTP) is **not challenged on repeated logins** and
lands straight in. Same root cause — the challenge fires only on `twoFactorRedirect`
(TOTP-gated), and a magic-link sign-in is itself a passwordless single-factor flow that a passkey
never gates. So the hole spans **every non-passkey sign-in route** (password _and_ magic-link),
not just password. Any fix must challenge the enrolled passkey (or otherwise enforce a used
second factor) on all such routes.

## The other side: the challenge page offers no passkey option (2026-08-11)

The same missing capability shows from the other direction. When the 2FA challenge page _is_
reached, `two-factor.yaml` renders only two states via `tf_view` — `auth` (TOTP code) and
`backup` (backup code); there is **no passkey affordance**. So a user who holds a passkey has
**no way to present it as the second factor** at the challenge — only a TOTP code or a backup
code. Reported: "if I have a passkey set up, there's no way to use my passkey as 2FA on the
challenge page."

Both symptoms — the bypass above and this missing option — resolve to one capability: **a
passkey assertion accepted as a valid second-factor challenge**. That is the "session-scoped
satisfaction" the design deferred (Decision 4), and it gates on the upstream question below.

## Impact

- The app-level `twoFactor.required: true` guarantee is **defeated** for any user who enrols a
  passkey and no TOTP — i.e. anyone who took the "Add a passkey" branch on the enrolment page
  (which is offered as a first-class alternative to TOTP).
- A stolen/guessed password is sufficient to sign in, with the passkey providing no protection
  on that path.

## The open question (design decision)

**Reporter's steer (preferred direction):** the second factor the user _already has_ — the
passkey — should be **challenged** on that password login (a passkey assertion / step-up
before the session completes). The user should **not** be sent to enrol a TOTP as the way out
of this state: forcing a _new_ factor is the wrong response when an enrolled factor exists and
simply isn't being exercised. The correct fix challenges the existing passkey, not a fresh
enrolment.

Against that steer, the options are:

- **✅ Force the enrolled factor to be used (preferred)** — on a password login by a user who
  has a passkey but no TOTP, require a passkey assertion (WebAuthn second-factor step-up)
  before completing the session, so the enrolled passkey actually gates the login. No TOTP
  enrolment is offered or required in this moment.
- **✗ Require TOTP enrolment regardless** (don't let a passkey satisfy the required-2FA
  floor) — de-prioritised per the reporter: it forces a redundant second factor on a user who
  already has a valid one.
- **Reframe the model** — treat passkeys as passwordless-primary (a single strong factor) and
  decide explicitly whether a password login is even allowed for a passkey user.

Whichever is chosen, a password login must not silently downgrade a `required`-2FA account to
single-factor, **and must not respond by pushing TOTP enrolment when a passkey is already
enrolled**. This likely touches the `two-factor-lifecycle` design and the enrolment page's
"Add a passkey" branch.

> **Open sub-question for the owning design:** does BetterAuth's twoFactor plugin support a
> **passkey assertion as the second-factor challenge** on the password sign-in path (i.e. can
> `twoFactorRedirect` route to a passkey challenge, not just TOTP/backup-code)? If not, the fix
> has an upstream dependency worth surfacing early.
