# Task 6: Security-tile recovery controls + view-page wiring

## Context

This task adds the two recovery controls to the Security tile and wires the two dialogs and the
per-credential read into the detail page. It is the last link in the user-admin chain — the buttons open
the dialogs (tasks 4, 5), which call the routines (task 3) against the read (task 2).

Two facts from Decision 4 shape where the controls render:

- **"Beside the badge" is intent, not mechanism.** The `MFA · TOTP` and `Passkey` badges live inside one
  read-only `_nunjucks` `Html` block (`auth_methods`) in `tile_security.yaml`, so a `Button` cannot be
  interleaved among them. The two controls sit in **their own actions row beneath the Auth-methods
  badges** — a sibling row, not inline markup. The existing `security_actions` row (suspend / remove /
  sign-out / delete) is untouched.
- **No new var gates them.** Whether each control is _built at all_ keys on `_build.authConfig`
  (`twoFactor.enabled` for reset, `passkey.enabled` for revoke); its _per-user visibility_ keys on the
  same runtime fact its badge reads (`get_user_detail.0.two_factor_enabled` for reset,
  `get_user_detail.0.passkey_count > 0` for revoke). Restating either as a var is the mirror-var drift
  `_build.authConfig` exists to prevent.

## Interfaces

- **Consumes:** blocks `modal_reset_2fa` (task 4) and `modal_revoke_passkeys` (task 5); request
  `get_user_passkeys` (task 2); existing `get_user_detail` reads.
- **Produces:** the rendered recovery controls and the page wiring that makes the dialogs and read live.

## Task

**1. `modules/user-admin/components/view/tile_security.yaml`** — add a new actions row beneath the
`auth_methods` `Html` block (after the "Auth methods" section, a sibling inside `security_body`):

- A `Box` (`direction: row`, `gap: 8`) whose `blocks` are built with `_build.array.concat` so each control
  is present only when its factor is possible in the deployment:
  - **Reset control** — wrapped in `_build.if` on `_build.authConfig: twoFactor.enabled`; a `Button`
    titled **"Reset two-factor authentication"**, `danger: true`, `variant: outlined`, with
    `visible: { _request: get_user_detail.0.two_factor_enabled }` and an `onClick` `CallMethod`
    `toggleOpen` on `modal_reset_2fa` (mirror the existing `open_revoke_modal` button).
  - **Revoke control** — wrapped in `_build.if` on `_build.authConfig: passkey.enabled`; a `Button`
    titled **"Revoke passkeys"**, `danger: true`, `variant: outlined`, with
    `visible: { _gt: [ { _request: get_user_detail.0.passkey_count }, 0 ] }` and an `onClick`
    `CallMethod` `toggleOpen` on `modal_revoke_passkeys`.
- Use snake_case block ids (e.g. `security_recovery_actions`, `reset_2fa_btn`, `revoke_passkeys_btn`,
  `open_reset_2fa_modal`, `open_revoke_passkeys_modal`).

**2. `modules/user-admin/pages/view.yaml`** — wire the new pieces:

- Add `- _ref: requests/get_user_passkeys.yaml` to the `requests:` list.
- Add `get_user_passkeys` to the `onMount` `fetch_detail` Request params array (alongside
  `get_user_detail`, `get_user_sessions`, …).
- Add `- _ref: components/view/modal_reset_2fa.yaml` and
  `- _ref: components/view/modal_revoke_passkeys.yaml` to the interaction-state modal siblings at the end
  of `blocks` (beside the existing seven modal `_ref`s).

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` compiles; the built `view` page config
  (`.lowdefy/server/build/pages/**` or `lowdefy_get_page_config`) shows both new buttons and both new
  modal blocks, and `get_user_passkeys` in the page's requests.
- In a deployment with `twoFactor.enabled` false the reset button is absent from the built config; with
  `passkey.enabled` false the revoke button is absent (build-gate). The demo enables both, so both appear.
- Buttons carry the per-user `visible` gates (`two_factor_enabled` / `passkey_count > 0`).
- The existing `security_actions` row and all prior tile content are unchanged.

## Files

- `modules/user-admin/components/view/tile_security.yaml` — modify — add the recovery actions row.
- `modules/user-admin/pages/view.yaml` — modify — add the read (requests + onMount) and the two modal refs.

## Notes

`_build.authConfig` reads the app's auth config at build time (used throughout the module, e.g.
`modal_access.yaml`, `invite_form.yaml`) — confirm the exact key paths (`twoFactor.enabled`,
`passkey.enabled`) resolve against the demo's `auth:` block. The controls must appear as a **separate
row**, never interleaved into the `auth_methods` badge markup (Decision 4).
