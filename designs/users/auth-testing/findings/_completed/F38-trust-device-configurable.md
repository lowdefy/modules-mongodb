# F38 — Trust-device should be a simple on/off boolean, disable-able by the deployment

**Status:** `enhancement` · **resolved** · **Area:** user-account / 2FA

**Resolution:** shipped. The upstream engine landed in `@lowdefy/*`
`0.0.0-experimental-20260813120102` (see "Decision" below), and the module-side wiring landed in
this repo: `two-factor.yaml` gates and seeds the trust-device switch from
`_build.authConfig: twoFactor.trustDevice`, and `apps/demo` exercises the disabled state
(`auth.twoFactor.trustDevice: false` alongside its existing `required: true`). Consumer behavior
is documented in `docs/user-account/concepts/auth-methods.md`.

The 2FA challenge offers a "Trust this device for 30 days" switch (pre-checked), and it works — a
trusted device skips the challenge on subsequent logins for the window. Some deployments will want to
**require a second factor on every login** and therefore need to disable trust-device entirely.

## The ask

Expose trust-device as a single **on/off boolean** on the app's `auth.twoFactor` config (alongside
`enabled` / `required`), default on (preserving today's behavior):

- **On** — current behavior (switch shown, 30-day trust available).
- **Off** — challenge on every login; no "trust this device" affordance rendered, and no device is
  trusted server-side.

This is deliberately **not** a configurable duration. The 30-day window stays as-is; the only knob is
disable/enable.

## Answer: this requires an upstream platform change

The disable must be **server-authoritative** (the engine ignores `trustDevice`; already-trusted devices
are re-challenged; a forged `trustDevice: true` cannot bypass). That guarantee is enforced by the
engine, which this repo only consumes — so it lands in the upstream `@lowdefy/*` packages (external
`lowdefy-design` / auth-upgrade repo), delivered as a new `0.0.0-experimental-*` build and reinstalled,
exactly like `passwordless-2fa-management/tasks/01-engine-bump.md`.

**Verified facts:**

- `getBetterAuthConfig.js:384-393` (`@lowdefy/api`) instantiates `twoFactor({ issuer, schema })` with
  **no** trust options; the 30-day value is BetterAuth's hard-coded default
  (`trustDeviceMaxAge ?? 2592e3`, `better-auth/dist/plugins/two-factor/index.mjs:23`). Nothing in this
  repo configures trust-device today.
- `computeAuthConfigProjection.js` (`@lowdefy/build`) is the **allowlist** the `_build.authConfig`
  operator reads — allowlist-only (see its own `:47-49` comment). `twoFactor` currently projects only
  `{ enabled }` (`:35-37`); a new key is invisible to the client until added here. This is why the flag
  must be allowlisted for the auth-config operator to read it, as required.
- **`trustDeviceMaxAge: 0` is the chosen mechanism** (see Decision below). It does not void an
  _already-trusted_ device immediately: the sign-in `after` hook (`index.mjs:190-221`) honors a valid,
  unexpired DB verification record (`:205`) written previously with a 30-day `expiresAt` that a config
  change does not rewrite — so the device bypasses **one** more login (the hook re-issues at
  `Date.now()+0`, flushing on the _next_ login). A true "challenge on every login, immediately" would
  require the engine to short-circuit / not register the trust hook when disabled. We deliberately did
  **not** take that path — see Decision.

## Decision: use BetterAuth's built-in `trustDeviceMaxAge: 0`, accept the one-login flush

The engine disables trust-device by passing `trustDeviceMaxAge: 0` to BetterAuth's `twoFactor()`
plugin when `authConfig.twoFactor.trustDevice === false` (`getBetterAuthConfig.js:384-399`). This is
server-authoritative: no durable trust cookie is minted and a forged `trustDevice: true` cannot
bypass.

**Rejected:** suppressing/not-registering the trust sign-in hook to void already-trusted devices
immediately. It was too complex and flaky for the value — rolling our own path around BetterAuth's
built-in. Leaning on the vendor built-in is the "one correct way."

**Accepted cost:** flipping the flag off does not rewrite trust cookies already issued, so an
already-trusted device bypasses its **next** login one last time before the zero-max-age flushes it;
every login after that is challenged. Config migration on live deployments therefore takes one login
cycle to fully take effect. This is an acceptable trade — it is documented in
`docs/user-account/concepts/auth-methods.md` under the trust-device migration caveat.

## What shipped

### 1. Upstream engine — `@lowdefy/api` + `@lowdefy/build` (shipped `experimental-20260813120102`)

- **`@lowdefy/api getBetterAuthConfig.js:384-399`:** reads `authConfig.twoFactor.trustDevice`; when
  `false`, passes `trustDeviceMaxAge: 0` to the `twoFactor()` plugin (see Decision — the built-in path,
  not hook suppression).
- **`@lowdefy/build computeAuthConfigProjection.js:44`:** projects
  `trustDevice: source.twoFactor?.trustDevice !== false` so `_build.authConfig: twoFactor.trustDevice`
  resolves client-side (default `true`).

### 2. Module-side (this repo)

- **`apps/demo/lowdefy.yaml`:** `auth.twoFactor.trustDevice: false` set alongside the existing
  `required: true` — a coherent "strict 2FA, challenge every login" deployment that build-exercises the
  disabled projection branch.
- **`modules/user-account/pages/two-factor.yaml`:** the `trust_device` switch's `visible` is
  `_and`-ed with `_build.authConfig: twoFactor.trustDevice` (plus the existing `tf_view == auth`), and
  its `onInit` seed reads the same projection — disabled ⇒ hidden + `false`; enabled ⇒ shown +
  pre-checked.
- **`actions/verify_totp.yaml` / `verify_backup.yaml`:** no change — they already coerce
  `trustDevice: { _if_none: [ { _state: trust_device }, false ] }`, which is `false` when the switch is
  hidden/unseeded. The server ignores `trustDevice` when disabled regardless.
- **`docs/user-account/concepts/auth-methods.md`:** documents the on/off semantics, the
  server-authoritative guarantee, and the one-login migration caveat.

### 3. Finding disposition

Resolved and implemented — moved to `findings/_completed/` (the fix shipped; it is not
upstream-blocked, so it does **not** belong in `_upstream/` with F31/F54).

## Verification

- `pnpm ldf:b` from `apps/demo` — build-verify the config compiles and
  `_build.authConfig: twoFactor.trustDevice` resolves.
- `lowdefy_get_page_config` on `two-factor` + `lowdefy_screenshot_page` with the flag on vs off — the
  switch renders / is absent.
- End-to-end (human / `/r:dev-test`, needs real secrets + Mongo): with `trustDevice: false`, a
  previously-trusted device is challenged on next login and no trust cookie is issued; with `true`, the
  30-day skip is unchanged.
