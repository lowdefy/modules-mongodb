# F49 — TOTP manual-entry key is impractically long (256-bit / 52 chars)

**Status:** `enhancement` · **Area:** user-account / 2FA enrolment

The manual-entry key offered as the "can't scan the QR" fallback is a **52-character base32
string** (e.g. `LBCTQS27K5KGOT3CIEWVEZRSOFWXKSCYMNSTI2DKNJDWKUZQIZFA`), i.e. a **256-bit secret**.
The common standard (RFC 6238; Google and most services) is a **160-bit secret → ~32 chars**,
usually rendered **grouped in 4-char blocks** for legibility. Ours is both longer than typical
and (per F32) unformatted, so hand-entering it across devices is very error-prone. The value is
otherwise correct — valid base32, a bare secret, not an `otpauth://` URI.

## Why it matters (and the limits of the concern)

- The **QR is the primary path** — a phone authenticator scans it, nothing is typed. So this
  only bites the **manual-entry fallback**: same-device password-manager TOTP (where a paste
  makes length moot) or a device that can't scan (where the length is punishing).
- So this is a real-but-bounded UX rough edge, not a correctness bug. Filed as an enhancement.

## Relationship

- **F32** owns the _display_ half — the manual-key Paragraph **wraps badly** (formatting/layout).
  Confirmed on the account-page Manage modal this run, in addition to the forced-enrol page.
- This finding is the _length_ half — shortening the secret helps even after wrapping is fixed.

## Length is not configurable — 256-bit is a hardcoded BetterAuth default

Confirmed against the installed source (`better-auth@1.6.23`). The secret is minted in the
`enableTwoFactor` endpoint and is **not** parameterised:

```js
// better-auth/dist/plugins/two-factor/index.mjs:89
const secret = generateRandomString(32); // 32 ASCII chars, alphabet [a-z0-9A-Z-_]
```

That 32-char string is base32-encoded as raw bytes for the URI / manual key
(`base32.encode(secret, { padding: false })` in `@better-auth/utils/dist/otp.mjs`, via
`TextEncoder` — one byte per ASCII char). The pipeline is therefore:

**32 ASCII chars → 32 bytes → 256-bit secret → `ceil(256/5) = 52` unpadded base32 chars**,

which reproduces the observed 52-char key exactly. The `twoFactor` plugin's `totpOptions` only
exposes `issuer`, `digits` (`6|8`), `period`, `backupCodes`, and `allowPasswordless` — **there is
no secret-length option**. Shortening would require patching/forking better-auth or
reimplementing the enrolment endpoint.

**Industry practice:** RFC 4226 §4 (inherited by TOTP/RFC 6238) requires ≥128-bit, recommends
**160-bit**; 160-bit / 20 bytes is the de-facto standard and encodes to exactly **32 base32
chars, no padding**. BetterAuth's 256-bit is _above_ spec — more secure, not less; the only cost
is a longer manual-entry string.

## Decision

Keep the 256-bit secret. It's not configurable, and its length is a security positive — the pain
is entirely in the manual-entry fallback, so fix the display, not the crypto:

1. **Group the key in 4-char blocks** (with F32's wrap fix) so the fallback is typeable.
2. **De-emphasise manual entry** in the UI (QR primary, "enter a key instead" behind a
   disclosure) so the long string isn't the first thing a user reaches for.
