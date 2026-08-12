# F44 — Manage-modal TOTP enrolment redirects to home as codes render (codes flash, then lost)

**Status:** `root-caused` · **Area:** user-account / 2FA enrolment

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

- **Supersedes F35's scope-narrowing.** [F35](../F35-totp-enrol-backup-codes-not-shown.md)
  concluded the defect was _specific to the forced-enrol page_ and explicitly recorded that
  "the self-service **Manage modal** renders backup codes correctly (confirmed live this run)."
  This report says the modal **no longer holds** the codes — so either a regression since that
  run, or the modal shares the recovery-path failure after all. F35's scope claim needs
  re-checking against this.
- **Suspected shared cause with F33.** The confirm chain runs `TwoFactorVerify` then
  `refetch_account` (which re-fetches `get_account` etc.); enabling 2FA changes the session's
  factor state. If the account page's session-freshness guard reacts to that change the same
  way [F33](F33-onboarding-updatesession-stale-redirect.md) describes — routing on a
  session mutation before/without a settled `UpdateSession` — it would bounce the user off the
  account page mid-modal. `refetch_account` itself contains no navigation (verified:
  `modules/user-account/actions/refetch_account.yaml` is Request + SetState only), so the
  redirect comes from elsewhere in the chain or from a page-level guard.

## Root cause (traced 2026-08-12)

**Not a page/route guard.** No guard is involved — neither F33's session-freshness pattern nor
the app page gate. The redirect is fired by the platform `TwoFactorVerify` action itself, and
its destination is **home because home is the action's default `callbackUrl`** (which is why it
lands on home, not login — a session-loss guard would route to login).

The chain, from the scan-phase confirm button (`modal_enroltotp.yaml`):

1. `verify_totp` (`modal_enroltotp.yaml:528`) runs `TwoFactorVerify` with params `{ code }`
   **only** — no `callbackUrl`.
2. `TwoFactorVerify.js` (actions-core) passes `params` straight to the client method:
   `twoFactorVerify(params)`.
3. `@lowdefy/client` `createAuthMethods.js` → `twoFactorVerify` (line 703) resolves a
   destination with `resolveCallbackURL({ callbackUrl: undefined })`. With no `callbackUrl`
   given, that function walks its ladder — explicit target → `?callbackUrl=` query → **home
   default** (lines 75–82) — and returns the home page target.
4. After the verify resolves, `if (data?.token && callbackTarget && window)
navigateToTarget(callbackTarget)` (line 724) navigates to home. BetterAuth's
   enrolment-confirmation `verifyTotp` returns a `token` (it re-mints the session now that the
   second factor applies), so the token guard is satisfied and the navigation fires.

`SetState phase: codes` and `refetch_account` still run — hence the grid **flashes** — but the
home navigation from step 4 is already in flight, so the page leaves before the codes can be
read. This is the only navigation anywhere in the confirm chain (`refetch_account` is
Request + SetState, confirmed), and it fully accounts for the reported symptom.

**It is new — a regression from the auth-upgrade platform bump, not a latent module bug.** The
navigating behaviour lives in the bumped `@lowdefy/client` `twoFactorVerify`. The module was
written against a _no-navigate_ `TwoFactorVerify` contract, and still documents it: the sign-in
challenge page comment (`two-factor.yaml:80`) reads "TwoFactorVerify sets the session cookie
itself but **does not navigate**, so on success we navigate to the callbackUrl". F35's "modal
works" observation predates the bump, so its scope-narrowing was correct _at the time_ and is
simply overtaken by the platform change — not a contradiction to reconcile.

## Fix direction

The in-session enrolment confirmation must opt out of the navigation. `twoFactorVerify` honours
`callbackUrl: false` (`resolveCallbackURL` returns `undefined` → no navigate; and unlike the
external-hop methods it does **not** call `assertCallbackUrlNavigable`, so `false` is legal
here). Pass `callbackUrl: false` in `verify_totp`'s params so the modal holds on phase `codes`.

**Check the sibling before fixing.** The sign-in challenge page (`two-factor.yaml`) has the same
shape and the same now-stale assumption: its `TwoFactorVerify` also passes no `callbackUrl`, so
the platform now navigates it to **home** by default, _then_ its explicit `Link` to
`?callbackUrl=` fires — a double navigation that can land the user on home instead of the page
they asked for. Fold this into the fix: either give that call the real `callbackUrl` (dropping
the now-redundant `Link`) or pass `callbackUrl: false` and keep the explicit `Link`. Decide one
contract for "verify then route" across both consumers rather than patching only the modal.
