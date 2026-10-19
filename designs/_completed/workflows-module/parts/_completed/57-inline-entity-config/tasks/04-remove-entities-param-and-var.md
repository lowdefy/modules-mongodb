# Task 4: Remove the `entities` connection param and module var

## Context

After Task 2, no read method reads `connection.entities`, so the entire `entities` pathway — the connection schema param, the connection wiring, and the module var — is dead and can be removed. The routing fields now live in each workflow's `entity:` block (validated and materialized by Task 1), so the `workflows_config` manifest description must also be rewritten to document the unified block instead of the flat `entity_collection`/`entity_ref_key` fields.

Current locations:

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js:153` — the `entities` object param (lines 153-169).
- `modules/workflows/connections/workflow-api.yaml:17` — `entities: { _module.var: entities }` (lines 17-18).
- `modules/workflows/module.lowdefy.yaml:75` — the `entities` var (lines 75-87, `required: true`).
- `modules/workflows/module.lowdefy.yaml:49` — the `workflows_config` var description (mentions flat `entity_collection`, `entity_ref_key`).

## Task

### `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`

- Remove the `entities` param object (lines 153-169). No replacement `entity`-block schema entry is needed — the materialized `entity` block rides through the existing `workflowsConfig` param (which is `additionalProperties: true`).
- The `workflowsConfig` item description (around lines 82-91) describes the materialized shape. Update it so it no longer presents flat `entity_collection`/`entity_ref_key` as the materialized entity fields — each materialized workflow now carries a nested `entity: { connection_id, ref_key, page_id, id_query_key, title }` block (Task 1 carries it wholesale, lifting nothing). Note that the persistence/runtime layer still reads flat `entity_collection`/`entity_id`/`entity_ref_key` off **documents** (unchanged here; nested by Part 59) — so if the description mentions document fields, leave those flat mentions intact; only the **config** entity shape becomes nested.

### `modules/workflows/connections/workflow-api.yaml`

- Remove the `entities:` property and its `_module.var: entities` value (lines 17-18).

### `modules/workflows/module.lowdefy.yaml`

- Remove the entire `entities` var declaration (lines 75-87).
- Rewrite the `workflows_config` var description (lines 49-64) so it documents the unified `entity:` block instead of flat `entity_collection`/`entity_ref_key`. The description should state that each workflow entry carries a required `entity:` block with:
  - `connection_id` (required) — the entity's Lowdefy connection id (e.g. `leads-collection`).
  - `ref_key` (required) — the event-references key (e.g. `lead_ids`).
  - `page_id` (required) — host-app page id rendering the entity.
  - `id_query_key` (optional, default `_id`) — URL query-string key for the entity's primary id.
  - `title` (required) — singular human-readable entity-kind label (e.g. "Lead").
    Keep the rest of the description (title humanizer, `title_acronyms`, etc.) intact. Drop any reference to flat `entity_collection`/`entity_ref_key` as authored fields.

## Acceptance Criteria

- `schema.js` no longer declares an `entities` param.
- `workflow-api.yaml` no longer wires `entities`.
- `module.lowdefy.yaml` no longer declares the `entities` var.
- The `workflows_config` manifest description documents the `entity:` block (`connection_id`, `ref_key`, `page_id`, `id_query_key` default `_id`, `title`) and no longer references flat `entity_collection`/`entity_ref_key` as authored input.
- Plugin tests still pass (`entities` param removal is safe after Task 2/3).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify — remove the `entities` param.
- `modules/workflows/connections/workflow-api.yaml` — modify — remove the `entities:` wiring.
- `modules/workflows/module.lowdefy.yaml` — modify — remove the `entities` var; rewrite the `workflows_config` description for the `entity:` block.

## Notes

- Do not regenerate `vars.md` here — that is Task 6 (it bundles the doc prose updates and the regen in one place). This task only edits the manifest source.
