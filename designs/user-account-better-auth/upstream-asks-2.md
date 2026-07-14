# User Account — Upstream Asks (Round 2, outstanding)

Platform-side changes the [user-account design](design.md) depends on that surfaced **after** the first round ([upstream-asks.md](upstream-asks.md)) was delivered. The five round-1 asks are all delivered upstream; the asks here are **not yet delivered** — this file tracks them separately so the delivered set stays clean. Numbering continues the round-1 sequence (round 1 was asks 1–5), so ask ids stay globally unique.

---

## 6. Passkey sign-in action

> **Status: not delivered** — surfaced by review-2 #2. The round-1 catalog (ask 1) shipped `PasskeyRegister` / `PasskeyDelete` only; passkey _authentication_ has no wrapping action, and `Login`'s dispatch-by-parameter does not cover it.

**Lands in**: [engine](../../../lowdefy-design/designs/auth-upgrade/engine/design.md) (client section, `@lowdefy/actions-core`, the self-service action catalog).

**Problem**: Decision 2 renders a passkey button on the login page whenever `_build.authConfig.passkey.enabled`, but there is no sanctioned action for it to call. Upstream establishes only:

- `Login` **dispatches by parameter** to `signIn.social` / `signIn.magicLink` / `signIn.email` (engine design line 134) — passkey is not in that dispatch.
- The self-service catalog ships `PasskeyRegister` / `PasskeyDelete` (engine lines 149–150; round-1 ask 1) — no passkey authentication action.
- The capabilities table (engine line 190) lists the passkey plugin's UI as a **registration page** only.

Passkey sign-in is not a parameter dispatch and cannot fold into `Login`: it is a WebAuthn **assertion** ceremony. Verified against the pinned version (`@better-auth/passkey@1.6.23`, `dist/client.mjs`): the client exposes `signIn.passkey` (`signInPasskey`), which calls `/passkey/generate-authenticate-options`, then runs `startAuthentication` (`navigator.credentials.get`) in the browser — the same kind of browser ceremony as registration's `addPasskey`, which round-1 ask 1 already wraps by noting "the WebAuthn ceremony runs inside the action." It also supports `useBrowserAutofill` for conditional-UI / autofill sign-in.

**Ask** — a curated `PasskeySignIn` action wrapping `signIn.passkey`, matching the `PasskeyRegister` precedent (the WebAuthn assertion ceremony runs inside the action). It is **public** (no caller session — it _is_ the sign-in), and on success carries a session like `Login`'s email path so the page navigates to `callbackUrl`. An `autoFill` option (mapping to `useBrowserAutofill`) is optional and can be deferred — the button-triggered ceremony is the floor.

| Action          | Wraps            | Notes                                                                          |
| --------------- | ---------------- | ------------------------------------------------------------------------------ |
| `PasskeySignIn` | `signIn.passkey` | public; WebAuthn **assertion** ceremony inside the action; `autoFill` optional |

**Fallback if declined**: drop the passkey button from Decision 2's login page — passkeys stay registration-only (enrol/delete in the security tile via `PasskeyRegister` / `PasskeyDelete`), and passkey sign-in moves to Non-goals until a concrete need. This is the review-2 #2 "scope out of v1" alternative; it leaves users able to enrol a passkey they cannot sign in with, so it is the weaker outcome.
