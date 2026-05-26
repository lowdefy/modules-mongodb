# Task 3: Author modules/workflows/README.md

## Context

After task 2, the workflows module manifest carries the full static surface — connections, vars, exports, dependencies, secrets, plugins. The repo's docs convention (`CLAUDE.md` "Documentation" section) requires every module to ship a `README.md` using a fixed template. `modules/workflows/README.md` does not exist; this task authors it.

Per CLAUDE.md, "Manifest is the source of truth for var schema. Every var in `module.lowdefy.yaml` must carry `description:`, `type:`, and (where applicable) `default:` / `required:` / `enum:`. The README 'Vars' section restates the manifest descriptions in narrative form for readers, but if README and manifest disagree the manifest wins."

The README must include a worked example for `vars.entities` because that var is not in the concept spec — the README is the canonical place apps look for the shape.

The fixed README template: **Description, Dependencies, How to Use, Exports (Pages / Components / API Endpoints / Connections / Menus), Vars, Secrets, Plugins, Notes**.

Reference patterns:
- `modules/contacts/README.md` (full reusable-module README at v0.6.0).
- `modules/events/README.md` (smallest reusable-module README).
- The on-disk `modules/workflows/module.lowdefy.yaml` (post-task-2) — source of truth for every var description and export ID.

## Task

Create `modules/workflows/README.md` following the CLAUDE.md fixed template.

### Description

One-paragraph summary: multi-workflow engine that lets apps declare workflow YAML, render entity-scoped action lists, and submit lifecycle transitions through engine-managed handlers. Mention the "shared `task-*` pages + `workflow-overview` + `group-overview`" UI surface and the operational APIs (`start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`).

### Dependencies

Restate from manifest:
- `layout` — page layout wrapper consumed by every shared page.
- `events` — provides the `change_stamp` component referenced by the `workflow-api` connection.

Note that `notifications` will become a dependency when part 20b ships its per-action endpoints; not declared yet.

### How to Use

Show a minimal `apps/{app}/modules.yaml` entry wiring the module:

```yaml
- id: workflows
  source: "github:lowdefy/modules-mongodb/modules/workflows@v0.6.0"
  vars:
    workflows_config:
      _ref: workflow_config/workflows.yaml
    app_name:
      _ref:
        path: app_config.yaml
        key: app_name
    entities:
      leads-collection:
        page_id: lead-view
        id_query_key: _id
        title: Lead
      tickets-collection:
        page_id: ticket-view
        id_query_key: _id
        title: Ticket
```

Annotate each var:
- `workflows_config` — the app's workflow YAML (one entry per workflow type, with actions and action_groups). Schema validated by `makeWorkflowsConfig` at build time.
- `app_name` — host app's deployment name; filters per-action access and keys the default log event's display block.
- `entities` — map keyed by `entity_collection` → `{ page_id, id_query_key, title }`. Used for back-link URLs from workflow-overview and entity-kind labels in workflow-header. **Every `entity_collection` referenced in `workflows_config` must have a matching key here** — the part-4 build validator fails the build if any are missing.

### Exports

Five subsections per the template — list each ID with a one-line description (drawn from the manifest's `exports.*.description` fields):

- **Pages** — `task-edit`, `task-view`, `task-review`, `workflow-overview`, `group-overview`. Followed by a one-line callout: "Per-action pages (`-edit` / `-view` / `-review` / `-error`) and per-action submit endpoints (`update-action-{action_type}`) ship in part 20b."
- **Components** — `action_statuses`, `workflow_lifecycle_stages`, `actions-on-entity`, `workflow-header`, `action_role_check`, `action_form_configs`. (After task 9 runs, `action_form_configs` is a component, not a global register entry.)
- **API Endpoints** — the six operational APIs.
- **Connections** — `workflows-collection`, `actions-collection`, `workflow-api`.
- **Menus** — "None in v1. Menu exports land alongside the per-app navigation work."

### Vars

Narrative paragraphs restating each var from the manifest (`workflows_config`, `app_name`, `user_schema`, `entities`, `action_statuses_display`, `workflow_lifecycle_stages_display`). Mention the default for `user_schema` (`{ roles_path: roles }`). Mention which are `required: true`.

### Secrets

`MONGODB_URI`.

### Plugins

`@lowdefy/modules-mongodb-plugins` at `^0.6.0` — ships the `WorkflowAPI` server connection consumed by the `workflow-api` connection above.

### Notes

- Prerelease (0.x); pin to an exact version or commit SHA in production.
- Part 20a ships the static surface (this README). Part 20b extends with per-action form/task page resolvers and per-action submit endpoints.
- Cross-cutting idioms (change stamps, event display, slots, app_name, secrets) link to `docs/idioms.md` anchors (`#change-stamps`, `#event-display`, `#slots`, `#app-name`, `#secrets`).

## Acceptance Criteria

- `modules/workflows/README.md` exists.
- All nine template sections present in order: Description, Dependencies, How to Use, Exports (with five subsections), Vars, Secrets, Plugins, Notes.
- Every var listed in `module.lowdefy.yaml`'s `vars:` block has a matching narrative entry in the README's Vars section.
- Every export ID listed in `module.lowdefy.yaml`'s `exports:` block has a matching entry in the README's Exports section (and vice versa — no README entry that isn't in the manifest).
- The "How to Use" section includes a worked example for `vars.entities` showing at least one entry with all three subfields (`page_id`, `id_query_key`, `title`).
- Plugin version pin in the README matches `plugins/modules-mongodb-plugins/package.json` (currently `0.6.0`).
- No mention of resolver-emitted exports as currently shipping (those land in 20b).

## Files

- `modules/workflows/README.md` — **create**

## Notes

- Read the post-task-2 `modules/workflows/module.lowdefy.yaml` before writing the README — the manifest is the source of truth for every var description and export ID. Do not paraphrase loosely; restate.
- Don't add a "Dependency graph" section — that lives at the repo root `README.md`. Modules just list their direct deps.
- The repo's main `README.md` will need a row added for the workflows module under the "Modules" table — but that's outside this task's scope (the workflows module is still prerelease; surface that elsewhere when 20b ships).
