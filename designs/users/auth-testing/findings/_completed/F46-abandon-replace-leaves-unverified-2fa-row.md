# F46 — Abandoning a 2FA replacement leaves an unverified `user-two-factors` row

**Status:** `won't-fix` · **Area:** user-account / 2FA replace

**Resolution (2026-08-13):** benign, standard Better Auth behaviour, no action. Verified against
the Better Auth source (`better-auth@1.6.23`), not just a runtime probe: the leftover
`verified: false` row is invisible to login, capped at one row per user, and wiped + replaced with
a fresh secret on the next enrolment. Adding a delete-on-abandon would cut against Better Auth's
own design (it never cleans up an abandoned `enable`, only lazily on the next `enable`), guards
nothing functional, and adds a client action that would have to fire on every modal-close / mask
path to matter — surface for no benefit ("don't over-restrict / build for concrete needs").

## Repro (2026-08-11)

Security tile → 2FA on → Replace → Generate a new secret → close/abandon the modal before
confirming. A `user-two-factors` row is left in Mongo with **`verified: false`** (the disable-first
chain has already removed the old factor, so the abandoned new secret persists un-verified).

## Why the row is `verified: false` here

Better Auth's `POST /two-factor/enable` writes the `twoFactor` row **up front, before any
verification**, with `verified: existingTwoFactor != null && existingTwoFactor.verified !== false`
(plus `skipVerificationOnEnable`). The app's **disable-first chain**
(`modal_enroltotp.yaml:282-300`: `TwoFactorDisable` → `TwoFactorEnable`) deletes the old row first,
so `enable` finds no prior row and creates the new one with `verified: false`. That is deliberate:
the raw Better Auth replace would inherit `verified: true` and enforce a second factor against a
never-scanned secret — the original lockout the chain exists to prevent
(`modal_enroltotp.yaml:21-29`).

## Why it's benign (both read sites verified in source)

`verified` is read in exactly two places, both safe:

1. **Login challenge.** The gate that actually runs at sign-in is the app's own after-hook
   `@lowdefy/api/.../auth/requestHooks/createTwoFactorChallengeHook.js`, which gates purely on
   `if (!newSession.user?.twoFactorEnabled) return undefined;` and **never reads the row's
   `verified` flag at all**. Disable-first set `two_factor_enabled` false, so no challenge fires →
   sign-in is **password-only, no second factor**. (Better Auth's own built-in hook,
   `two-factor/index.mjs`, is the upstream reference and belt-and-braces here too: same
   `twoFactorEnabled` gate, and even past it `if (userTotpSecret && userTotpSecret.verified !==
false) twoFactorMethods.push("totp")` never offers a `verified: false` row, and `verify-totp`
   rejects an unverified secret during sign-in.)
2. **Next Set up / Replace** — `enable` generates a brand-new secret unconditionally and runs
   `deleteMany` on the user's rows **before** creating the new one, so the abandoned row is deleted,
   never resurrected or reused.

Also: it **cannot accumulate** — every `enable` does `deleteMany` and every `disable` does
`delete`, so a user holds **at most one** `twoFactor` row at any time, and it self-heals on the
next enrolment.
