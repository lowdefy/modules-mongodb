# Task 3: Decision 1 — request-backed surfaces gate on `has_credential`

## Context

The Security tile and its two management modals inherited a password gate that is correct for
the password **row** but wrong for the 2FA row and the modals: it locks a magic-link / OAuth-only
(passwordless) member out of 2FA entirely (F47), and — once the row is unhidden — makes every
modal reject them.

Apply the rule uniformly (see Global Constraints in `tasks.md`): password field **shown,
required, validated iff `get_accounts.0.has_credential`**; `password` param **always a string**,
`''` when the caller holds none, letting `allowPasswordless` waive it server-side.

**Prerequisite:** this task sends `password: ''` for passwordless callers, which the server only
accepts once Task 1's `allowPasswordless: true` is installed. Land this in the same wave as the
engine bump; before it, a passwordless caller still hits `INVALID_PASSWORD` (same locked-out
state, different error surface — not a regression for password callers).

`get_accounts.0.has_credential` is the `$facet` flag already computed in
`modules/user-account/requests/get_accounts.yaml` and already read by the tile's password row.

## Task

### 1. `modules/user-account/components/view/tile_security.yaml`

- Remove the `visible: { _request: get_accounts.0.has_credential }` gate from `twofa_row`
  (`:130-133`). The 2FA row then shows whenever the deployment gate
  (`_build.authConfig: twoFactor.enabled`) passes, matching the passkey row.
- Correct the header comment (`:6-11`), which currently claims **both** the password and
  two-factor rows require the per-user credential gate. Only the password row does now; the 2FA
  row is deployment-gated only, and its modals waive the password per-user under
  `allowPasswordless`.

### 2. `modules/user-account/components/view/modal_enroltotp.yaml`

- **Field visibility** — `enroltotp.password.visible` (`:187`, currently `_eq [enroltotp.phase,
password]`) gains an AND with `_request: get_accounts.0.has_credential`.
- **Intro copy** — `enroltotp_intro_setup.visible` (`:147`, currently `_eq [enroltotp.phase,
password]`) gains the same `has_credential` AND. (The block's internal `_switch` for the
  enrol/replace vs `codes_only` wording is unchanged.) A passwordless caller on the `password`
  phase then sees the title + the primary action button (Generate QR / Replace / Get codes) and
  no password prompt.
- **Validation skip** — each of the three `Validate` steps gets
  `skip: { _not: { _request: get_accounts.0.has_credential } }`:
  `validate_enrol_password` (`:224`), `validate_replace_password` (`:274`),
  `validate_getcodes_password` (`:362`).
- **Param coalesce — four sites.** Replace `password: { _state: enroltotp.password }` with
  `password: { _if_none: [ { _state: enroltotp.password }, '' ] }` on:
  - `enroltotp_enable` (`TwoFactorEnable`, `:237`) — the `enrol` chain.
  - `enroltotp_replace_disable` (`TwoFactorDisable`, `:287`) — the `replace` chain, call 1.
  - `enroltotp_replace_enable` (`TwoFactorEnable`, `:305`) — the `replace` chain, call 2.
  - `enroltotp_generate_codes` (`TwoFactorGenerateBackupCodes`, `:379`) — the `codes_only` chain.

  The `replace` chain sends `password` to **both** disable and enable — coalesce both or the
  untouched-field null re-breaks whichever is missed.

### 3. `modules/user-account/components/view/modal_disable2fa.yaml`

- **Field visibility** — the field `disable2fa.password` (`:49`) has no phase gate, so add
  `visible: { _request: get_accounts.0.has_credential }` (alone; no AND).
- **Validation skip** — `validate_disable2fa` (`:26`, `regex: '^disable2fa\.'`) gets
  `skip: { _not: { _request: get_accounts.0.has_credential } }`.
- **Param coalesce** — `disable_totp` (`TwoFactorDisable`, `:37-38`) `password` becomes
  `{ _if_none: [ { _state: disable2fa.password }, '' ] }`.
- No intro copy to gate (the only body copy is the "removes the second step" warning, correct for
  every caller).

### 4. `modules/user-account/requests/get_accounts.yaml`

- Correct the `:9-12` comment on the `has_credential` facet. It currently states `changePassword`
  / `twoFactor.*` would 400 for a passwordless caller. Only **`changePassword`** 400s;
  `twoFactor.*` waives per-user under `allowPasswordless` (the false claim this design refutes).
  The facet itself is unchanged — still the correct password-row gate.

## Acceptance Criteria

- A passwordless caller (`has_credential` false) sees the 2FA row, and on every modal path
  (enrol / replace / codes_only / disable) sees no password field, is not blocked by `Validate`,
  and the action fires with `password: ''`.
- A password caller (`has_credential` true) sees and must fill the field exactly as before; a
  blank field is caught by `Validate` (not round-tripped to a misleading server error).
- All four `modal_enroltotp` param sites and the one `modal_disable2fa` site coalesce.
- Keep `required: true` on both password inputs (it governs password callers; passwordless
  callers never see the hidden field).
- `pnpm ldf:b` builds clean (verified in Task 6).

## Files

- `modules/user-account/components/view/tile_security.yaml` — modify — drop `twofa_row` gate; fix header comment.
- `modules/user-account/components/view/modal_enroltotp.yaml` — modify — visibility + intro + 3 Validate skips + 4 param coalesces.
- `modules/user-account/components/view/modal_disable2fa.yaml` — modify — field visibility + Validate skip + 1 param coalesce.
- `modules/user-account/requests/get_accounts.yaml` — modify — correct the `:9-12` facet comment.

## Notes

- `has_credential` is an exact proxy here (no path in this suite creates a password-less
  credential row), so the `has_credential` test is correct as written — do not add a
  `has_password` conjunct.
- Should land in the same commit/PR wave as Task 1 and Task 4 (see `tasks.md` ordering).
