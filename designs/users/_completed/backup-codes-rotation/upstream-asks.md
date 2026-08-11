# 2FA Enrolment Modal — Upstream Asks

Platform-side changes the [2FA enrolment modal design](design.md) depends on. This design's own sequence starts at ask 1; it is not a continuation of the user-account module's ask numbering ([round 1](../user-account-better-auth/upstream-asks.md), [round 2](../user-account-better-auth/upstream-asks-2.md)), though it extends the same action catalog that round-1 ask 1 established.

Same shape as user-account's ask 6 (`PasskeySignIn`): the delivered catalog covered part of a feature area, and the missing action only became visible once a module tried to build the flow.

---

## 1. `TwoFactorGenerateBackupCodes` action

> **Status: delivered** in `@lowdefy/client` / `@lowdefy/actions-core` /
> `@lowdefy/engine` as of `experimental-20260805130407` (pinned here at
> `experimental-20260805140807`). `createAuthMethods` exposes
> `twoFactorGenerateBackupCodes` (`{ password }` → unwrapped `{ backupCodes }`),
> `getActionMethods` wires it, and `actions-core` registers the
> `TwoFactorGenerateBackupCodes` action — password-gated, returns `backupCodes`,
> secret untouched, exactly as asked. Consumed by
> [`design.md`](design.md)'s `codes_only` branch.

**Lands in**: [engine](../../../../lowdefy-design/designs/auth-upgrade/concepts/engine/design.md) (_The self-service action catalog_, `@lowdefy/actions-core`).

**Problem**: The catalog states that 2FA is **"TOTP + backup codes only at launch"** and ships `TwoFactorEnable` / `TwoFactorVerify` / `TwoFactorDisable` — but backup codes are only half-supported. `TwoFactorEnable` _issues_ them; nothing _rotates_ them. There is no action a user can call to get a fresh set.

That gap is not merely a missing convenience, because of what the only available substitute does. `POST /two-factor/enable` **deletes the caller's existing `twoFactor` row and creates a new one with a fresh secret** (better-auth 1.6.23, `dist/plugins/two-factor/index.mjs:108-127`). So a user who has burned through their codes, or never saved them, can only obtain new ones by re-running `TwoFactorEnable` — which invalidates their working authenticator app the instant it fires and forces them to re-scan a QR code. Abandon that flow midway and they hold no working second factor and no codes.

The result is that **the routine operation is only reachable through the destructive one**. Backup codes are consumed one per use with no remaining-count surface anywhere, so reaching zero is both silent and, today, only recoverable by rotating the TOTP secret.

BetterAuth already supports the non-destructive operation and Lowdefy simply does not expose it:

- **Server endpoint**: `POST /two-factor/generate-backup-codes` — session-gated, requires `user.twoFactorEnabled`, requires the account password (`shouldRequirePassword` → `checkPassword`), and updates **only** the `backupCodes` field on the existing `twoFactor` row. The secret, the `verified` flag and `user.twoFactorEnabled` are untouched. Returns the new codes in plaintext as `{ status, backupCodes }` (`dist/plugins/two-factor/backup-codes/index.mjs:212-265`).
- **Client method**: the two-factor client plugin registers `"/two-factor/generate-backup-codes": "POST"` in its `pathMethods` (`dist/plugins/two-factor/client.mjs`), so the inferred client method exists alongside the three Lowdefy already wraps.
- **Lowdefy gap**: `createAuthMethods` exposes `twoFactorEnable` / `twoFactorVerify` / `twoFactorDisable` and no fourth (`@lowdefy/client/dist/auth/createAuthMethods.js:516-538`); `getActionMethods` has no corresponding entry (`@lowdefy/engine/dist/actions/getActionMethods.js`).

**Ask** — one more curated action, matching the catalog's existing pattern exactly:

| Action                         | Wraps                           | Notes                                                                                     |
| ------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `TwoFactorGenerateBackupCodes` | `twoFactor.generateBackupCodes` | password-gated; **returns** `backupCodes`; requires 2FA already enabled; secret untouched |

It is the intersection of two actions the catalog already ships: password-gated with a single `password` param like `TwoFactorDisable`, and data-bearing like `TwoFactorEnable` (whose "returns the codes the page must render once, readable via `_actions`" pattern applies verbatim — no side-channel state). The `createAuthMethods` implementation is the `twoFactorDisable` body with a different client method, so this is a small addition rather than a new surface shape.

Two notes on the designed surface:

1. **It must not be folded into `TwoFactorEnable` by parameter.** The `Login`-style parameter dispatch is wrong here: the two operations differ in blast radius, not in input. One rotates a shared secret and invalidates a device; the other rotates recovery codes. Collapsing them behind a flag makes the destructive path one typo away — the opposite of the "designed surface per operation" principle the catalog states.
2. **The error case is worth naming**: called when the caller has no `twoFactor` row or `twoFactorEnabled` is false, BetterAuth throws `TWO_FACTOR_NOT_ENABLED`. Consumers gate the trigger on enrolment state, so this is a guard rather than a routine path, but the action should surface it as a normal thrown error like the rest of the catalog. The platform's two-factor-lifecycle design adds one precision (its Problem 1): the endpoint reads the session through `sessionMiddleware`, so with `session.cookieCache` enabled it can also throw `TWO_FACTOR_NOT_ENABLED` off a stale cookie in the window just after enrolment ([better-auth #9132](https://github.com/better-auth/better-auth/issues/9132)). Lowdefy defaults `cookieCache` to disabled, so a default deployment never meets it.

**Why it matters beyond convenience**: regenerating recovery codes independently of the second factor is the near-universal pattern among identity providers — GitHub, Google, and Microsoft all expose it as a distinct self-service operation, precisely because "my codes are gone" and "my authenticator is gone" are different incidents with different costs. A catalog that claims backup-codes support without it forces every consuming module to route the common case through the dangerous one.

**Fallback if declined**: the module keeps re-enrolment as the only path to fresh codes, warns before it ([D4](design.md) already specifies that warning), and drops its `intent: codes_only` branch. Workable, and what ships until this lands — but it leaves every app in the suite with a recovery-code rotation that costs the user their authenticator, and no way to close that gap in module config. The other route is a custom action in `plugins/modules-mongodb-plugins/` hand-rolling `fetch` against `/api/auth/two-factor/generate-backup-codes`, which duplicates `unwrap`, `basePath` resolution and error mapping outside the client that owns them — a second way to call auth, which is worse than waiting.
