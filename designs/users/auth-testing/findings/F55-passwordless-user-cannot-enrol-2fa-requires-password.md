# F55 — Magic-link / passwordless user cannot enrol 2FA: enrolment still demands a password

**Status:** `fixed` (`e9986305` — all in-repo tasks applied; runtime smoke with a passwordless member
still owed, see Resolution) · **Area:** user-account / 2FA enrolment
· **Owner:** [passwordless-2fa-management](../../passwordless-2fa-management/design.md) — **implemented**

Signing in with a magic link and then trying to enrol two-factor auth fails: the flow presents /
requires an **account password**, which a passwordless member does not have. This is the exact
population `allowPasswordless` exists to serve being locked out of self-service 2FA — the symptom
[F48](../../passwordless-2fa-management/F48-forced-enrol-page-broken-for-passwordless.md) documented and
the [passwordless-2fa-management](../../passwordless-2fa-management/design.md) design was written to fix.

## Why it's still broken — the design was never implemented (not an upstream wait)

The design records itself as **blocked on one upstream engine bump**: the twoFactor plugin had to be
instantiated with `allowPasswordless: true` in `@lowdefy/api`, "absent in every installed build" at
the time it was written. **That dependency has since landed.** The installed
`@lowdefy/api@0.0.0-experimental-20260813120102` (this branch's current pin, commit `5abccd35`) now does:

```js
// node_modules/.pnpm/@lowdefy+api@…20260813120102…/dist/routes/auth/getBetterAuthConfig.js:385
options.plugins.push(twoFactor({
  allowPasswordless: true,
  issuer: appMeta?.name,
  …
```

So the server would now waive the password per-user for a caller with no credential. **What's missing
is the module-side half — none of the design's in-repo tasks were applied.** All four blast-radius
surfaces are still in their pre-design state:

- **Manage modal** (`modules/user-account/components/view/modal_enroltotp.yaml`) — still hard-requires a
  password: a dedicated `phase: password`, a `Validate` on `enroltotp.password` (`:224`), and
  `TwoFactorEnable` sent `password: { _state: enroltotp.password }` (`:236`), **no `_if_none` coalesce**.
- **Forced-enrol page** (`modules/user-account/pages/two-factor-enrol.yaml`) — its header comment
  (`:19-24`) already _claims_ the passwordless design ("password … NOT required/validated … a blank
  password is legitimate … surfaced by the enable catch"), but that is the **exact mistaken assumption
  F48 flagged**: the field is untouched → `null`, and `TwoFactorEnable` sends
  `password: { _state: enrol.password }` (`:120-121`) with **no coalesce**, so the action's own
  param type-check rejects `null` client-side (`Action "TwoFactorEnable" param "password" must be
type "string"`) _before_ `allowPasswordless` can waive it. The Validate was removed but the coalesce
  was never added, so the page is broken in the subtle way F48 part 1 describes.
- **Tile** (`modules/user-account/components/view/tile_security.yaml:133`) — the 2FA row is still
  `visible: get_accounts.0.has_credential`, so on the account page a passwordless-only member never even
  sees the enrol control (F47). A member who reaches a password prompt therefore hit either the
  **forced-enrol page** (`required: true` force-route) or has a credential and is being asked for a
  password they didn't want to use.
- **Done-state flag** (Decision 3) — the enrol page still gates its done state on
  `_user: two_factor_enrolled` throughout, not the local `enrol.done` flag the design specifies.

## Fix already specified — just needs building

The whole resolution is written up in
[passwordless-2fa-management/tasks/tasks.md](../../passwordless-2fa-management/tasks/tasks.md): the rule is
"password field shown/required/validated **iff** `has_credential`; the `password` param **always sent as
a string** (empty when the caller holds none) via `{ _if_none: [ { _state: <ns>.password }, '' ] }`,
letting `allowPasswordless` waive it server-side." Tasks 3 (tile + both modals) and 4 (forced-enrol page)
were gated on the engine bump; **the bump is now installed, so they are unblocked and should be built.**
Task 1 (engine bump) can be marked done.

## Resolution

The "still in their pre-design state" section above records the state **before** `e9986305`
(`fix(user-account): Enrol 2FA without a password for passwordless members (F55)`), which landed the
same afternoon this finding was logged and applied every in-repo task: the tile's 2FA row is ungated,
all four `modal_enroltotp` param sites and `modal_disable2fa` coalesce null→`''` with `has_credential`
gating field/intro/Validate, and the forced-enrol page runs the self-scoped `get_accounts`, gates its
password field, coalesces the enable param, and drives its done-state off the local `enrol.done` flag.
Both engine prerequisites (`allowPasswordless: true`, `pageId` forwarding) are confirmed in the pinned
build. Still owed before this can be marked verified: a runtime smoke with a genuinely passwordless
member (magic-link only) through both the tile modals and the forced-enrol page under
`twoFactor.required: true` — [F56](./F56-two-factor-enable-request-slow.md) (slow `two-factor/enable`)
remains open and untouched.
