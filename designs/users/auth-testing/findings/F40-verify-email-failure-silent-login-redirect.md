# F40 — Invalid verify-email link (logged out) silently lands on bare login; designed expired view not reached

**Status:** `root-caused` · **Area:** user-account / auth-flow (verify-email)

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

## Root cause (verified from source — the leading hypothesis was wrong)

The original hypothesis — "BetterAuth falls back to `authPages.error` on a bad-signature
token" — is **false**. BetterAuth's verify-email handler routes **every** failure through one
`redirectOnError` (`better-auth@1.6.23` `.../api/routes/email-verification.mjs:165-171`): it
redirects to `callbackURL?error=<code>` **whenever a callbackURL is present**
(`TOKEN_EXPIRED` for a past-`exp` JWT, `INVALID_TOKEN` for a bad signature/malformed,
`USER_NOT_FOUND`, `INVALID_USER`). The `onAPIError.errorURL` (→ login) fallback only fires
when there is **no** callbackURL. So the error page was never the mechanism.

The real cause is one layer lower: **the callbackURL never points at the verify-email page —
it is always `/`.** This is an incomplete upgrade migration on the `auth-upgrade` branch.

- `signup.yaml` (SignUp, line ~185) and the three resend buttons (`signup.yaml` ~421,
  `verify-email.yaml` ~75 and ~146) pass `callbackUrl` as a **string** built with
  `_string.concat` → `/user-account/verify-email?verified=1&email=<addr>`.
- On this branch `@lowdefy/actions-core@…0807` changed the `SignUp` /
  `SendVerificationEmail` `callbackUrl` param from a string to a **structured object**
  `{ home?, pageId?, url?, urlQuery? }`. The client's `resolveCallbackURL`
  (`@lowdefy/client@…0807` `.../auth/createAuthMethods.js:46-48`) returns `undefined` for a
  non-object, so a **bare string silently falls through the ladder** — no `?callbackUrl=`
  query on signup → `home:true` → resolves to `/`. The code comment names this exact trap:
  _"a bare string (the spelling the schemas wrongly declared before this change, still common
  in apps) falls through the ladder rather than failing the sign-in."_
- Result: the emailed link carries `callbackURL=%2F` — **matching the rig's observation.**
  `magic-link-send.yaml:58` was already ported to the structured form; signup + verify-email
  were not. (`accept.yaml` / `login.yaml` are fine — those are `Link` `urlQuery` blocks that
  build the `?callbackUrl=` **query string**, a legitimately-string surface, not the action
  param.)

### Open question — resolved

**Every** verify failure for an emailed link lands on bare login, and the verify-email page's
`success` and `expired` renders are **both dead for the emailed link** — not just the
tampered case:

- **Tampered** → `INVALID_TOKEN` → `redirectOnError` appends `&error=` to `/` → `/?error=…`
  → protected root bounces a logged-out user to login, **dropping the query**. (observed)
- **Expired** → `TOKEN_EXPIRED` → identical path → bare login. Not a narrow "malformed only"
  gap.
- **Already-consumed** (valid sig, unexpired, user already verified) → handler redirects to
  `callbackURL` with **no** error (`email-verification.mjs:272-273`) → `/` → login.
- **Success** → redirect to `/` (never `?verified=1`), so the "Email verified" render is
  unreachable via the link too.

The `&error=` contract in the page comment is real in BetterAuth — it just gets appended to
`/`, not to the verify-email page, because the callbackURL is wrong.

## Decision / fix

Repoint the four `callbackUrl` params from the string form to the structured target the new
schema requires, keeping the same destination:

```yaml
callbackUrl:
  pageId:
    _module.pageId: verify-email
  urlQuery:
    verified: "1"
    email:
      _state: email # verify_email in verify-email.yaml; signup_email in signup_resend
```

This fixes success **and** all failures at once with no page-logic change: the emailed link's
callbackURL becomes `/user-account/verify-email?verified=1&email=<addr>`; BetterAuth appends
`&error=<code>` on failure, and the page's existing `onInit` seeds `expired` (email survives
for the resend) or `success` accordingly — exactly the design the header comment describes.
No app-level change is needed (the module is the source; all consumers inherit the fix).
Related to [F2](_completed/F2-login-resend-verification.md) (resend affordance) — same
verify/login dead-end family.
