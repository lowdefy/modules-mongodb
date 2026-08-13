# F34 — Removing the last 2FA method dumps the user through a raw endpoint-gate error into forced re-enrolment

**Status:** `designed` (in-finding) · **Area:** user-account / 2FA + auth-flow · **Upstream
prerequisite:** `twoFactor.required` readable via `_build.authConfig` (one-line allowlist add)

With `twoFactor.required: true`, any action that takes the caller to **zero** enrolled second
factors leaves them unenrolled mid-session. The engine's `required` gate then refuses the very
next Lowdefy endpoint call, and the user experiences:

1. A **raw error** surfaced to the UI — _"Two-factor enrolment required for request
   `'<request_id>'`"_ — leaking an internal Lowdefy request id.
2. The page **hangs in a loading state**.
3. An **abrupt redirect** to the forced two-factor enrolment page
   (`two-factor-enrol.yaml`), which **doesn't feel "inside the app"** (it renders on the
   chrome-less auth-page shell — see [F32](../../auth-page-polish/F32-auth-page-visual-polish.md)).

## Root cause — verified

The enforcement is correct-by-design (**you cannot be left with no second factor while 2FA is
required**); the defect is that the module lets the caller _reach_ the zero-factor state and
then a routine re-hydrate request trips the gate as a raw error. Two things were confirmed
against the engine source, and they widen the scope beyond the passkey case first reproduced:

- **The gate reads fresh, per request.** `session.cookieCache.enabled` defaults to **`false`**
  (`@lowdefy/build/.../buildAuth/setAuthDefaults.js`) and the demo does not override it, so
  `resolveAuthentication` calls `getSession({ headers })` with no cookie cache and reads
  `twoFactorEnabled` **live from the DB every request** (`resolveAuthentication.js:67,156`). The
  enrolment fact is computed as `twoFactorEnrolled = session.user.twoFactorEnabled === true`,
  and — only when that is false — `|| passkeyCount > 0` from a **live** `user-passkeys` count
  (`resolveAuthentication.js:156-169`; gate applied in `createAuthorizeOutcome.js:64`). (F45's
  staleness is the _client_ `_user`; the server gate is not stale.)
- **So both removal paths trip, not just passkeys.** F34 first reproduced deleting the only
  passkey, but turning off the only **TOTP** trips identically: `TwoFactorDisable` sets
  `two_factor_enabled = false`, and the next request's fresh gate (no passkey → count 0) refuses
  it. The passkey-only repro just happened to exercise the `passkeyCount` branch.

## Decision — prevent the zero-factor state; don't recover from it

Rejected **graceful handoff** (let the removal happen, catch the gate error, route into
enrolment). Under `required` a zero-factor state is never a legitimate end-state, so it is
better to prevent it at the point of action than to strand the user and re-route them. Blocking
also produces no raw error, no loading hang, and no churn. The one case that made "block" look
unviable — a **TOTP-only** account that can hold only one TOTP and (with passkeys off) has no
"add another first" — is resolved by the existing atomic **Replace** path, once Part B repairs
it. Industry norm agrees: enforced-2FA products (GitHub org, Entra, Okta) do not offer a
"disable" once 2FA is mandated; they offer **reconfigure/replace**, and encourage a backup
method rather than allow a strand-to-zero.

The fix is **two parts**, both riding a single upstream add.

### Part A — block last-factor removal under `required`

In `tile_security.yaml`, when `_build.authConfig: twoFactor.required` is on, guard the two
controls that can reach zero. The post-action enrolment count is available in-module from
`get_account.0.two_factor_enabled` and the live `passkeys_ui` mirror (seeded from
`get_passkeys`), so the guard needs no new request:

- **"Turn off" (`twofa_disable_btn`, `:235`)** — strands iff **no passkey remains**
  (`_array.length` of `passkeys_ui` is 0). With a passkey present, turning off TOTP is safe
  (the passkey still satisfies the floor) and is left alone.
- **Passkey "remove" (`passkeys_ui.$.remove`, `:347`)** — strands iff **TOTP is off _and_ this
  is the only passkey** (`two_factor_enabled` false and `passkeys_ui` length 1). Removing a
  passkey while another factor remains is left alone.

**Affordance — intercept with a guiding message** (not a hidden control). Keep the button
visible; branch its onClick with `skip` (repo "conditional skip on actions"):

- when the guard fires → a `DisplayMessage` explaining the policy and pointing at the right
  action — TOTP: _"Two-factor is required for your account, so it can't be turned off. To switch
  authenticators, use **Replace** under Manage."_; passkey: _"This is your only second factor.
  **Add another passkey** before removing this one."_
- otherwise → the existing action (open `modal_disable2fa`, or `PasskeyDelete` + refetch).

Hiding the control (the enterprise "no disable button when enforced" pattern) is the considered
alternative; intercept-with-message is chosen for discoverability — it explains _why_ and names
the path forward, where a vanished button explains nothing. Wrap the whole guard in `_build.if:
{ _build.authConfig: twoFactor.required }` so a `required: false` deployment builds byte-identical
to today (removal to zero legitimately turns 2FA off; no gate to trip).

Because "Turn off" is now shown only when the disable is non-stranding, `modal_disable2fa`'s copy
_"you can set it up again at any time"_ stays true wherever the modal can open — no copy change.

### Part B — repair Replace so it works under `required` (newly found here)

The Manage modal's **Replace** rotates a TOTP as disable-then-re-enrol
(`modal_enroltotp.yaml:21-29`). Its onClick runs a **mid-flight `refetch_account` between the
disable and the re-enable** (`modal_enroltotp.yaml:293-298`). The disable/enable/verify are
BetterAuth `/api/auth/*` actions and are **not** gated; but that mid-flight `refetch_account` is
a **Lowdefy `get_account` request**, fired while the caller is transiently unenrolled. For any
user with **no passkey** (TOTP-only, incl. every passwordless member) under `required`, it hits
the same fresh gate, throws, and aborts the chain **before** the re-enable — leaving 2FA off and
the user stranded mid-rotation. So Replace, the escape Part A points TOTP users to, is itself
broken under `required` for exactly that population.

**Fix:** the mid-flight refetch exists only to keep the tile honest if the re-enable throws
(`:293-297`). Under `required` it can never run (it is the gated call), and the success path does
not need it — the disable/enable/verify are ungated, and the **final** refetch (after verify,
`:544`) runs once the caller is enrolled again. So wrap the mid-flight refetch in `_build.if: {
_build.authConfig: twoFactor.required }` and **omit it when `required`**, keep it when not. The
only thing lost under `required` is a cosmetic stale-"On" tile on a _failed_ re-enable, which
self-corrects on the next navigation (forced-enrol) regardless. Net: no gated call while
unenrolled; Replace rotates cleanly for TOTP-only users under `required`.

## Upstream prerequisite (cheap)

`_build.authConfig` reads a curated allowlist (`@lowdefy/operators-js/.../build/authConfig.js`,
`readablePaths`); `twoFactor.enabled` is readable but **`twoFactor.required` is not** (reading it
throws "unreadable path"). Both parts gate on `twoFactor.required`, so add the string
`'twoFactor.required'` to `readablePaths` — a one-line, build-time-only addition, the same shape
as the passwordless-2fa design's upstream facts. This is the single prerequisite for building
either part; there is no in-module substitute for reading the deployment's `required` policy
(no `_user` fact or global exposes it — confirmed).

## Files changed

- `modules/user-account/components/view/tile_security.yaml` — Part A: `_build.if(twoFactor.required)`
  guards on `twofa_disable_btn` (`:235`) and `passkeys_ui.$.remove` (`:347`), each branching the
  onClick between a guiding `DisplayMessage` and the existing action via `skip`.
- `modules/user-account/components/view/modal_enroltotp.yaml` — Part B: wrap the mid-flight
  `refetch_account` (`:298`) in `_build.if({ _build.authConfig: twoFactor.required })`, omit-when-required.
- **Upstream** `@lowdefy/operators-js/.../build/authConfig.js` — add `'twoFactor.required'` to
  `readablePaths`.

## Verification

Build (`pnpm ldf:b`) confirms the config compiles once the allowlist add lands (without it, the
`_build.authConfig: twoFactor.required` reads fail the build — a positive signal the prerequisite
is wired). End-to-end needs the running rig with `required: true` and seeded members (a
`/r:dev-test` step, not an autonomous gate):

1. **TOTP-only, no passkey** — "Turn off" shows the guard message, does nothing; Manage → Replace
   rotates the authenticator to completion with **no** raw error and **no** forced-enrol bounce
   (this is the case that confirms Part B).
2. **Passkey-only** — the sole passkey's remove shows the guard message; adding a second passkey
   then allows removing the first.
3. **TOTP + passkey** — "Turn off" and either passkey's remove both work normally (a factor
   always remains).
4. **`required: false` deployment** — removal to zero turns 2FA fully off, unchanged from today.

## Scope / related

- **F32** — the forced-enrol destination's "not inside the app" feel (auth-page shell chrome).
  Untouched here; Part A means a compliant user no longer reaches it by this route.
- **F45** — stale _client_ `_user` after tile mutations. Orthogonal: the server gate is fresh
  (confirmed above). If F45 is later fixed by adding `UpdateSession` to the tile mutations, the
  Part B `_build.if` still holds (the mid-flight refetch is simply absent under `required`).
- **F46** — abandoning a Replace leaves an unverified `user-two-factors` row; and, under
  `required`, an abandoned Replace leaves 2FA off → forced-enrol on next navigation (inherent to
  disable-first rotation). Cleanup/abandon handling stays F46's concern.
- **passwordless-2fa-management** — the password-field waiver on these same surfaces
  (`modal_enroltotp`, `modal_disable2fa`). Independent of F34's factor-count guard; both must hold
  for a passwordless member to rotate under `required`.
