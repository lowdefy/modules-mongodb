# Task 1: Scaffold the `apps/workflows-test/` app

## Context

Part 22 moves exhaustive workflows e2e coverage out of `apps/demo/` into a dedicated, deliberately minimal test app. This task creates that app: a Lowdefy app whose only job is to instantiate the workflows module's surfaces. It is allowed to be ugly and is stable by design — no styling polish, no demo-style curation.

The module takes its entire config through entry `vars` (confirmed reusable — the demo's contract in `apps/demo/modules.yaml` + `apps/demo/modules/workflows/vars.yaml` is the pattern to mirror). The workflows module's manifest (`modules/workflows/module.lowdefy.yaml`) declares three dependencies that must also be wired as module entries: `layout`, `events`, `notifications`.

At this point no cluster fixtures exist; the app ships with an **empty** `workflow_config/workflows.yaml` (an empty YAML list — `makeWorkflowsConfig` maps over the array and accepts `[]`). Cluster tasks 3–10 each add one workflow and `_ref` it from this index.

## Task

Create `apps/workflows-test/` mirroring the demo app's structure, reduced to the minimum:

1. **`package.json`** — copy `apps/demo/package.json` and adjust:
   - `name`: `@lowdefy/modules-workflows-test`
   - Keep the `lowdefy` dependency and the `@lowdefy/e2e-utils` / `@playwright/test` / `@lowdefy/community-plugin-e2e-mdb` devDependencies at the same versions as the demo.
   - Scripts: keep `ldf:b`, `ldf`, `e2e`, `e2e:headed`, `e2e:ui`, `e2e:server` — change every port reference from 3000 to **3001** (i.e. `e2e:server` becomes `lowdefy build --server e2e && lowdefy start --port 3001 --log-level warn`). Drop the infisical variants unless the workflows module needs secrets beyond `MONGODB_URI` (check `modules/workflows/module.lowdefy.yaml` `secrets:`; the demo's `e2e/.env.e2e` pattern covers Mongo).
   - Register the app in the pnpm workspace if `pnpm-workspace.yaml` doesn't already glob `apps/*`.

2. **`lowdefy.yaml`** — minimal app shell. Mirror the demo's top-level structure (lowdefy version, modules ref, connections, pages, menus as needed by the layout module). Define:
   - `app_config.yaml` with `app_name: test` (the access bags in all cluster fixtures key on `access.test`).
   - A `things-collection` MongoDB connection (collection `things`) — the single test entity's backing collection.

3. **`modules.yaml`** — four entries, mirroring `apps/demo/modules.yaml` ordering constraints (workflows entry-vars resolve is order-sensitive when cross-module `_ref`s are involved; here there are none, but keep workflows after its deps for clarity):
   - `layout` (`file:../../modules/layout`), `events` (`file:../../modules/events`), `notifications` (`file:../../modules/notifications`) — each with the minimal `vars` their manifests require (crib from the demo's `modules/{name}/vars.yaml`, stripped down).
   - `workflows` (`file:../../modules/workflows`) with `vars: { _ref: modules/workflows/vars.yaml }`.

4. **`modules/workflows/vars.yaml`** — mirror the demo's shape:

   ```yaml
   workflows_config:
     _ref: modules/workflows/workflow_config/workflows.yaml
   app_name:
     _ref:
       path: app_config.yaml
       key: app_name
   user_schema:
     roles_path: roles
   entities:
     things-collection:
       page_id: thing-view
       id_query_key: _id
       title: Thing
   ```

5. **`modules/workflows/workflow_config/workflows.yaml`** — an empty YAML list (`[]`) with a comment noting cluster tasks append `_ref` entries.

6. **One test entity, two bare pages:**
   - `pages/things.yaml` — page id `things`: a bare list of `things` docs (a simple request + minimal table or even a plain list; no filters, no pagination polish).
   - `pages/thing-view.yaml` — page id `thing-view`, addressed by `?_id=`: shows the thing's title and embeds the workflows module's **`actions-on-entity`** component via cross-module `_ref` (exported in `modules/workflows/module.lowdefy.yaml` `exports.components`; see the demo's lead-view for the embedding pattern). This component is the spine surface several cluster specs click through, so it must be on the entity page from the start.

7. **Menus** — whatever minimal menu the layout module requires to render; one link to `things` is enough.

## Acceptance Criteria

- `pnpm install` succeeds from the repo root with the new app in the workspace.
- `pnpm --filter @lowdefy/modules-workflows-test ldf:b` builds with no errors (empty `workflows_config` passes `makeWorkflowsConfig`).
- `lowdefy start` (or `pnpm e2e:server`) serves on port 3001; `/things` and `/thing-view?_id=x` render (manually or via curl — the Playwright harness is task 2).
- No workflow fixtures, no e2e dir yet — those are tasks 2–10.

## Files

- `apps/workflows-test/package.json` — create
- `apps/workflows-test/lowdefy.yaml` — create
- `apps/workflows-test/app_config.yaml` — create (`app_name: test`)
- `apps/workflows-test/modules.yaml` — create (layout, events, notifications, workflows entries)
- `apps/workflows-test/modules/workflows/vars.yaml` — create
- `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` — create (empty list)
- `apps/workflows-test/modules/{layout,events,notifications}/vars.yaml` — create as needed by each manifest
- `apps/workflows-test/pages/things.yaml`, `apps/workflows-test/pages/thing-view.yaml` — create
- `pnpm-workspace.yaml` — modify only if `apps/*` isn't already globbed

## Notes

- `workflow` is a **reserved workflow type name** (`makeWorkflowApis` throws — derived ids would collide with the module's fixed `workflow-*` page space). Cluster fixture types in later tasks avoid it; nothing in this task uses it either.
- Don't add speculative vars, extra entities, or styling. "Build for what exists": the cluster tasks define what the app needs; this task provides exactly the substrate they share.
- Read `.claude/guides/modules.md` before wiring the module entries.
