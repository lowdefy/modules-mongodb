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

## The open decision

1. Is the TOTP secret length configurable on the BetterAuth twoFactor plugin (or is 256-bit a
   fixed default)? If configurable, drop to the standard **160-bit / ~32 chars**.
2. Regardless of length, **group the key in 4-char blocks** (with F32's wrap fix) so the
   fallback is typeable.
3. Consider **de-emphasising manual entry** in the UI (QR primary, "enter a key instead" behind
   a disclosure) so the long string isn't the first thing a user reaches for.
