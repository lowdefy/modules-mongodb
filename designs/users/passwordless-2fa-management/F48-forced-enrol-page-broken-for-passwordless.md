# F48 — Forced two-factor-enrol page is broken for a passwordless user under `required`

**Status:** `promoted` → [passwordless-2fa-management](./design.md) · **Area:** user-account / 2FA enrolment (forced-enrol page)

With `twoFactor.required: true` and a **magic-link / passwordless** user, login force-routes to
`two-factor-enrol.yaml`. Two defects there make TOTP enrolment unreachable — the permanent
lockout the [two-factor-lifecycle](../../../../lowdefy-design/designs/auth-upgrade/_completed/two-factor-lifecycle/design.md)
design's `allowPasswordless` was meant to prevent (design lines 36–38). Passkey is left as the
only working enrol route. Grouped; both live on the same page.

## 1. Generate QR / `TwoFactorEnable` rejects a passwordless caller (CRITICAL)

**Symptom (2026-08-11):** clicking Generate QR errors:
`Action "TwoFactorEnable" param "password" must be type "string".` — for a user who has no
password.

**Root cause:** `two-factor-enrol.yaml:119-124` calls `TwoFactorEnable` with
`password: { _state: enrol.password }`. For a passwordless caller the field is untouched, so
`enrol.password` is **`null`**, and the action's own param validation requires `password` to be
a **string** — it rejects `null` **before** the request reaches BetterAuth, so
`allowPasswordless` never gets to waive it. The page header comment (lines 19–24) assumes "a
blank password is legitimate … surfaced by the enable catch", but "blank" for an untouched
field is `null`, not `""`, and the type-check fails client-side, not in the catch.

**Effect:** a passwordless user cannot enrol TOTP at all. Under `required` their only remaining
enrol route is a passkey.

## 2. Done-state shows "Two-factor is set up" + a Continue button that loops

**Symptom:** the "Two-factor is set up on your account." message and the **Continue** button are
visible when the user is not actually enrolled, and Continue does nothing — the `required` gate
redirects straight back to the enrol page.

**Mechanism:** both `enrol_done_msg` (`:316`) and `enrol_continue` (`:407`) are gated on
`_user.two_factor_enrolled`; Continue fires `Link {home:true}`. The client `_user` fact and the
server enrolment gate disagree (client says enrolled, gate says not), so Continue bounces back —
a redirect loop. Needs root-cause: is `_user.two_factor_enrolled` stale/true without a real
server-side factor, or is the gate reading a different source than the page?

## The open decision

For (1): pass a string (`default: ''`) so a passwordless caller sends `""` and lets
`allowPasswordless` do its job, or gate the password param so it's only sent for password
callers — decide the one correct way and mirror it in the Manage-modal enrol chain
(`modal_enroltotp.yaml`), which passes `password` the same way. For (2): reconcile the page's
`_user.two_factor_enrolled` gate with the server enrolment gate so the done-state and Continue
only appear when the gate will actually admit the user.
