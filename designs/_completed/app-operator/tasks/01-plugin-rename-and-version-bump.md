# Task 1: Rename `app_name` in the plugin package and bump the version

## Context

The `@lowdefy/modules-mongodb-plugins` package (`plugins/modules-mongodb-plugins/`) declares
two connection schemas that currently expose a property named `app_name`, and its engine
internals thread that value under `app_name`/`appName` local names. The migration renames the
identifier to `slug` everywhere it denotes the app slug value — **except** the `EventsTimeline`
connection property, which renames to **`display_key`** (it is fed the events module's
`display_key`, which can legitimately diverge from the slug in the ops-app case).

This is the deepest dependency in the migration: the workflows connection YAML (task 2) and
the events connection YAML (task 3) wire into the properties this task renames, so their keys
must match. Those wiring edits land lockstep in the same PR.

Nothing about stored data changes — `created.app_name` and other stored keys keep their names.
This is purely a code/identifier rename plus a breaking-schema version bump.

## Task

**WorkflowAPI connection** (`src/connections/WorkflowAPI/`):

- `schema.js` — rename the connection property `app_name` → `slug`. Rewrite its
  consumer-facing `description` to describe the slug and drop any stale wiring narration.
- Every handler that reads `connection.app_name` (`GetEntityWorkflows`, `GetEventsTimeline`,
  `GetWorkflowAction`, `GetWorkflowActionGroupOverview`, `GetWorkflowOverview`,
  `UpdateActionFields`, and any others) → `connection.slug`.
- All `*.test.js` fixtures that pass `app_name:` into the connection → `slug:`.

**EventsTimeline connection** (`src/connections/EventsTimeline/schema.js`):

- Rename the connection property `app_name` → **`display_key`** (not `slug`).
- Rewrite its stale `description` — it currently wrongly says "Host app deployment name" wired
  "from `_module.var: app_name` on `connections/workflow-api.yaml`". It is the events
  connection, fed the events module's `display_key`. Describe it accordingly.
- Rename the matching `connection.app_name` read in the shared engine that consumes this
  property → `connection.display_key`.

**Shared engine internals** (`src/connections/shared/`):

- In `phases/`, `phases/planners/`, and `render/resolveActionAccess.js` (and their tests),
  rename every `app_name`/`appName` local variable, parameter, and JSDoc name that holds the
  slug value → `slug`. These are cosmetic — they carry the slug value. Do **not** rename the
  stored field `created.app_name` or any literal stored key (`action.{slug}.message`,
  `access.{slug}`, `user.app_attributes.{slug}`, `{slug}.title` keep their stored key bytes —
  the placeholder shown here is the slug value, which is unchanged).

**Version bump:**

- `package.json` — bump `version` `0.14.1` → `0.15.0` (breaking schema change → minor bump
  per the 0.x policy).
- Rebuild `dist/` via the package's `build` script (`dist/` is a build artifact, not
  git-tracked — do not hand-edit it).

## Acceptance Criteria

- No occurrence of `app_name` or `appName` remains in `plugins/modules-mongodb-plugins/src/`
  that refers to the slug value or a connection property (verify:
  `git grep -n 'app_name\|appName' plugins/modules-mongodb-plugins/src/` returns only stored
  field references like `created.app_name` and stored-key placeholders, if any).
- `WorkflowAPI/schema.js` declares `slug`; `EventsTimeline/schema.js` declares `display_key`.
- Both connection `description` strings read correctly for the renamed property.
- `package.json` version is `0.15.0`.
- The plugin test suite passes (run the package's test script, e.g.
  `pnpm --filter @lowdefy/modules-mongodb-plugins test`).
- `dist/` rebuilt from the `build` script.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify — property `app_name` → `slug`, rewrite description
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/**/*.js` — modify — `connection.app_name` → `connection.slug` (handlers)
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/**/*.test.js` — modify — fixtures `app_name:` → `slug:`
- `plugins/modules-mongodb-plugins/src/connections/EventsTimeline/schema.js` — modify — property `app_name` → `display_key`, rewrite description
- `plugins/modules-mongodb-plugins/src/connections/shared/**/*.js` — modify — `app_name`/`appName` locals/params/JSDoc → `slug`; the EventsTimeline reader → `display_key`
- `plugins/modules-mongodb-plugins/src/connections/shared/**/*.test.js` — modify — fixtures/locals renamed
- `plugins/modules-mongodb-plugins/package.json` — modify — version `0.14.1` → `0.15.0`
- `plugins/modules-mongodb-plugins/dist/**` — regenerate — rebuild via `build` script

## Notes

- Lockstep: the `slug` property is consumed by `modules/workflows/connections/workflow-api.yaml`
  (task 2) and the `display_key` property by `modules/events/connections/events-timeline.yaml`
  (task 3). All three land in the same PR.
- The two connections declare properties with the same old name (`app_name`) but rename to
  **different** new names (`slug` vs `display_key`). Do not conflate them.
- Distinguish the slug value (rename) from the stored `created.app_name` field and stored
  keys (never rename). When a variable holds the slug, rename it; when a string literal is a
  stored MongoDB path, leave it.
