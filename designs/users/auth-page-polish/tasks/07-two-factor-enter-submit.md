# Task 7: Enter-to-submit on the sign-in two-factor inputs

## Context

`modules/user-account/pages/two-factor.yaml` is the sign-in second-factor page. It renders in
two states via `tf_view` (`auth` | `backup`):

- `code` (TextInput, line ~50) — the TOTP code; its primary button is `tf_verify` (Button,
  line ~84), whose chain is `tf_verify_totp` (TwoFactorVerify) → `tf_totp_continue` /
  `tf_totp_no_cookie` / `tf_totp_error`.
- `backup_code` (TextInput, line ~195) — the backup code; its primary button is
  `tf_backup_verify` (Button, line ~214), whose chain is `tf_verify_backup` (TwoFactorVerify,
  `_state: backup_code`) → `tf_backup_continue` / `tf_backup_no_cookie` / `tf_backup_error`.

Both fields today submit only via their buttons. This task wires Enter-to-submit on each,
running that field's existing verify chain — no logic change.

## Interfaces

- Standalone — depends on no other task. (Task 8 later re-touches this file's heading, so it is
  ordered before Task 8.)

## Task

Edit `modules/user-account/pages/two-factor.yaml`:

1. Add `onPressEnter` to the `code` TextInput running the **same action chain** as `tf_verify`
   (the TOTP verify → continue/no-cookie/error sequence).

2. Add `onPressEnter` to the `backup_code` TextInput running the **same action chain** as
   `tf_backup_verify` (the backup verify → continue/no-cookie/error sequence).

Confirm `TextInput` exposes `onPressEnter` via `lowdefy_get_schema`. Each `onPressEnter` must be
identical to its button's chain — factor to a shared `_ref` actions file or keep the two call
sites verbatim-identical so they can't drift. Do not change the verify logic, the trust-device
toggle, or the auth↔backup UI switch.

## Acceptance Criteria

- Pressing Enter in the TOTP `code` field runs the identical chain as `tf_verify`.
- Pressing Enter in the `backup_code` field runs the identical chain as `tf_backup_verify`.
- `pnpm ldf:b` from `apps/demo` succeeds; `lowdefy_build_status` clean for `two-factor`.

## Files

- `modules/user-account/pages/two-factor.yaml` — modify — `onPressEnter` on `code` and
  `backup_code`.

## Notes

- Leave `tf_title` / `tf_backup_title` styling to the heading pass (Task 8).
