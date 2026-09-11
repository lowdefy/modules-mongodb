# F56 — `POST /api/auth/two-factor/enable` is very slow

**Status:** `root-caused` (endpoint compute exonerated; residual latency is dev-server first-hit
compilation) · **Area:** user-account / 2FA enrolment (performance) — but the root cause is the
experimental **Vite/Hono dev server**, not 2FA

Enrolling TOTP felt sluggish: the request to `http://localhost:3003/api/auth/two-factor/enable`
(the BetterAuth `enable` endpoint behind the `TwoFactorEnable` action — Manage modal
`modal_enroltotp.yaml` and forced-enrol page `two-factor-enrol.yaml`) appeared to hang the enrol
dialog. Observed on the dev rig (localhost:3003), and "on other requests as well".

## Conclusion first

**The `enable` endpoint is not slow. Its whole server-side compute is ~45 ms.** All three candidate
causes originally filed (password/backup-code hashing as the culprit, an unindexed write, a
backup-code batch multiplying crypto) are ruled out by measurement. The perceived "hang" is
**dev-server-only first-hit module compilation** in the new experimental Vite + Hono dev server —
the F12-class overhead — which disappears on warm hits and does not exist under `lowdefy start`.

## What was measured

Isolated benchmark of the real BetterAuth engine (`better-auth@1.6.23`, same plugin set as the app:
`emailAndPassword` + `twoFactor({allowPasswordless:true})` + `organization` + `customSession`) against
the local rig Mongo (`mongodb://localhost:27017`), throwaway scratch DB, dropped after:

| operation                                                   | time         | what dominates             |
| ----------------------------------------------------------- | ------------ | -------------------------- |
| `enableTwoFactor` (server API, steady-state, 4 fresh users) | **43–49 ms** | one scrypt password verify |
| `getSession` (authenticated, warm, ×8)                      | **~1.5 ms**  | one indexed session read   |
| `signInEmail`                                               | ~45 ms       | one scrypt verify          |
| `signUpEmail`                                               | ~77 ms       | one scrypt hash            |

Component isolation:

- **scrypt** (BetterAuth default `N=16384, r=16, p=1`, `node:crypto` on the libuv pool): **~40 ms per
  call** on this machine (measured directly). `enable` does exactly one (the password check via
  `validatePassword`), so it accounts for essentially the entire 45 ms. This is BetterAuth's
  built-in cost, not a Lowdefy setting and not a module bug.
- **backup codes**: stored with `symmetricEncrypt` (AES) over a small JSON — **not** hashed with
  scrypt. Generating 10 is sub-millisecond. (Original hypothesis wrong.)
- **the Mongo writes** during enable (`findOne` + `deleteMany` + `create` on `user-two-factors`):
  sub-millisecond — the rig Mongo is **local** and the auth collections hold 1–4 documents each, so
  every read/write is effectively free. (No "slow unindexed write" here.)
- **`customSession`** (added in `fix(api): Strip session token from /get-session response`): runs a
  single `getSession` and a pure transform — no extra round trip.

Live dev server (`apps/demo`, port 3000, warm process):

- warm API routes (`/api/auth/get-session`, `/api/root`): **1–2 ms**.
- a JIT page's **first** hit (`/api/page/*`): **200–300 ms**, then **~6 ms** warm.

## Root cause

The experimental dev server is **Vite SSR + Hono** (`@hono/vite-dev-server`, `server.ssrLoadModule`
in `packages/servers/server-dev/vite.config.js`). Modules are transformed/loaded **on demand, once
per module graph**, so the first request that pulls a not-yet-loaded route or page pays a compile
cost the warm request never sees. The production server (`packages/servers/server`) serves a
pre-built bundle (`serveStatic` over `dist/client`) — no on-demand transform. This is exactly why the
problem shows up "only on the dev server" and "on other requests as well" (every route is slow on its
first hit), and why enrol is where it's most visible: the enrol flow cold-hits several things at once
(the enrol page + the `enable` endpoint + the `verify` endpoint) the first time it's exercised after
`lowdefy dev` starts.

So the latency is real but it is **dev tooling, not the auth path** — the same F12 mechanism, now
inherent to the Vite dev architecture rather than a one-off JIT hang.

## Not yet nailed down (needs the actual 3003 rig)

The largest single cold cost I could reproduce on a warm demo was ~300 ms (a JIT page). If the rig is
genuinely hanging for **seconds**, two candidates remain that need the live tenant rig plus the dev
server's own per-request timing logs (it logs every request via `logRequest`) to separate:

1. **Cold Vite SSR transform of the large `better-auth` module graph** on the very first `/api/auth`
   hit after `lowdefy dev` boots — plausibly >1 s once, then gone. Confirm by: restart dev,
   enrol once (cold), enrol again / hit another auth route (warm), compare the logged request times.
2. **Tenant preflight re-running every request** (tenant-only, so it can't show on the pinned demo).
   `resolveTenantPreflight` memoizes a _pass_ for the process, but a _connectivity-class_ probe
   failure is deliberately **not** memoized and re-runs `runPreflight` (disk `readConfigFile` +
   operator eval + a DB probe per walled connection) on **every** request. If a walled connection's
   probe is quietly failing on the rig, every request pays that repeatedly — which would match
   "all requests slow" under `policy: tenant`. Check the dev log for repeated
   `Tenant preflight …` lines; a healthy rig logs `Tenant preflight passed` exactly once.

## Secondary (production-scale, not the current-rig cause)

At the rig's data volume these are free, but both become a **collection scan on every request** at
production scale and are worth an index pass while auth is being hardened:

- `user-sessions` has only `{_id:1}` — no index on `token`, which BetterAuth's `getSession` filters
  on. Every authenticated request scans the session collection.
- `user-members` has `{organization_id:1, app_roles:1}`, but `resolveAuthentication` queries
  `{user_id, organization_id}`. The index covers `organization_id` but not the `user_id` equality, so
  it filters by org then scans members within it — hot on every authenticated request. A
  `{user_id:1, organization_id:1}` (or `{organization_id:1, user_id:1}`) index would cover it.

(The `ensure-indexes` script added in `chore(auth-testing): Add ensure-indexes …` is the natural home
for these — verify it declares a session-`token` index and a member `{user_id, organization_id}`
index.)
