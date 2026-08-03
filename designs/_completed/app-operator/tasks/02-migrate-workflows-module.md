# Task 2: Migrate the workflows module to `slug`

## Context

Task 1 renamed the `WorkflowAPI` connection property from `app_name` to `slug` in the plugin
package and bumped it to `0.15.0`. This task migrates the workflows module to match: it wires
the connection to `slug`, feeds the build-time resolver the slug via `_build.app: slug`,
removes the `app_name` manifest var, renames the resolver internals, and bumps the plugin
version constraint.

Two operator forms are in play (design §Build-time and runtime usage):

- `_app: slug` — runtime and ordinary build positions (the connection prop is server-evaluated
  at runtime).
- `_build.app: slug` — **only** when the value is an argument to a `_build.*` construct. The
  `makeActionPages.js` resolver consumes the slug at build time to enumerate
  `action.access?.[slug]` and emit per-action pages; an unevaluated `{ _app: slug }` object
  would pass its truthy guard and then silently drop every page. So the resolver var must be
  `_build.app: slug`.

## Task

**`modules/workflows/connections/workflow-api.yaml`** (line ~14):

- Rename the connection property key `app_name:` → `slug:`.
- Change its value from `{ _module.var: app_name }` to `{ _app: slug }` (server-evaluated
  runtime prop).

**`modules/workflows/module.lowdefy.yaml`:**

- Remove the `app_name:` manifest var block (lines ~104–113).
- In the `makeActionPages.js` resolver `vars:` (lines ~243–244): rename the key `app_name:` →
  `slug:` and change the value from `{ _module.var: app_name }` to `{ _build.app: slug }`.
- Update the `plugins:` version constraint for `@lowdefy/modules-mongodb-plugins`
  `^0.14.1` → `^0.15.0` (line ~249) — must match the version bumped in task 1.
- Update any var `description` prose that names the slug position: `access.{app_name}` →
  `access.{slug}`, `action.{app_name}.message` → `action.{slug}.message`,
  `action.{app_name}.links` → `action.{slug}.links`, and "the current app's slug" phrasing as
  needed.

**`modules/workflows/resolvers/`** (`makeActionPages.js`, `makeWorkflowsConfig.js`, any related
resolvers, their `*.test.js`, and `README.md`):

- Rename `vars.app_name` / `appName` locals, parameters, and `{app_name}` error-message
  placeholders → `slug` (reading `vars.slug` now that the resolver var key is `slug`).
- Harden the `makeActionPages.js` guard: reject non-strings, not just falsy —
  `if (typeof slug !== "string" || !slug) { throw ... }` — so an unevaluated object fails the
  build loudly instead of silently emitting zero action pages.
- Update `README.md` prose to say `slug`.

## Acceptance Criteria

- `workflow-api.yaml` declares `slug: { _app: slug }`.
- `module.lowdefy.yaml` has no `app_name` var, the resolver var is `slug: { _build.app: slug }`,
  and the plugin constraint is `^0.15.0`.
- `makeActionPages.js` guard rejects non-string slug.
- No `app_name`/`appName` referring to the slug value remains under
  `modules/workflows/resolvers/` (verify with `git grep -n 'app_name\|appName' modules/workflows/`
  — remaining hits should only be the stored `created.app_name` field, if any, and CHANGELOG).
- Resolver tests pass (`pnpm --filter <workflows resolver package/test target> test`, or the
  repo's test runner for that folder).

## Files

- `modules/workflows/connections/workflow-api.yaml` — modify — property `app_name` → `slug`, value → `{ _app: slug }`
- `modules/workflows/module.lowdefy.yaml` — modify — drop `app_name` var; resolver var → `slug: { _build.app: slug }`; plugin constraint → `^0.15.0`; description slug renames
- `modules/workflows/resolvers/makeActionPages.js` — modify — `appName`/`vars.app_name` → `slug`; harden guard to reject non-strings
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — `app_name`/`appName` locals → `slug`
- `modules/workflows/resolvers/makeActionPages.test.js` — modify — fixtures/locals → `slug`
- `modules/workflows/resolvers/README.md` — modify — prose `app_name` → `slug`

## Notes

- Depends on task 1 (the plugin property is now `slug`). Both land in the same PR — the
  connection wiring and plugin schema are lockstep.
- Confirm the resolver-var `_build.app: slug` form resolves correctly with `ldf:b` in the
  verify task — the resolver is a `_ref` build construct, not a literal `_build.*` operator
  (design §Upstream status).
- Do not touch the stored `created.app_name` field or `CHANGELOG.md` history entries.
