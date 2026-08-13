# F37 — Backup codes shown by the Manage modal do not verify at the 2FA challenge

**Status:** `root-caused` · **Area:** user-account / 2FA (⚠️ recovery-path broken)

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

## Root cause

The generate → store → verify chain is **byte-exact and verbatim end-to-end**, and there is
**no storage/crypto/wiring divergence**. What breaks the recovery path is that BetterAuth's
backup codes are **mixed-case** and its verify is an **exact, case-sensitive `Array.includes`
with zero input normalization** — so any hand-transcription or case slip is silently rejected,
and nothing in the path tolerates it.

Traced (all at the pinned `@lowdefy/*` `…20260807075508` + `better-auth@1.6.23`):

1. **Codes are mixed-case, exact-match verified.** `generateBackupCodesFn`
   (`better-auth/dist/plugins/two-factor/backup-codes/index.mjs`) builds each code with
   `generateRandomString(10, "a-z", "0-9", "A-Z")` — a 62-char lowercase+digit+**uppercase**
   alphabet — formatted `xxxxx-xxxxx` (5+5, one hyphen). `verifyBackupCode` decides validity
   with `codes.includes(data.code)`: **no trim, no case-fold, no dash/whitespace normalization**.
   `l/I/1`, `O/0`, and letter case must all be transcribed perfectly or verify returns
   `INVALID_BACKUP_CODE`.
2. **The Lowdefy path passes the code verbatim.** Challenge `backup_code` TextInput →
   `TwoFactorVerify({backupCode: _state})` (`two-factor.yaml:229-235`) →
   `createAuthMethods.twoFactorVerify` dispatches `backupCode` straight to
   `twoFactorVerifyBackupCode({code: backupCode})` with no transform
   (`@lowdefy/client/dist/auth/createAuthMethods.js:704-720`). The input has no
   `autoCapitalize`/`autoCorrect` suppression either.
3. **Displayed = stored, provably.** `generate-backup-codes` generates one array, persists its
   encrypted form, and returns that same array as plaintext — display and storage cannot differ.
   The regenerate write is an id-targeted `adapter.update`, and the id round-trips correctly
   (`createSerializeId.js` coerces / passes through consistently on both `findOne` and `update`),
   so it is not a silent no-op — if it were, every id-targeted auth update would fail, not just
   this one.
4. **Encryption is not the cause.** Backup codes and the TOTP secret are both symmetric-encrypted
   under the _same_ `ctx.context.secretConfig` (`totp/index.mjs:141-143`). **TOTP verifies on this
   account**, which proves the secret decrypts this row — so the stored codes decrypt to exactly
   the displayed plaintext.

Contributing UX defect: the challenge input's placeholder is `xxxx-xxxx` (4+4)
(`two-factor.yaml:204`) while real codes are `xxxxx-xxxxx` (5+5) — it misrepresents the format
the user is transcribing.

### Ruled out

- ~~Displayed ≠ stored~~ — generate returns exactly what it persists (§3).
- ~~Wrong/stale set or duplicate row consulted~~ — `enable` does delete-then-create and
  `generate` updates the single row by id; verify `findOne({userId})` reads that same row.
- ~~Encryption/secret mismatch~~ — ruled out by TOTP working (§4).
- ~~Custom/asymmetric encoding~~ — `@lowdefy/api` registers `twoFactor({issuer, schema})` with
  **no** `backupCodeOptions`, so generate and verify share the default `storeBackupCodes:
"encrypted"` symmetrically (`getBetterAuthConfig.js:384-393`).

## Fix

The codes match; the path just can't tolerate imperfect transcription. Options, best first:

- **Upstream (real fix):** have `@lowdefy/api` expose `backupCodeOptions` so the app can pass a
  `customBackupCodesGenerate` producing a transcription-safe, single-case, ambiguity-free
  alphabet (e.g. Crockford base32, no `l/I/1/O/0`), **and** normalize the entered code to the same
  canonical form before verify. Because verify is exact `includes`, generation and input must be
  canonicalised identically — normalising only one side does nothing. Track as an upstream ask.
- **App-side interim (partial):** on the challenge page, trim whitespace from `backup_code` and
  fix the placeholder to `xxxxx-xxxxx`. Case **cannot** be safely normalised app-side while
  generation stays mixed-case (lower-casing a code that legitimately contains uppercase breaks
  it), so this only removes the whitespace/format-hint failure modes, not the case one.
- Steer users to the **Copy codes** button at enrol/regenerate (byte-exact) — but this does not
  help at the challenge, which is typically on a different device where the code is transcribed.

## To fully close (one reproduction)

Not runnable from here — it needs a live session/cookie and writes+consumes a code (a data
mutation), so it wasn't executed. Regenerate codes via the modal, then at the challenge **paste**
(don't type) one code exactly as shown:

- **Pasted code verifies** → confirms the root cause above (transcription/normalisation); ship
  the fix.
- **Pasted code still fails** → escalate to a live-data check for duplicate `user-two-factors`
  rows for the account (`db['user-two-factors'].find({userId})`), the only remaining way stored
  could differ from displayed.

**Combined with [F44](_completed/F44-modal-totp-enrol-redirects-home-codes-lost.md), the entire
backup-code recovery mechanism is unreliable** — enrolment codes are lost to a home redirect on
both the modal and the forced-enrol page (F44), and regenerated codes that _are_ shown don't
work (this). A user who loses their authenticator has no working self-service recovery. High
priority to root-cause both together.
