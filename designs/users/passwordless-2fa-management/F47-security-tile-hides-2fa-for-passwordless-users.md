# F47 — Security tile hides 2FA enrolment from magic-link / OAuth-only users

**Status:** `promoted` → [passwordless-2fa-management](./design.md) · **Area:** user-account / security tile + 2FA enrolment

A magic-link-only user (no credential) has **no way to add 2FA** on the account Security tile —
the whole two-factor row is hidden. This contradicts the
[two-factor-lifecycle](../../../../lowdefy-design/designs/auth-upgrade/_completed/two-factor-lifecycle/design.md)
design, which sets **`allowPasswordless: true`** on the twoFactor plugin _specifically so OAuth
and magic-link users can enrol TOTP_ (design lines 36–38), and calls the always-on waiver a
guard against a **permanent lockout** for passwordless users under `required`.

## Root cause

`modules/user-account/components/view/tile_security.yaml:133` gates the **two-factor row** on the
per-user credential gate:

```yaml
visible:
  _request: get_accounts.0.has_credential
```

`has_credential` is `false` for an OAuth/magic-link-only user, so the row is hidden. The tile's
header comment (lines 8–10) states the reasoning: "an OAuth/magic-link-only user has no
credential and changePassword / twoFactor._ would 400". That is true for `changePassword` but
**not** for `twoFactor._`— BetterAuth's`shouldRequirePassword`returns`false`for those
endpoints precisely because`allowPasswordless` is set (design lines 351–364). The credential
gate is correct on the **password row** (`:77`) and over-applied on the **two-factor row**
(`:133`).

## Impact

- Self-service 2FA enrolment is unreachable for passwordless users — the population
  `allowPasswordless` exists to serve.
- Under `twoFactor.required: true` these users are force-routed to the enrol _page_ at login, but
  the Security tile — their normal management surface — still can't add, replace, or view 2FA.

## The open decision

The password and two-factor rows now need to gate **differently**: password stays behind
`has_credential`, two-factor must not. Confirm the intended rule and apply it consistently
(does the passkey row have the same over-gate?). The "one correct way" question: the tile's
per-row gate should mirror what each BetterAuth endpoint actually requires under
`allowPasswordless`, not a blanket `has_credential` on every sign-in row.

**Also corrects the campaign checklist:** Phase 2 line 15 expects "password + 2FA controls
hidden" for credential-less users. Only the **password** control should hide; the 2FA control
must remain.
