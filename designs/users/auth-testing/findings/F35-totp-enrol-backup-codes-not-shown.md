# F35 — TOTP enrolment completes without ever showing backup codes

**Status:** `investigate` · **Area:** user-account / 2FA enrolment

Enrolling TOTP via the **forced enrolment page** (`two-factor-enrol.yaml`, reached after
removing the last passkey) completed **without the backup-codes step ever appearing** — no
codes grid, no "I've saved my backup codes" gate — and the user landed in the app.

## Evidence (rig DB)

- `user-two-factors` row exists with `secret` **and** `backupCodes` present — `backupCodes` is
  an **encrypted string** (362 chars), i.e. codes **were generated** server-side.
- `users.twoFactorEnabled: true`.

So enrolment succeeded and codes exist, but the user was **never shown the plaintext codes**.
BetterAuth returns the plaintext backup codes **once**, in the enable response, and stores
them encrypted thereafter — so those codes are now **unrecoverable**. The user has a TOTP
factor with no usable self-service recovery path.

> **Evidence caveat:** the developer ran a **regenerate backup codes** action around the same
> time as this DB read, so the `backupCodes` blob observed above **may be from the regenerate,
> not the original enrolment**. Do not treat the DB read as proof that codes were issued _at
> enrol time_ — it is at best proof codes exist _now_. The primary evidence for this finding
> is the user-observed symptom (no codes step during TOTP setup, yet able to Continue), which
> the Continue-gating logic below explains independently of the DB state. A clean repro
> (fresh enrol, no regenerate) is needed to confirm whether enrol issues codes at all.

## Mechanism (leading hypothesis)

The done state renders the codes grid (`enrol_codes_grid`) and locks Continue behind the
"I've saved my backup codes" switch — **both gated on `_boolean(_state: enrol.backup_codes)`**
(two-factor-enrol.yaml). `enrol.backup_codes` is stashed from
`_actions: enrol_enable.response.backupCodes` when `TwoFactorEnable` runs. If that value is
empty/undefined (wrong response path, or the codes not present on the response object), the
grid is hidden **and** Continue is ungated — so the user completes enrolment without seeing
codes. The DB evidence (codes present but unseen) fits this.

**Scope narrowed:** the self-service **Manage modal** (`modal_enroltotp.yaml`) renders backup
codes correctly (grid + "I've saved" checkbox + Done disabled until checked — confirmed live
this run). So the defect is **specific to the forced-enrol page** (`two-factor-enrol.yaml`),
**not** a shared codes-display bug. F21's modal concern reads as satisfied.

## The open question

The two surfaces use the same `TwoFactorEnable` action but behave differently — the modal
shows codes, the forced-enrol page didn't. So the question is **why the forced-enrol page
specifically failed**:

- Does `two-factor-enrol.yaml` map/stash `enrol_enable.response.backupCodes` **differently**
  from the working modal (a path/stash difference between the two files)?
- Or did the `TwoFactorEnable` on the forced-enrol page return **no codes at that moment**
  because of the account's prior 2FA state (passkey enrolled then removed just before) — i.e.
  BetterAuth didn't re-issue codes for an account it considered already part-enrolled?

Compare the two files' response handling, and repro a clean forced-enrol (fresh account, no
prior passkey) to isolate which. High impact — a TOTP user must be shown their backup codes
**exactly once**, and the forced-enrol flow must not let them continue past an empty codes set
as if it succeeded.
