# Part 52 — ActionSteps render crash: React 18/19 duplication in the build (handover brief)

The `ActionSteps` block throws **React error #31** the moment it renders, blanking the entity action surface (`actions-on-entity`) and the workflow/group overview pages, and failing the Part 22 e2e suite's `check-blocked-by` spec. The data feeding the block is correct — the crash is purely client-side render. The verified root cause is **two React majors (18.2.0 and 19.2.6) coexisting in the built client bundle**: the antd v6 ecosystem and several `@lowdefy` block packages resolve against React 19, the app/server pins React 18, and the generated `vite.config.js` does not dedupe React. Elements created under one major carry a `$$typeof` symbol the other major's renderer rejects → #31. `ActionSteps` is the surface that crosses the boundary (a `modules-mongodb-plugins` block that imports `antd` directly and feeds React children into antd's `Steps`). This is a **dependency-convergence / build problem, not a block-code bug** — `ActionSteps` is authored correctly (peer-dep React/antd, swc transpile, no bundled React).

**Layer:** the `modules-mongodb-plugins` package's dependency declarations. **Size:** S — pin the plugin's React/antd to the versions latest Lowdefy actually ships. **Repo:** `plugins/modules-mongodb-plugins/package.json` (in this repo, no upstream coordination required). Surfaces in `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/`.

## Symptom & reproduction

- **Spec:** `apps/workflows-test/e2e/workflows/check-blocked-by.spec.js` — `getByText('Waiting on the first prep check.')` times out; the entity surface renders the workflow header but the `action_steps` subtree is gone.
- **Browser console (captured via a probe against the running e2e server):**
  ```
  [BlockError] Minified React error #31 ... at entity_workflows.0.action_steps.
    Caused by: object with keys {$$typeof, type, key, ref, props}
  ```
  React #31 = "Objects are not valid as a React child." The reported object **is** a React element; React refuses it because its `$$typeof` came from a different React instance. Lowdefy's block error boundary catches the throw and renders nothing for that block — hence the blank area (the rest of the page survives).
- **Affected blocks:** `ActionSteps` confirmed. **`EventsTimeline`** is the same shape (a `modules-mongodb-plugins` block importing `antd` and building element trees) — treat as affected until proven otherwise; it is the timeline on the same surfaces.
- **Not affected:** form pages built from `@lowdefy/blocks-antd` blocks (TextInput/Button/Card) render fine — the host's own block package and react-dom sit on the same React copy; only the `modules-mongodb-plugins` blocks land on the other one.

## Root cause (verified)

1. **Two React majors are installed.** pnpm store contains both `react@18.2.0` + `react-dom@18.2.0` and `react@19.2.6` + `react-dom@19.2.6`.
2. **Both are bundled into the client.** The built client bundle (`apps/workflows-test/.lowdefy/server/dist/client/assets/main-*.js`) contains **both** element symbols: `Symbol.for("react.element")` (React 18) ×7 and `Symbol.for("react.transitional.element")` (React 19) ×5. React 19 renamed the element symbol, so an element minted by one major fails the other major's `isValidElement` → #31 with exactly the observed `{$$typeof, type, key, ref, props}` (React-18-shaped, with a separate `ref` key) signature.
3. **Latest Lowdefy is uniformly React 18.2.0 — the React 19 is introduced *only* by this repo's plugin package.** Every Lowdefy package that pins React pins `18.2.0` and antd `6.3.1` (verified in the `lowdefy` repo: `packages/servers/server`, `server-dev`, `server-e2e`, `packages/client` all declare `react`/`react-dom` `18.2.0`, `antd 6.3.1`; the block packages — `blocks-antd`, `blocks-basic`, `plugin-aws` — declare `react >=18` as **peers** and resolve to `18.2.0` inside that monorepo, which has no React 19 anywhere). The duplication in *this* repo is self-inflicted: `plugins/modules-mongodb-plugins/package.json` declares only **floating** peer ranges (`react >=18`, `react-dom >=18`, `antd >=6`, `@lowdefy/plugin-aws >=4.0.0`), and because the plugin has no concrete dev pin, pnpm resolves those ranges *up* to the newest published versions — `react@19.2.6`, `react-dom@19.2.6`, `antd@6.4.3`, `plugin-aws@5.3.0` (lockfile importer block for `plugins/modules-mongodb-plugins`). The generated `.lowdefy` server stays on `18.2.0`/`6.3.1`. So the antd v6 ecosystem (`@ant-design/*`, `@rc-component/*`), `@lowdefy/block-utils`, `blocks-basic`, `blocks-antd`, and `plugin-aws` resolve against `react@19.2.6` **only because the plugin importer pulled React 19** — not because anything upstream targets it. (This also explains the sprawl: antd `6.3.1` from the server vs `6.4.3` from the plugin's `>=6`.)
4. **`ActionSteps` is correct.** `plugins/modules-mongodb-plugins/package.json` declares `react >=18`, `antd >=6` as **peer** deps and builds with `swc` per-file transpile (no bundling) — it relies on the host to provide one React/antd. The peer *ranges* are right; what's missing is a concrete build pin telling pnpm which versions to resolve them against locally. The fault is install/resolution, not the block.

| Evidence | Where |
|---|---|
| Both React majors installed | `node_modules/.pnpm/react@18.2.0`, `react@19.2.6` (+ matching react-dom) |
| Both element symbols in client bundle | `…/.lowdefy/server/dist/client/assets/main-*.js`: `react.element` ×7, `react.transitional.element` ×5 |
| Latest Lowdefy is uniformly 18.2.0 / antd 6.3.1 | `lowdefy` repo: `packages/servers/{server,server-dev,server-e2e}/package.json`, `packages/client/package.json` (`react`/`react-dom` `18.2.0`, `antd 6.3.1`); no `react@19` resolved anywhere in its tree |
| Plugin's floating ranges resolve up to React 19 | `pnpm-lock.yaml` importer `plugins/modules-mongodb-plugins`: `react`/`react-dom` → `19.2.6`, `antd` → `6.4.3`, `@lowdefy/plugin-aws` → `5.3.0`, all `(react@19.2.6)` |
| antd/rc + @lowdefy blocks land on React 19 *because* the plugin pulled it | pnpm store dir names `*_react@19.2.6*` for `@ant-design/*`, `@rc-component/*`, `@lowdefy/block-utils`, `blocks-basic`, `plugin-aws` |
| Block is peer-dep, unbundled | `plugins/modules-mongodb-plugins/package.json` (peerDeps `react >=18`, `antd >=6`; build = `swc … --out-dir dist`) |
| Data is healthy (not the cause) | `GetEntityWorkflows` returns `200 success=true` with populated `groups[].actions[]` incl. `message`; action docs carry `action.test.message`. |

## The fix — converge on a single React

The block code needs no change. The lever is to make exactly one `react`/`react-dom` copy reach the client bundle.

### D1 — Pin one React major workspace-wide (recommended), and ensure the build dedupes

Two complementary moves; the first is the in-repo lever, the second is upstream:

- **Workspace pin (in this repo):** add a pnpm override forcing a single `react`/`react-dom` across the tree, e.g. in root `package.json`:
  ```json
  { "pnpm": { "overrides": { "react": "19.2.6", "react-dom": "19.2.6" } } }
  ```
  (or `18.2.0` — see D2). This collapses the store to one copy so the build's install can't resolve two.
- **Build dedupe (upstream, the experimental Lowdefy server template):** the generated `vite.config.js` should set `resolve: { dedupe: ['react', 'react-dom'] }` (and the server `package.json` React pin should match the chosen major). This is the durable, "one correct way" fix — without it, a future transitive React can re-duplicate even with an override. **Owned by the `lowdefy` package**, not this repo; flag to the Lowdefy build work already in flight (same place as the `extractBlockMap` `slots` fix).

### D2 — Which major: React 19 (recommended) vs 18

- **React 19 (recommended):** antd v6 (`6.3.1`/`6.4.3`) and the React-19 `@lowdefy` block builds already target it; React 19 is where the ecosystem resolved. Aligning forward avoids fighting antd's direction.
- **React 18:** matches the current server-template pin (`18.2.0`), so it's less likely to surprise the host renderer — but it pins *against* the antd v6 stack's resolved major, which is the source of the duplication.

**This decision must be coordinated with whatever the experimental Lowdefy server template pins/targets** — the user owns that build. Pick the major the template will settle on, then pin the workspace and dedupe the vite config to match. Do not split (app on one major, blocks on another) — that is precisely the current bug.

### D3 — Do not "fix" it inside ActionSteps

Tempting workarounds — having `ActionSteps` import React/antd from the host via some shim, or stop importing `antd` directly — are rejected. The block is authored to the correct contract (peer deps, no bundled React); the duplication is environmental. Patching the block would mask a build defect that still bites every other `modules-mongodb-plugins` block (`EventsTimeline`, future blocks) and every consuming app. Fix the environment once.

## Verification

1. After pinning + dedupe, rebuild: `cd apps/workflows-test && rm -rf .lowdefy && pnpm e2e e2e/workflows/check-blocked-by.spec.js`.
2. Confirm the client bundle contains **one** element symbol: grep `…/.lowdefy/server/dist/client/assets/main-*.js` for `react.element` / `react.transitional.element` — exactly one variant should appear.
3. The `check-blocked-by` spec should pass (blocked messages render); re-run the full `e2e/workflows` suite. (Note the suite is also gated by the `extractBlockMap` `slots` fix in `@lowdefy/e2e-utils` and the engine `user.roles` change — see Related.)
4. Sanity-check `EventsTimeline` renders on a surface that uses it (e.g. `lead-view`).

## Open item to confirm (diagnostic colour, does not change the fix)

Which copy each side resolves to — i.e. *why* `@lowdefy/blocks-antd` form blocks render but `modules-mongodb-plugins` blocks crash — is unconfirmed (most likely the host react-dom + its block package share one major while `modules-mongodb-plugins` resolves the other). The fix (converge on one React) is correct regardless; this only matters if convergence somehow doesn't resolve it.

## Files changed (expected)

- **Root `package.json`** — `pnpm.overrides` pinning `react`/`react-dom` to the chosen major (D1/D2).
- **Upstream `lowdefy` server template** (not this repo) — `resolve.dedupe` in the generated `vite.config.js` + matching server `package.json` React pin. Flag to the in-flight Lowdefy build work.
- **No change to** `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/` (D3) — the block is correct.

## Non-goals

- **Rewriting `ActionSteps`/`EventsTimeline`** (D3).
- **The `actions-on-entity` layout polish** — F17 in [Part 51](../_next/51-ui-fix-sweep-NOTES.md) (title + steps wrapping) is a *separate*, non-fatal flex bug on the same component; fix independently. This part is only the fatal React crash.
- **Resolving the antd `6.3.1` vs `6.4.3` / multi-version `@lowdefy` sprawl** beyond what the React pin requires — broader dep hygiene, separate effort.

## Related

- [Part 22 — Workflows e2e suite](../22-workflows-e2e-suite/design.md) — the suite this crash fails; two sibling blockers found alongside it and handled separately: (a) `@lowdefy/e2e-utils` `extractBlockMap` doesn't traverse the new `slots` build shape (upstream helper fix, in flight); (b) the engine reading roles from `user.apps[app_name].roles` instead of `user.roles` (engine fix by the user; test fixtures already scrubbed to top-level `roles`).
- [Part 51 — UI/bug fix sweep](../51-ui-fix-sweep-NOTES.md) — F17 (`actions-on-entity` layout) touches the same component but is non-fatal.
