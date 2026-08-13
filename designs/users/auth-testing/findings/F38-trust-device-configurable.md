# F38 — Trust-device should be a simple on/off boolean, disable-able by the deployment

**Status:** `enhancement` · **upstream-blocked** · **Area:** user-account / 2FA

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
- **`trustDeviceMaxAge: 0` alone is insufficient** to void an _already-trusted_ device immediately. The
  sign-in `after` hook (`index.mjs:190-221`) honors a valid, unexpired DB verification record (`:205`)
  written previously with a 30-day `expiresAt` that a config change does not rewrite — so the device
  still bypasses **one** more login (the hook re-issues at `Date.now()+0`, flushing on the _next_
  login). For a true "challenge on every login, immediately," the engine must **short-circuit / not
  register that trust hook** when disabled, not merely zero the max-age. This is the engine owner's
  design call and is the key acceptance criterion for the upstream task.

## Plan

### 1. Upstream engine bump — `@lowdefy/api` + `@lowdefy/build` (external repo)

- **`@lowdefy/api getBetterAuthConfig.js` (~:385):** read `authConfig.twoFactor.trustDevice` (default
  `true`). When `false`, disable trust-device authoritatively — suppress the trust sign-in hook so no
  cookie is honored and every login is challenged, and stop issuing new trust cookies. (Zeroing the
  max-age alone is not enough — see the nuance above.)
- **`@lowdefy/build computeAuthConfigProjection.js` (:35-37):** add
  `trustDevice: source.twoFactor?.trustDevice !== false` to the `twoFactor` projection so
  `_build.authConfig: twoFactor.trustDevice` resolves client-side.
- **Auth-config schema:** ensure `twoFactor.trustDevice: boolean` is accepted (`validateAuthConfig.js`
  is semantic-only and won't reject it, but confirm the strict zod schema in `lowdefySchema.js`).
- **Acceptance:** with `trustDevice: false`, a previously-trusted device is challenged on its next
  login, no trust cookie is issued, and a forged `trustDevice: true` does not bypass; default
  (`true` / unset) preserves today's 30-day behavior. Add engine tests; publish and bump
  `@lowdefy/api` + `@lowdefy/build` in `apps/demo`.

### 2. Module-side (this repo — lands once the bump is installed)

- **`apps/demo/lowdefy.yaml` (:58-60):** the flag lives here (`twoFactor.trustDevice: <bool>`). Exercise
  the **disabled** state in a demo (e.g. `passwordless-demo`, or a documented example) so
  `_build.authConfig: twoFactor.trustDevice` is build-verified in both states.
- **`modules/user-account/pages/two-factor.yaml`:** gate the `trust_device` switch's `visible` on
  `_build.authConfig: twoFactor.trustDevice` (AND the existing `tf_view == auth`), and seed
  `trust_device`'s init value (`:23`) from the projection instead of the hard `true` "mock default" —
  disabled ⇒ hidden + `false`; enabled ⇒ shown + pre-checked (current behavior). Replace the "mock
  default" comment with a one-line note that the seed follows the auth config.
- **`actions/verify_totp.yaml` / `verify_backup.yaml`:** no change — they already send
  `trustDevice: { _state: trust_device }`, which is `false` when disabled.
- **`docs/`** (source of truth for consumer behavior): document `auth.twoFactor.trustDevice` on the
  auth-methods / 2FA reference page — what on/off does, and that off requires 2FA on every login.

### 3. Finding disposition

Its fix is blocked on the platform, so this finding belongs in `findings/_upstream/` alongside
F31/F54. Move when convenient.

## Verification

- `pnpm ldf:b` from `apps/demo` — build-verify the config compiles and
  `_build.authConfig: twoFactor.trustDevice` resolves.
- `lowdefy_get_page_config` on `two-factor` + `lowdefy_screenshot_page` with the flag on vs off — the
  switch renders / is absent.
- End-to-end (human / `/r:dev-test`, needs real secrets + Mongo): with `trustDevice: false`, a
  previously-trusted device is challenged on next login and no trust cookie is issued; with `true`, the
  30-day skip is unchanged.
