# Task 1: Dual-runtime build for `@lowdefy/modules-mongodb-plugins`

## Context

The plugin package `plugins/modules-mongodb-plugins/` is **client-only today**: `src/types.js` exports `connections: []` and `requests: []`, and the build emits a single `dist/` tree containing block + action code. From part 03 onwards the package needs to host server-side connection code under `src/connections/` and ship it alongside the existing client code under `src/blocks/` / `src/actions/` / `src/metas.js`.

The Lowdefy plugin loader discovers the plugin's surface from `src/types.js`. The upstream convention for a dual-runtime plugin is:

```js
// src/types.js
import { extractBlockTypes } from "@lowdefy/block-utils";
import * as actions from "./actions.js";
import * as connections from "./connections.js";
import * as metas from "./metas.js";

const blockTypes = extractBlockTypes(metas);
export default {
  ...blockTypes,
  actions: Object.keys(actions),
  operators: {},
  connections: Object.keys(connections),
  requests: Object.keys(connections).flatMap((c) =>
    Object.keys(connections[c].requests),
  ),
};
```

Each connection module exports `{ schema, requests: { RequestType: handlerFn } }`. Connection handler signature (per concept engine spec):

```js
async ({
  blockId,
  connection,
  connectionId,
  pageId,
  request,
  requestId,
  payload,
  context,
}) => result;
```

The package already builds with SWC via `pnpm build` → `swc src --out-dir dist --config-file ../../.swcrc --delete-dir-on-start --copy-files --strip-leading-paths`. The `.swcrc` at repo root targets es2020, classic React runtime, ES modules. The same `swc` invocation will pick up `src/connections/**` automatically.

The hard `src/blocks/` vs `src/connections/` split is the **structural** guarantee that no React imports leak into server-side modules. The concept design flagged "Plugin dual-runtime build complexity" as a risk closed by this task.

## Task

1. **Create `src/connections.js`** — barrel export for server-side connections (mirrors `src/blocks.js` shape). Initially empty exports — `WorkflowAPI` lands in task 5:

   ```js
   // src/connections.js
   // Server-side plugin connections. Each export is a module-shaped
   // `{ schema, requests: { RequestType: handlerFn } }` object — see
   // designs/workflows-module-concept/engine/spec.md.
   ```

2. **Update `src/types.js`** to import `./connections.js` and populate `connections` + `requests` arrays per the snippet in Context. Keep existing block / action / operator entries intact.

3. **Update `package.json` `exports`** to expose the connections barrel:

   ```jsonc
   "exports": {
     "./*": "./dist/*",
     "./actions": "./dist/actions.js",
     "./blocks": "./dist/blocks.js",
     "./connections": "./dist/connections.js",
     "./metas": "./dist/metas.js",
     "./types": "./dist/types.js"
   }
   ```

4. **Add the `mongodb` dependency** to `package.json` `dependencies`. Use the latest 6.x line that matches the version `@lowdefy/community-plugin-mongodb` ships against — verify by inspecting the installed version in `pnpm-lock.yaml`. (`@lowdefy/helpers` is already a peer; no change there.)

5. **Rebuild** with `pnpm --filter @lowdefy/modules-mongodb-plugins build` and confirm `dist/blocks.js`, `dist/actions.js`, `dist/connections.js`, `dist/metas.js`, `dist/types.js` are all present. `src/connections/` is created by task 2 — no directory needs to exist yet. Version bump + changeset are deferred to the closeout commit for part 03 (task 6) so the whole shell ships under one release entry.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-mongodb-plugins build` succeeds.
- `dist/types.js` evaluated in Node lists `connections: []` and `requests: []` (still empty — populated in task 5).
- `dist/blocks.js` and `dist/connections.js` both exist; the latter contains no React imports (`grep -r 'react' dist/connections.js 2>/dev/null` returns nothing — once task 5 adds the connection sources, also grep `dist/connections/`).
- `package.json` declares `mongodb` under `dependencies` and exposes `./connections` in `exports`.
- The plugin is still loadable client-side: `pnpm --filter demo ldf:b` builds the demo app without errors.

## Files

- `plugins/modules-mongodb-plugins/src/connections.js` — create — empty barrel export with comment header
- `plugins/modules-mongodb-plugins/src/types.js` — modify — import `./connections.js`, populate `connections` + `requests`
- `plugins/modules-mongodb-plugins/package.json` — modify — add `mongodb` dep, add `./connections` to `exports` (version bump + changeset deferred to part 03 closeout)

## Notes

- The concept spec's [risk on dual-runtime builds](../../../workflows-module-concept/design.md#cross-cutting-open-questions-and-risks) calls for verifying via grep that `dist/connections/*` is React-free. The grep step is part of acceptance, not just a manual check.
- `src/blocks/`, `src/actions/`, `src/metas.js` are untouched in this task — the split is structural; existing client code stays where it is.
- Don't move SWC config out of repo root `.swcrc` — the existing config already targets es2020 + ES modules and works for both client and server emits.
