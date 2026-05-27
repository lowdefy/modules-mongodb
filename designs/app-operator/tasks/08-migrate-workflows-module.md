# Task 8: Migrate the `workflows` module to `_app: slug`

## Context

`modules/workflows` declares `app_name` as a manifest var ("The host app's deployment name. Filters action access via `access.{app_name}` per action") and reads it at 10 sites across:

- The `workflow-api` connection (payload key).
- Three `get-*` API endpoints and one pipeline stage in `api/stages/access_filter.yaml`.
- `pages/group-overview.yaml`.
- A self-reference inside the manifest itself: `pages: - _ref: { resolver: ..., vars: { app_name: { _module.var: app_name } } }`.

The resolver case is the trickiest: `modules/workflows/module.lowdefy.yaml` passes the slug to `resolvers/makeActionPages.js`, which enumerates `action.access?.[appName]` and emits one Lowdefy page per action. Page generation is fundamentally build-time; without `_app: slug` resolving at build time, the resolver receives an unevaluated operator object and silently emits zero pages.

The design also notes that a forward-reference about this migration exists in `designs/workflows-module/parts/30-status-map-rendering/design.md` line 144 — that comment is removed in task 13 (design doc sweep).

## Task

1. **Module manifest** — edit `modules/workflows/module.lowdefy.yaml`:
    - Delete the `app_name:` entry from `vars:`.
    - Replace the resolver-vars self-reference: `vars: { app_name: { _module.var: app_name } }` → `vars: { slug: { _app: slug } }` (rename the var name the resolver consumes from `app_name` to `slug` — this matches the design's "standardise to slug" decision).

2. **Resolver** — edit `modules/workflows/resolvers/makeActionPages.js`: rename the destructured variable from `appName` to `slug` (or whatever name matches the new vars key), and update any internal use sites and log messages accordingly. The behaviour does not change — it still enumerates `action.access?.[slug]`.

3. **Module YAML** — replace every `_module.var: app_name` with `_app: slug` in:
    - `modules/workflows/connections/workflow-api.yaml`
    - `modules/workflows/api/get-action-group-overview.yaml`
    - `modules/workflows/api/get-entity-workflows.yaml`
    - `modules/workflows/api/get-workflow-overview.yaml`
    - `modules/workflows/api/stages/access_filter.yaml`
    - `modules/workflows/pages/group-overview.yaml`

    Total in module YAML (excluding manifest self-ref): 9 occurrences (run `grep -rc "_module.var: app_name" modules/workflows/` to confirm).

4. **Demo vars** — edit `apps/demo/modules/workflows/vars.yaml`: delete the top-level `app_name:` block.

## Acceptance Criteria

- `grep -r "_module.var: app_name" modules/workflows/` returns no results.
- `modules/workflows/module.lowdefy.yaml` no longer declares `app_name` under `vars:`.
- The `pages:` `_ref` resolver call passes `vars: { slug: { _app: slug } }`.
- `modules/workflows/resolvers/makeActionPages.js` reads `slug` from its vars and uses it to index into `action.access`.
- `apps/demo/modules/workflows/vars.yaml` no longer declares a top-level `app_name:` key.
- `pnpm ldf:b` succeeds.
- The demo's workflows group-overview page renders, and per-action pages are emitted for every action with `access.demo.*` declared (verifies the resolver received `"demo"` at build time).

## Files

- `modules/workflows/module.lowdefy.yaml` — modify — drop `app_name` var; resolver vars `app_name` → `slug`.
- `modules/workflows/resolvers/makeActionPages.js` — modify — rename consumed var from `appName` to `slug`.
- `modules/workflows/connections/workflow-api.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/workflows/api/get-action-group-overview.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/workflows/api/get-entity-workflows.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/workflows/api/get-workflow-overview.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/workflows/api/stages/access_filter.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/workflows/pages/group-overview.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `apps/demo/modules/workflows/vars.yaml` — modify — delete top-level `app_name:` block.

## Notes

- The resolver consumes the slug via Lowdefy's standard `_ref` vars mechanism. The vars object is evaluated by Lowdefy before being passed to the resolver, so `_app: slug` must resolve at build time per the upstream requirement.
- The `workflow-api` connection payload field name (`app_name`) is a wire-protocol field, not a Lowdefy var — keep the field name as `app_name` if the external API consumes that exact key. Only the *value* expression migrates: `app_name: { _app: slug }`.
- The forward note in `designs/workflows-module/parts/30-status-map-rendering/design.md:144` is removed in task 13, not here.
