# F50 — Session cookie is `HttpOnly` but not `Secure` (confirm production behaviour)

**Status:** `investigate` · **Area:** auth-engine / cookies (⚠️ security · **upstream / out of module scope**)

The BetterAuth session cookie is set **`HttpOnly`** (good — not JS-readable) but **without the
`Secure` attribute**, observed on the local rig. A cookie without `Secure` may be transmitted
over plaintext **HTTP**, exposing the session token (a replayable bearer credential) to network
interception / MITM. Logged for **upstream escalation** — this is the auth engine's cookie
policy, not something the `user-account` / `user-admin` modules configure.

## Important caveat — the local observation is not proof of a production bug

The rig runs on **`http://localhost:3000`**. A browser will **not** store a `Secure` cookie over
plain HTTP, and most auth frameworks (NextAuth / BetterAuth) **derive `Secure` from the request
protocol** or a `useSecureCookies`-style flag — so `Secure` being absent on an http origin is
often **expected**, not a misconfiguration. The finding is therefore about **confirming the
production path**, not asserting a live vulnerability from the localhost read alone.

## What to verify upstream

1. **Does the production (HTTPS) deployment set `Secure` on the session cookie?** Inspect the
   `Set-Cookie` on a real https origin (or staging). If yes, there is no bug — `Secure` is simply
   protocol-derived and off on localhost.
2. **Is `Secure` derived from protocol, or pinned by config?** Confirm the engine sets
   `useSecureCookies: true` (or equivalent) in production and isn't hardcoded off. If it's pinned
   off, that's the real issue.
3. **While there, confirm the related cookie hardening:** `SameSite` (should be at least `Lax`)
   and any cookie prefix. `HttpOnly` is already confirmed present.

## Why it's here despite being out of module scope

The campaign scope is the two auth modules, and cookie policy belongs to the engine — but the
observation surfaced during session-tile testing (alongside the `/api/auth/get-session` token
note on Phase 2 line 37), and the reporter is taking it upstream. Recorded so the escalation has
a written home; whoever owns the auth-engine / auth-hardening config is the owner, not this repo.
