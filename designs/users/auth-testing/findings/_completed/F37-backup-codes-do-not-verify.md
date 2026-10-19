# F37 — Backup codes shown by the Manage modal do not verify at the 2FA challenge

**Status:** `fix-applied` (pending live e2e verify) · **Area:** user-account / 2FA (⚠️
recovery-path broken — backup-code verify throws client-side before it ever calls the server)

**Fix applied 2026-08-13:** `trustDevice` coerced to boolean via `_if_none` in
`actions/verify_backup.yaml` + `actions/verify_totp.yaml`; `pnpm ldf:b` clean and the built
config carries the coercion at all four dispatch points. Outstanding: live 2FA challenge to
confirm a backup code now verifies (needs session + cookie).

A user regenerated backup codes via the Security-tile **Manage modal** ("Get new backup
codes"), which displayed a fresh codes grid. At the next 2FA sign-in challenge, entering one of
those displayed codes on the **backup-code** step was **rejected as invalid** — tried twice,
both failed. TOTP on the same account works, and a deliberately-invalid TOTP errors as
expected, so the challenge plumbing is sound.

## Initial triage (superseded by Root cause below)

- **Challenge wiring** — `two-factor.yaml` backup-code step calls `TwoFactorVerify` with the
  `backupCode` param, same action/cookie path as TOTP. _(Correction: the wiring is **not** fully
  correct — it also passes `trustDevice`, which is the actual defect; see Root cause.)_
- **Codes exist server-side.** `user-two-factors.backup_codes` is populated (encrypted string).
- **Regenerate wiring looks correct.** The Manage modal `codes_only` path calls
  `TwoFactorGenerateBackupCodes` and displays `enroltotp_generate_codes.response.backupCodes`
  (modal_enroltotp.yaml:373-385).

## Root cause — `trustDevice` param is `undefined` on the backup view (client-side `ConfigError`)

The backup-code verify **never reaches the server**. The challenge page seeds
`trust_device: true` in `onInit` (`two-factor.yaml:24`), but the `trust_device` `CheckboxSwitch`
is only `visible` on the authenticator view (`tf_view == auth`). Toggling to the backup view
unmounts the switch, so Lowdefy drops its state key and `_state: trust_device` becomes
`undefined`. The backup chain (`actions/verify_backup.yaml:6`) passes
`trustDevice: { _state: trust_device }` to `TwoFactorVerify`, whose param schema requires a
boolean — so the action throws **client-side, before any request**:

```
[ConfigError] Action "TwoFactorVerify" param "trustDevice" must be type "boolean".
  Source: modules/user-account/actions/verify_backup.yaml:6
```

The `try/catch` swallows it into the generic toast ("That backup code is invalid or has already
been used"), which is why it read as a bad code. **Any** backup code fails identically,
regardless of value — matching the report (correct, copy-pasted codes rejected every time). TOTP
is unaffected because its switch is visible on the auth view, so `trust_device` is a boolean
there.

**The server side is not broken — proven against live data** (below). Once the request actually
fires, the stored codes verify. So this is purely the client-side param-type throw; the
storage/crypto analysis only serves to rule out a server cause.

### Verified against live data (`demo-auth-test`, 2026-08-13)

A controlled reproduction settled it. The tester regenerated codes for `a2@demo.test` and
recorded the displayed grid; reading and decrypting `user-two-factors.backup_codes` with
`AUTH_SECRET` (BetterAuth's own `symmetricDecrypt`) returned the **same 10 codes, byte-for-byte,
in the same order**. Also confirmed on the same read:

- **Encryption is sound** — the same key decrypts the TOTP `secret` (which verifies), and
  `backup_codes` decrypts to a clean JSON array of `xxxxx-xxxxx` codes.
- **No duplicate rows** — exactly one `user-two-factors` row per user, so verify never reads a
  "wrong" row.
- **The regenerate write lands on the right row** — ids are UUID **strings**; with the app's
  function `generateId`, the adapter's `serializeId` is a no-op and the `_id` string matches
  directly, so the id-targeted `adapter.update` is not a silent no-op (`createCustomAdapter.js`
  - `createSerializeId.js`). Field mapping is symmetric (`backupCodes` ↔ `backup_codes` via
    `snakeCase`).

So generate persists exactly what it displays, and verify accepts exactly what is stored. Any
displayed code verifies **iff the exact string reaches the endpoint**.

### Server-side soundness (rules out a storage/crypto cause)

Confirmed by source + live decrypt, so the fix stays on the client:

- **Displayed = stored.** `generate-backup-codes` returns the same array it persists; a controlled
  live reproduction decrypted `user-two-factors.backup_codes` and got the displayed codes
  byte-for-byte.
- **Encryption sound.** Codes and the TOTP secret share `ctx.context.secretConfig`
  (`totp/index.mjs:141-143`); TOTP verifies, so the key decrypts the row.
- **One row per user, write lands correctly.** UUID-string ids + the app's function `generateId`
  make the adapter's `serializeId` a no-op, so the id-targeted `adapter.update` matches; field
  mapping is symmetric (`backupCodes` ↔ `backup_codes`).
- **Verify is exact.** `codes.includes(data.code)` — so a code verifies iff the exact string
  reaches the endpoint. The bug is that the request never fires.

## Fix

Coerce `trustDevice` to a boolean so a hidden switch (`undefined`) resolves to `false`, in both
verify chains (`actions/verify_backup.yaml`, and `actions/verify_totp.yaml` for consistency):

```yaml
trustDevice:
  _if_none:
    - _state: trust_device
    - false
```

Effect: backup-code verify fires with `trustDevice: false` (a recovery-code login not trusting
the device is a safe, arguably preferable, default). Minimal and self-contained.

**Forward-compatible with [F38](F38-trust-device-configurable.md).** F38 gates the switch on
`_build.authConfig: twoFactor.trustDevice` AND `tf_view == auth` and seeds the init value from
config — but the switch is still hidden on the backup view, so `trust_device` is still
`undefined` there. F38's plan §2 claim that the verify actions "need no change" is therefore
**wrong** and would ship with this bug intact; the coercion above is required and should be kept.
Do **not** wait for F38 (it is upstream-blocked); this fix is independent and unblocks
recovery now.

### Secondary (not the blocker): codes are copy/paste-hostile

Separate, lower-priority UX issue surfaced during investigation, worth a follow-up but **not**
the cause here. BetterAuth codes are mixed-case with ambiguous glyphs (`I`/`l`/`1`, `O`/`0`) and a
hyphen; verify does zero normalization (`codes.includes`, no trim/case-fold). Once the
`trustDevice` fix lands, remaining failure modes are transcription/selection (e.g. double-click
selecting only one side of the hyphen). (The cosmetic `backup_code` placeholder mismatch —
`xxxx-xxxx` vs the real `xxxxx-xxxxx` — was fixed alongside the `trustDevice` coercion.) A real
remedy (transcription-safe alphabet + input normalization) needs `@lowdefy/api` to expose
`backupCodeOptions` — an upstream ask, separate from this finding.

## Reproduction

- **Live decrypt (2026-08-13):** tester regenerated codes for `a2@demo.test`; the displayed grid
  matched the decrypted stored `backup_codes` byte-for-byte → server side confirmed correct.
- **Dev-server console:** the backup verify surfaced the `ConfigError` above
  (`verify_backup.yaml:6`, `trustDevice must be type "boolean"`) — the throw that the generic
  toast was hiding. This is the actual defect.

## Follow-up to check separately

While reproducing, the `a2@demo.test` `user-two-factors` row's `_id` **and** TOTP `secret` both
changed — i.e. that regenerate re-created the 2FA row rather than only rotating codes. If it was
triggered from **"Get new backup codes"** (the `codes_only` path), that path is wrongly rotating
the authenticator secret too (which would silently break the user's existing authenticator) and
warrants its own finding. If it was **"Replace authenticator"**, this is expected. Confirm which
button was used before filing.

**Combined with [F44](_completed/F44-modal-totp-enrol-redirects-home-codes-lost.md), the entire
backup-code recovery mechanism is unreliable** — enrolment codes are lost to a home redirect on
both the modal and the forced-enrol page (F44), and regenerated codes that _are_ shown don't
work (this). A user who loses their authenticator has no working self-service recovery. High
priority to root-cause both together.
