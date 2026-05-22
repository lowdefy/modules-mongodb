# Part 20 — Module manifest + demo wiring

**Source rationale:** [workflows-module-concept/module-surface/spec.md](../../../workflows-module-concept/module-surface/spec.md). **Layer:** surface. **Size:** S. **Repo:** `modules/workflows/` + `apps/demo/`.

## Goal

Final wiring: `module.lowdefy.yaml`, three connections, exports for pages and components, vars, dependency declarations, plugin bump. Add the worked-example onboarding workflow to `apps/demo` for end-to-end smoke. Ship the per-module README. After this part, an app can drop the module into `modules.yaml` and the v1 feature set is live.

## In scope

### `module.lowdefy.yaml`

- **`vars`**:
  - `workflows_config: array` (required) — app's workflow YAML.
  - `app_name: string` (required) — host app deployment name.
  - `user_schema: object` (default `{ roles_path: roles }`).
  - `action_statuses_display: object` (default `{}`).
  - `workflow_lifecycle_stages_display: object` (default `{}`).
- **`dependencies`**: `layout`, `events`, `notifications`.
- **`connections`** (refs to `connections/*.yaml`): `workflows-collection`, `actions-collection`, `workflow-api`.
- **`plugins`**: `@lowdefy/modules-mongodb-plugins` at the version that ships `WorkflowAPI` (bumped to `^0.4.0` or current per concept).
- **`exports`**:
  - `pages`:
    - Static: `task-edit`, `task-view`, `task-review`, `workflow-overview` (from [part 17](../17-shared-pages/design.md)), `group-overview` (from [part 25](../_completed/25-group-overview-page/design.md)).
    - Dynamic via [part 2](../02-dynamic-module-pages/design.md) channel: per-action pages emitted by `makeActionPages` ([part 12](../12-resolver-pages/design.md)).
  - `api`:
    - Static: `start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview` (from [part 19](../19-operational-apis/design.md); `close-workflow` is added by [part 23](../23-close-workflow-handler/design.md)), `get-action-group-overview` (from [part 25](../_completed/25-group-overview-page/design.md)).
    - Dynamic: per-action `update-action-{action_type}` emitted by `makeWorkflowApis` ([part 13](../13-resolver-apis/design.md)).
  - `components`: `actions-on-entity`, `workflow-header`, `action_role_check` (from [part 18](../18-entity-components/design.md)).
  - `enums`: `action_statuses`, `workflow_lifecycle_stages` (from [part 4](../04-workflow-config-schema/design.md)).
- **`secrets`**: `MONGODB_URI`.

### Connection configs

- `connections/workflows-collection.yaml` — MongoDBCollection.
- `connections/actions-collection.yaml` — MongoDBCollection.
- `connections/workflow-api.yaml` — WorkflowAPI from the plugin ([part 3](../03-engine-plugin-shell/design.md)). Reads the normalized config from [part 4](../04-workflow-config-schema/design.md).

### Demo wiring (`apps/demo/`)

- Add the `workflows` module entry to `apps/demo/modules.yaml`.
- Create `apps/demo/workflow_config/onboarding/` with the worked-example onboarding workflow YAML (matching the [concept design.md worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs) verbatim — generic onboarding on a `lead` entity, four actions, one per kind).
- Demo lead page renders `actions-on-entity`.

### Per-module README

`modules/workflows/README.md` follows the repo's fixed template ([CLAUDE.md docs section](../../../../CLAUDE.md)):

- Description.
- Dependencies.
- How to Use.
- Exports (pages / components / api / connections / menus).
- Vars (narrative matching `module.lowdefy.yaml` verbatim — manifest is source of truth).
- Secrets.
- Plugins.
- Notes.

### Optional: idiom cross-links

Per CLAUDE.md, only add anchors to `docs/idioms.md` if a new idiom emerges from this module. Reuse existing anchors (`#change-stamps`, `#event-display`, `#slots`, `#app-name`, `#secrets`) otherwise.

## Out of scope / deferred

- **End-to-end Playwright e2e tests** — owned by [part 22](../22-workflows-e2e-suite/design.md). Part 22 authors specs against the worked-example demo this part wires up.
- **Cleanup of `designs/workflows-module-concept/ui/example_workflow/`** — design-time examples superseded by the live demo. Decide during this part whether to remove or keep as reference.
- **Migration tooling** — concept marks as out of v1.

## Depends on

Every other part. This is the closeout milestone.

## Verification

- End-to-end against the demo: run the worked-example flow ([concept design.md "Worked example"](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs)) step by step; every step works as described.
- Reviewer drops the module into a fresh app with a minimal `workflows_config` and sees a working workflow without writing engine code.
- README accuracy:
  - Every var in `module.lowdefy.yaml` has a matching narrative entry.
  - Every export listed in the README exists in the manifest.
- Plugin version in the manifest matches the version that ships `WorkflowAPI`.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is the manual demo walk-through above; the automated spec lands in part 22 once this part ships.

## Open questions

- **Design-folder cleanup.** Remove `designs/workflows-module-concept/ui/example_workflow/` and friends now that the demo app runs the worked example? Decide here.
