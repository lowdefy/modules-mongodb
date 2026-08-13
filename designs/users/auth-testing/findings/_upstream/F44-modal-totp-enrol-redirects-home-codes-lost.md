# F44 — TOTP enrolment redirects to home after verify; backup codes lost (modal + forced-enrol)

**Status:** `root-caused` · **Area:** user-account / 2FA enrolment

TOTP enrolment completes, then the platform `TwoFactorVerify` action **navigates the page to
home** before the backup codes can be read or saved. BetterAuth returns plaintext backup codes
**exactly once**, in the enable/verify response, and stores them encrypted thereafter — so a
redirect that fires while (or before) the codes are on screen leaves them **unrecoverable**.
The affected user has a TOTP factor with no usable self-service recovery path.

Two surfaces hit the same bug with different visible symptoms:

- **Manage modal** (`modal_enroltotp.yaml`) — the self-service happy path. The codes grid
  **flashes on screen**, then the page redirects home.
- **Forced-enrol page** (`two-factor-enrol.yaml`) — reached under `required` after removing the
  last factor. The codes step **never appears at all**; the user lands in the app.

## Symptom — Manage modal (reporter, 2026-08-11)

- Add 2FA from the Manage modal on the account page.
- The backup codes appear briefly (the `codes` phase renders — grid, "you won't see these
  again" alert), then the page navigates to home. Codes are gone.

## Symptom — forced-enrol page (originally F35)

Enrolling TOTP via the forced-enrol page (`two-factor-enrol.yaml`, reached after removing the
last passkey) completed **without the backup-codes step ever appearing** — no codes grid, no
"I've saved my backup codes" gate — and the user landed in the app.

**Evidence (rig DB):**

- `user-two-factors` row exists with `secret` **and** `backupCodes` present — `backupCodes` is
  an **encrypted string** (362 chars), i.e. codes **were generated** server-side.
- `users.twoFactorEnabled: true`.

So enrolment succeeded and codes exist, but the user was **never shown the plaintext codes**.

> **Evidence caveat:** the developer ran a **regenerate backup codes** action around the same
> time as this DB read, so the `backupCodes` blob observed above **may be from the regenerate,
> not the original enrolment**. Treat it as proof codes exist _now_, not proof of what was
> issued at enrol time. The primary evidence is the user-observed symptom (no codes step during
> TOTP setup, yet able to Continue), which the root cause below explains independently of DB
> state.

## Why this matters

Same broken-recovery outcome on both routes: a TOTP user must be shown their backup codes
**exactly once**, and neither enrolment flow may let them continue past the codes as if setup
succeeded when the codes were never captured.

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
   default** — and returns the home page target.
4. After the verify resolves, `if (data?.token && callbackTarget && window)
navigateToTarget(callbackTarget)` (line 724) navigates to home. BetterAuth's
   enrolment-confirmation `verifyTotp` returns a `token` (it re-mints the session now that the
   second factor applies), so the token guard is satisfied and the navigation fires.

`SetState phase: codes` and `refetch_account` still run — hence the grid **flashes** — but the
home navigation from step 4 is already in flight, so the page leaves before the codes can be
read. This is the only navigation anywhere in the confirm chain (`refetch_account` is
Request + SetState, confirmed), and it fully accounts for the reported symptom.

### Why the forced-enrol page shows _no_ flash

The forced-enrol page's confirm chain is the same bare call — `verify_enrol_totp`
(`two-factor-enrol.yaml:301`) runs `TwoFactorVerify` with `params: { code }` only, no
`callbackUrl` — so the identical home navigation fires. The difference is timing of the codes
UI: the forced-enrol page's done/codes state is gated on `_user.two_factor_enrolled`, which
only flips true **after** the following `UpdateSession` (`refresh_enrol_session`) refreshes
`_user`. The `navigateToTarget(home)` fires the instant `TwoFactorVerify` resolves — racing
ahead of the UpdateSession and re-render — so home wins and the codes state never paints.
Hence "no codes step ever appeared" rather than "codes flashed then lost."

### This corrects F35's original hypothesis

F35 (now merged here) hypothesised that `enrol.backup_codes` was **empty** on the forced-enrol
page — a wrong stash path, or BetterAuth not re-issuing codes. That is disproven:

- The stash paths are **identical** to the working modal. Forced-enrol stashes
  `enrol_enable.response.backupCodes` (`two-factor-enrol.yaml:131-132`); the modal stashes
  `enroltotp_enable.response.backupCodes` (`modal_enroltotp.yaml:244-245`). Same action
  (`TwoFactorEnable`), same `.response.backupCodes` shape.
- The codes are stashed at the **Generate-QR** step (`TwoFactorEnable`), which is why the DB
  evidence shows codes exist. They _were_ in state; the user never reached the screen that
  shows them because the confirm-step home redirect beat the render.

So the forced-enrol failure is not a missing-display bug or an empty-stash bug — it is this
same `TwoFactorVerify` navigation reaching a page whose codes screen is one render slower to
appear.

**It is a regression from the auth-upgrade platform bump, not a latent module bug.** The
navigating behaviour lives in the bumped `@lowdefy/client` `twoFactorVerify`. The module was
written against a _no-navigate_ `TwoFactorVerify` contract, and still documents it: the sign-in
challenge page comment (`two-factor.yaml:80`) reads "TwoFactorVerify sets the session cookie
itself but **does not navigate**, so on success we navigate to the callbackUrl". F35's original
"modal works" observation predated the bump, so its scope-narrowing was correct _at the time_
and is simply overtaken by the platform change.

## Fix direction — upstream

**No module change fixes this properly; the fix belongs in the platform client
(`@lowdefy/client` `twoFactorVerify`).** The root defect is that a successful verify
**navigates by default** — with no `callbackUrl` given, `resolveCallbackURL` walks to the home
default and `navigateToTarget` fires on the returned token. A verify action that navigates to a
destination the caller never named is a footgun: it is what silently discards the one-time
backup codes here, and it is what double-navigates the sign-in page (home, _then_ its explicit
`Link` to `?callbackUrl=`).

**Make post-verify navigation opt-in, not opt-out:** absent an explicit `callbackUrl`,
`twoFactorVerify` should **not** navigate — it should set the session cookie and return, leaving
routing to the caller. Navigation happens only when a caller passes a real `callbackUrl`.
(`callbackUrl: false` already returns `undefined` from `resolveCallbackURL`; this change makes
_absent_ behave the same as _false_, so the safe behaviour is the default.)

This one platform change resolves all three consumers of the action **with no module edits**:

- **Manage modal** (`modal_enroltotp.yaml`, `verify_totp`) — passes no `callbackUrl` → no
  navigation → the modal holds on phase `codes`. Fixed.
- **Forced-enrol page** (`two-factor-enrol.yaml`, `verify_enrol_totp`) — passes no `callbackUrl`
  → no navigation → the done/codes state takes over; the existing `enrol_continue` →
  `Link { home: true }` still navigates deliberately once the user ticks "I've saved my backup
  codes". Fixed.
- **Sign-in challenge page** (`two-factor.yaml`) — passes no `callbackUrl` → no auto-navigation,
  so its explicit `tf_totp_continue` / backup-code `Link` to `?callbackUrl=` becomes the single
  navigation. The current double-nav (home, then callbackUrl) disappears. Fixed.

The module was written against exactly this _no-navigate_ `TwoFactorVerify` contract and still
documents it (`two-factor.yaml:80`: "TwoFactorVerify sets the session cookie itself but **does
not navigate**, so on success we navigate to the callbackUrl"). The upstream change restores
that contract rather than papering over it per-call.

**Owner action:** raise this against `@lowdefy/client` (same area as the already-landed F11
`callback-url-default` change). Until it lands, the module carries no fix — this is a data-loss
bug, so if a stopgap is needed before the release, `callbackUrl: false` on the two enrolment
verifies is a legal interim opt-out, to be reverted once the default flips upstream.
