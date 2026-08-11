# F46 — Abandoning a 2FA replacement leaves an unverified `user-two-factors` row

**Status:** `enhancement` · **Area:** user-account / 2FA replace

**Confirmed benign (2026-08-11):** after abandon, sign-in is **password-only with no
second-factor challenge** and the Security tile shows **no configured 2FA** — login ignores the
`verified: false` row. So this is orphaned DB clutter, **not** a lockout. Remaining question is
hygiene only: should abandon delete the row?

**Repro (2026-08-11):** Security tile → 2FA on → Replace → Generate a new secret → close/abandon
the modal before confirming. A `user-two-factors` row is left in Mongo with **`verified: false`**
(the disable-first chain has already removed the old factor, so the abandoned new secret
persists un-verified).

## Why it may matter

The disable-first chain exists precisely to avoid the old lockout (2FA left enforced against a
secret never scanned). Leaving 2FA **off** on abandon is the safe half. The open concern is the
**orphaned row itself**: whether login/challenge treats a `verified: false` row as inactive (so
it is harmless clutter) or can pick it up, and whether the next enrol/replace collides with or
silently reuses it rather than issuing a clean new secret.

## The open question

Is the leftover `verified: false` row benign (ignored everywhere, cosmetic only) or does it need
to be cleaned up on abandon? Confirm: (a) sign-out/in after abandon asks **password only, no
second factor** (the design's stated assertion for this transition — not yet verified this run);
(b) a fresh Set up / Replace afterwards issues a **new** secret and does not resurrect the
abandoned row. Decide whether abandon should delete the unverified row or whether login's
`verified` filter makes it a non-issue.
