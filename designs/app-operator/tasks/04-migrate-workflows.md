# Task 4: Workflows subsystem — `_app` migration **and** `app_name` → `slug` rename

## Context

Two changes to the workflows subsystem land together because they share the `workflow-api` connection interface — splitting them would break the per-task build check:

- **Part A — `_app` migration.** Drop the `app_name` manifest var; swap reads to `_app: slug` (runtime) / `_build.app: slug` (build-time resolver).
- **Part B — identifier rename.** Rename the `app_name`/`appName` *identifier* to `slug` everywhere it denotes the slug value, across `modules/workflows/resolvers/` and the `plugins/modules-mongodb-plugins/` engine — including the `WorkflowAPI` connection property. See [design.md §Rename the `app_name` identifier to `slug`](../design.md#rename-the-app_name-identifier-to-slug-in-code). The stored field `created.app_name` and the slug-valued stored keys (`action.{slug}`, `access.{slug}`, `user.apps.{slug}`) are **not** renamed — only code/config names.

The careful build-time site is the `makeActionPages.js` resolver: it consumes the slug at build to emit per-action pages. An unevaluated operator object slips past its `if (!appName)` guard and silently emits zero pages — so the resolver var must be `{ _build.app: slug }`.

## Task

### Part A — `_app` migration (module YAML)

1. **Manifest** — `modules/workflows/module.lowdefy.yaml`: delete the `app_name:` entry from `vars:`.
2. **Runtime sites** — replace `_module.var: app_name` → `_app: slug` in any `api/*` / `pages/*` request filters. Re-grep: `grep -rn "_module.var: app_name" modules/workflows/`.

### Part B — rename `app_name` → `slug`

3. **Connection property (lockstep — both sides in this task):**
   - `modules/workflows/connections/workflow-api.yaml`: rename the property key `app_name:` → `slug:`, and set its value to `{ _app: slug }` (server-evaluated connection prop, runtime).
   - `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` (~line 112): rename the `app_name` property definition to `slug`; update its description.

4. **Resolver vars + resolvers:**
   - `module.lowdefy.yaml` `makeActionPages.js` `_ref`: rename the resolver var key `app_name:` → `slug:`, value `{ _build.app: slug }`.
   - `modules/workflows/resolvers/makeActionPages.js`: `vars.app_name` → `vars.slug`; rename the `appName` local → `slug`; update messages.
   - `modules/workflows/resolvers/makeWorkflowsConfig.js`: rename the `appName` loop variable (over `Object.entries(access)`) → `slug`; update `{app_name}` placeholders in error strings → `{slug}`.
   - `modules/workflows/resolvers/makeActionPages.test.js`: `app_name:` fixtures → `slug:`.
   - `modules/workflows/resolvers/README.md`, `modules/workflows/README.md`: update prose/inputs.

5. **Plugin engine internals** (~27 src files): in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/**` (handlers `GetEntityWorkflows`, `GetEventsTimeline`, `GetWorkflowActionGroupOverview`, `GetWorkflowOverview`, `GetWorkflowAction`, plus `StartWorkflow`/`SubmitWorkflowAction`/`CloseWorkflow`/`CancelWorkflow`) and `connections/shared/**` (`phases/*`, `phases/planners/*`, `render/resolveActionAccess.js`):
   - `const app_name = connection.app_name` → `const slug = connection.slug`; all downstream `app_name`/`appName` locals, the `computeAllowed({ access, app_name, userRoles })` parameter, and JSDoc → `slug`.
   - The data-index expressions stay semantically identical (`action[slug]`, `access[slug]`, `user.apps[slug].roles`, `$${slug}.title`) — only the variable name changes.
   - All affected `*.test.js`: `app_name:` fixtures → `slug:`.
   - Confirm no literal stored key is touched: `created.app_name` (if present in fixtures) and any document-shape key keyed by the slug value stay as-is.

6. **Plugin version + manifest constraint:**
   - Bump `plugins/modules-mongodb-plugins/package.json` `version` (breaking schema change; minor bump per the 0.x policy, e.g. `0.7.0` → `0.8.0`).
   - Update the `version:` constraint for `@lowdefy/modules-mongodb-plugins` in `modules/workflows/module.lowdefy.yaml`'s `plugins:` list to match.
   - Rebuild `dist/`: `pnpm --filter @lowdefy/modules-mongodb-plugins build` (or the repo's build). `dist/` is a build artifact — never hand-edit it.

7. **Demo vars** — `apps/demo/modules/workflows/vars.yaml`: delete the top-level `app_name:` block.

## Acceptance Criteria

- `grep -rn "_module.var: app_name" modules/workflows/` returns nothing; manifest declares no `app_name`.
- `grep -rn "app_name\|appName" modules/workflows/ plugins/modules-mongodb-plugins/src/` returns **only** stored-key references (e.g. a `created.app_name` fixture), no code identifiers. (Run it and eyeball every remaining hit.)
- `workflow-api.yaml` declares `slug: { _app: slug }`; `schema.js` declares the `slug` property; the engine reads `connection.slug`.
- `module.lowdefy.yaml` resolver `_ref` passes `vars: { …, slug: { _build.app: slug } }`; `makeActionPages.js` reads `vars.slug`.
- Plugin version bumped; manifest `plugins:` constraint updated; `dist/` rebuilt.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` (or repo test cmd) passes.
- `pnpm ldf:b` succeeds **and** emits per-action pages for actions with `access.demo.*` (proves the resolver got `"demo"` at build via `_build.app: slug`). Missing pages = `_app` used where `_build.app` was needed.

## Files

- `modules/workflows/module.lowdefy.yaml` — drop `app_name` var; resolver var → `slug: { _build.app: slug }`; plugin version constraint.
- `modules/workflows/connections/workflow-api.yaml` — property `app_name:` → `slug: { _app: slug }`.
- `modules/workflows/api/*.yaml`, `modules/workflows/pages/*.yaml` — runtime `_app: slug` swaps (grep to find).
- `modules/workflows/resolvers/{makeActionPages.js,makeActionPages.test.js,makeWorkflowsConfig.js,README.md}`, `modules/workflows/README.md` — rename.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/**`, `plugins/modules-mongodb-plugins/src/connections/shared/**` (incl. `*.test.js`) — rename.
- `plugins/modules-mongodb-plugins/package.json` — version bump.
- `apps/demo/modules/workflows/vars.yaml` — delete `app_name:` block.

## Notes

- This is the largest task by file count (~30 files across two packages) but mechanically uniform — a scoped find/replace of an identifier plus the two `_app`/`_build.app` value swaps. Keep it one task: the connection-property rename must be lockstep or the build breaks mid-sequence.
- Watch the stored/code boundary: a blind `app_name → slug` replace across the plugin would corrupt any `created.app_name` fixture. The data keys indexed *by the slug value* (`action[slug]`) are safe — those use the variable, not the literal.
- This task also clears the forward note tracked by Task 8 only via the back-reference there; no action here.
