# Task 6: Wire the workflows module entry into apps/demo/modules.yaml

## Context

After tasks 2, 4, and 5, the workflows module manifest accepts the four required vars (`workflows_config`, `app_name`, `entities`, `user_schema`), the demo has a `workflow_config/workflows.yaml` ready to ref, and the demo has a `leads-collection` connection + lead pages live. This task adds the `workflows` module entry to `apps/demo/modules.yaml` so the demo actually pulls the module in.

The demo's `modules.yaml` (`apps/demo/modules.yaml`) currently lists nine modules: `activities`, `companies`, `contacts`, `events`, `files`, `layout`, `notifications`, `release-notes`, `user-account`, `user-admin`. Add the workflows entry at the alphabetically-correct position (between `user-admin` and end, or wherever conventions dictate — the existing file is roughly alphabetical).

The `app_name` for the demo is `demo` (verify in `apps/demo/app_config.yaml`).

The `entities` map needs to mirror the `entity_collection` labels used in task 4's workflow YAML (`leads-collection`) and point them at the lead pages from task 5 (`page_id: lead-view`, `id_query_key: _id`, `title: Lead`).

The pattern for vars-from-a-file: see `apps/demo/modules/contacts/vars.yaml`. Vars for the workflows module are simple enough to inline here, but a separate `apps/demo/modules/workflows/vars.yaml` is more consistent with the existing convention (every other module entry in `modules.yaml` uses `_ref: modules/{name}/vars.yaml`).

## Task

### `apps/demo/modules/workflows/vars.yaml`

Create the vars file. Schema:

```yaml
workflows_config:
  _ref: ../../workflow_config/workflows.yaml
app_name:
  _ref:
    path: app_config.yaml
    key: app_name
user_schema:
  roles_path: roles
entities:
  leads-collection:
    page_id: lead-view
    id_query_key: _id
    title: Lead
```

The `_ref` path for `workflows_config` resolves from `apps/demo/modules/workflows/vars.yaml` upward — verify the relative path works. If `_ref` resolution is rooted at `apps/demo/` instead, use `workflow_config/workflows.yaml`.

The `app_name` `_ref` follows the same shape `apps/demo/modules/contacts/vars.yaml` uses (`{ path: app_config.yaml, key: app_name }`).

### `apps/demo/modules.yaml`

Add the workflows module entry. Insert as a new entry (preserve alphabetical ordering):

```yaml
- id: workflows
  source: "file:../../modules/workflows"
  vars:
    _ref: modules/workflows/vars.yaml
```

## Acceptance Criteria

- `apps/demo/modules/workflows/vars.yaml` exists with all four required vars populated.
- `apps/demo/modules.yaml` carries a new `workflows` module entry pointing at `file:../../modules/workflows`.
- `apps/demo` builds (`pnpm --filter=demo ldf:b`) without errors.
- The part-4 build validator (`makeWorkflowsConfig`) passes — every `entity_collection` referenced by the workflows in `workflows_config` (currently just `leads-collection`) has a matching key in `vars.entities`.
- The Lowdefy build emits scoped pages under `/workflows/{page_id}` paths (e.g. `/workflows/task-edit`, `/workflows/workflow-overview`, `/workflows/group-overview`).
- The build emits scoped API endpoints (e.g. `/api/workflows/start-workflow`).
- No "missing `_ref`" errors anywhere in the build output.

## Files

- `apps/demo/modules/workflows/vars.yaml` — **create**
- `apps/demo/modules.yaml` — **modify**

## Notes

- `source: "file:../../modules/workflows"` is the local-monorepo pattern matching the other module entries.
- If the build complains about a missing `notifications` module dep, double-check task 2's `dependencies:` block — the design landed on only `[layout, events]`; `notifications` is deferred to 20b. If the build itself enforces dependency resolution and complains, that's a finding to surface back — the design decision is to NOT declare `notifications` here.
- Verify the `entities` map's key (`leads-collection`) matches the `entity_collection` field on the parent and child workflows in task 4. If the names diverged, fix the task-4 files (the convention is `entity_collection` == the leads connection ID).
- The workflows module's scoped IDs use entry-id prefix `workflows-` (the entry ID set in `modules.yaml`). After this task, the demo's URL paths include `/workflows/...` for module-shipped pages — anchor task 7's buttons against those exact paths.
