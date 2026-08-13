# F12 — Dev-server "Building page…" hang is the awaited secondary fetches, not the build

**Status:** `root-caused` · **Area:** dev-server / tooling · **upstream**

Cold navigation to a page can stick on the "Building page…" JIT screen for ~10–30s before it
resolves. **Opening the same URL in a new tab clears it every time.** Re-confirmed on the
`user-account` auth pages; whether other cold pages hang the same way is a scope question, not a
mechanism question (see below).

## Root cause — first paint is gated on two optional fetches that stall to a 10s abort

The "Building page…" screen is the `<Suspense fallback>` in `.lowdefy/dev/client/Routing.jsx:86`,
shown while `usePageConfig`'s SWR fetch is pending. That fetch does **not** resolve when the page
config is ready — after the config 200, `fetchPageConfig` **awaits**
`/api/js/client` and `/api/icons/dynamic` in a `Promise.all` and only then returns
(`.lowdefy/dev/lib/client/utils/usePageConfig.js:101-107`):

```js
const [jsEntries, dynamicIcons] = await Promise.all([
  fetchJsEntries(basePath), // GET /api/js/client   — 10s AbortSignal.timeout
  fetchDynamicIcons(basePath), // GET /api/icons/dynamic — 10s AbortSignal.timeout
]);
data._jsEntries = jsEntries;
data._dynamicIcons = dynamicIcons;
```

Both are **optional enrichment** (JIT-discovered `_js` operator entries and dynamic icons) and
both **degrade silently to `{}` on failure** (`usePageConfig.js:30-52`). So when they stall, the
page still renders once they abort — just 10s later than it needed to. Awaiting them before first
paint is strictly a regression: on the happy path it adds their latency to every navigation, and
on a stall it holds the whole screen for the full 10s abort window for data that ends up empty
anyway.

### The build is NOT the cost — measured

The earlier hypothesis (cold `buildPageJit` starving the single-threaded event loop) is
**falsified** by the dev server's own `jit-build` timings (2026-08-12 rig):

| Page                                       | Built in      |
| ------------------------------------------ | ------------- |
| `user-account/signup`                      | 348ms / 350ms |
| `user-account/login`                       | 132ms / 208ms |
| `user-account/verify-email`                | 152ms         |
| `user-admin/view` (heaviest config, ~73KB) | 372ms         |

Every build is sub-400ms, including the heaviest page in the app. The build is not what holds
the screen; the ~10–30s is downstream of an already-finished build. (The server build lock is
still sound — single-flight per page, released in a `finally` at `jitPageBuilder.js:224-225` —
which is why a **new tab clears it every time**: warm `pageCache`, and by then whatever stalled
the two fetches has passed.)

### Live evidence (2026-08-12 dev-rig run)

- On the `/user-account/signup` navigation, **`/api/js/client` and `/api/icons/dynamic` both
  timed out after 10s** (referer `http://localhost:3000/user-account/signup`).
- `Built page …` logs show 132–372ms builds for the same pages — confirming the stall is in the
  two secondary fetches, not the build.

## Why those two fetches stall — the remaining open question

The build is fast and, once done, releases the event loop, so event-loop starvation _by the
build_ is ruled out. What's left to explain is why two trivial Hono routes — both plain
synchronous disk reads (`src/routes/jsEnv.js`, `src/routes/iconsDynamic.js` → `serveBuildJs`),
registered before any `apiContext` middleware (`src/app.js:86-87`) — take ~10s while the server
is otherwise idle.

Leading candidate: the dev Hono app is **mounted inside the Vite-owned HTTP server**
(`src/app.js:75-78`). A cold full load pulls the client entry graph through Vite's dev transform
(and each successful build touches `tailwind-candidates.css`, `jitPageBuilder.js:213-217`, kicking
a Vite CSS pass). While Vite is transforming, the API routes mounted in its middleware chain can
starve — and a warm second load (new tab) skips the cold transform, which matches "new tab clears
it." **Not yet confirmed.** A browser network waterfall settles it: are `/api/js/client` /
`/api/icons/dynamic` marked _stalled/queued_ (connection-pool or Vite-middleware contention) vs
_waiting (TTFB)_ (server received but slow to answer), and what else is in-flight at that moment?

## Scope — auth-only vs all-cold, still open

Whether this is auth-specific or hits every cold navigation is **not settled** — manual by-eye
testing has been inconsistent. But it is now a lower-stakes question: the build-weight, auth-gate,
and `dynamic`-flag differentiators are all ruled out (see build table + `pageRegistry.json`), and
the fix below removes the user-visible hang regardless of which pages trigger the stall.

## Not the same finding as F31

F12 is `BuildingPage` (this fetch-gating stall). [F31](../_upstream/F31-redirecting-to-signin-interstitial.md)
is `RedirectingPage` (the wrong-copy 403 enrol redirect). Different components, different
triggers; F31's redirect merely _leads into_ a cold navigation that can stall here. Kept
separate. Also not a `navVersion` churn loop (a loop would show a burst of `/api/page` requests
and never self-clear at a fixed timeout) and not the F33 session race (`signup` has no
`_user`-dependent routing).

## Escalation — upstream (dev-server tooling)

Module config is not at fault (builds are green and sub-400ms); the fix is in the platform dev
client/server.

- **Primary fix (removes the symptom):** don't gate first paint on `/api/js/client` /
  `/api/icons/dynamic`. They are optional and already degrade to `{}` — return the page config as
  soon as it's ready and fold the JIT-discovered JS/icons in when they arrive (or fetch them
  non-blocking after mount). This eliminates the hang whatever the stall cause is.
- **Secondary (root of the stall):** find why those two routes take ~10s on a cold load —
  likely Vite-middleware / transform contention against the mounted Hono routes — and give them a
  path that isn't blocked by a cold Vite transform pass.
