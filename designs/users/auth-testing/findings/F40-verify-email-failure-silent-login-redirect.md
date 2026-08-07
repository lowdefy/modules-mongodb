# F40 — Invalid verify-email link (logged out) silently lands on bare login; designed expired view not reached

**Status:** `investigate` · **Area:** user-account / auth-flow (verify-email)

A **tampered** email-verification link, opened while **logged out**, redirected straight to
`http://localhost:3000/user-account/login` — a **bare login page with no `?error=` query
param and no message**. The user is given **no signal** that their verification link was bad.

## Expected (per the page design)

`pages/verify-email.yaml` is built for exactly this failure. It seeds `verify_view` from the
URL and renders an **expired** view when `_url_query: error` is present; its header comment
states BetterAuth "appends `&error=` to the callbackURL on failure — the email survives onto
the expired view", and the expired view offers a **resend** control. So the intended landing
on a bad link is the **verify-email page in its expired state**, not login.

## Observed (rig, 2026-08-07)

- Signed up `test1@demo.test`, pulled the real verify link from Mailpit, corrupted the JWT
  **signature** segment, opened it **logged out**.
- **Final URL:** `http://localhost:3000/user-account/login` — no `error=` param, no error copy.
- **Write-side is clean (PASS):** still exactly one `users` row for `test1`, still
  `email_verified: false`, and **no** `user-contacts` row was written. The invalid token
  changed nothing in the database — only the landing is wrong.

## Mechanism (leading hypothesis)

The verify link carried `callbackURL=%2F` (`/`), and the verify-email page's expired view
depends on BetterAuth redirecting the failure **back to the verify-email page with `&error=`**.
On a **bad-signature** token BetterAuth cannot trust/parse the token, so instead of honouring
a success-style callback it falls back to the configured **error page** (`authPages.error` →
login) — and does so **without** an `error=` code on the URL. The result is the bare login
page the page-level expired view never sees.

## Open question

The campaign item lumps three cases — **tampered** (bad signature), **expired** (valid
signature, past `exp`), and **already-consumed** (valid signature, token spent). Only the
tampered case was exercised, and it fails. Before deciding the fix, isolate which cases reach
the designed expired view:

- **Does a validly-signed but expired/consumed token reach the verify-email expired view**
  (`&error=`), while only a signature-corrupted token dumps to bare login? If so the design
  works for the realistic cases and the gap is narrowly "malformed token → no feedback".
- Or does **every** verify failure land on bare login, meaning the expired view is
  effectively dead and the `&error=` contract in the page comment never holds?

**Decision needed:** where a failed verification should land and what it must tell the user —
route all failures to the verify-email expired view (with resend, per the page's design), or
at minimum carry an `error=` code onto login so _some_ message renders. Related to
[F2](./F2-login-resend-verification.md) (no resend affordance for a locked-out unverified
user) — both are about a verify/login dead-end with no way forward.
