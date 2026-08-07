# F37 — Backup codes shown by the Manage modal do not verify at the 2FA challenge

**Status:** `investigate` · **Area:** user-account / 2FA (⚠️ recovery-path broken)

A user regenerated backup codes via the Security-tile **Manage modal** ("Get new backup
codes"), which displayed a fresh codes grid. At the next 2FA sign-in challenge, entering one of
those displayed codes on the **backup-code** step was **rejected as invalid** — tried twice,
both failed. TOTP on the same account works, and a deliberately-invalid TOTP errors as
expected, so the challenge plumbing is sound.

## What's confirmed working (rules these out)

- **Challenge wiring is correct.** `two-factor.yaml` backup-code step calls `TwoFactorVerify`
  with the `backupCode` param (lines 229-235), same action/cookie path as TOTP (which works).
- **Codes exist server-side.** `user-two-factors.backupCodes` is populated (encrypted string).
- **Regenerate wiring looks correct.** The Manage modal `codes_only` path calls
  `TwoFactorGenerateBackupCodes` and displays `enroltotp_generate_codes.response.backupCodes`
  (modal_enroltotp.yaml:373-385).

So the defect is specifically: **the plaintext codes displayed to the user do not match the
codes the server will accept.** The recovery path is effectively non-functional.

## Leading hypotheses (not yet root-caused)

- **Displayed ≠ stored** — `TwoFactorGenerateBackupCodes` returns a plaintext set for display
  but the persisted (hashed/encrypted) set is different, stale, or not updated — same class as
  [F35](./F35-totp-enrol-backup-codes-not-shown.md) (backup-codes display/storage divergence).
- **Normalization mismatch** — the challenge input (`backup_code`, placeholder `xxxx-xxxx`)
  passes the code verbatim; if BetterAuth stores/expects a different format (dashes, case,
  whitespace) than what was displayed, verify fails.
- **Wrong set consulted** — verify checks a different codes set than the one regenerate wrote.

## The open question

Root-cause the display-vs-accepted divergence:

- Capture the actual `TwoFactorGenerateBackupCodes` response and compare (format + values) with
  what `TwoFactorVerify({backupCode})` will accept for this account.
- Check whether BetterAuth normalizes the entered backup code (dashes/case/space) and whether
  the displayed format matches the stored/expected format.
- Confirm regenerate actually **persists** the displayed set (not a stale or separate set).

**Combined with F35, the entire backup-code recovery mechanism is unreliable** — codes aren't
shown on the forced-enrol page (F35), and codes that _are_ shown (Manage modal) don't work
(this). A user who loses their authenticator has no working self-service recovery. High
priority to root-cause both together.
