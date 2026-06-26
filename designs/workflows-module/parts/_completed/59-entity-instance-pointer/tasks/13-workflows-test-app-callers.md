# Task 13: workflows-test app — nest entity in runtime callers, e2e specs, and the fixture helper

## Context

The `apps/workflows-test/` app drives the engine through e2e tests. This task updates only the **runtime callers** — the workflow_config **definitions** (the nine files' top-level `entity_collection` / `entity_ref_key` and the app's `vars.entities` map) are config-shape and migrate under **Part 57** (its updated `validateWorkflow` requires the nested `entity:` block). Both parts land in sequence, so the app builds clean once both are applied.

As in the demo, the **URL query param** `entity_id` stays flat (link sentinel); only documents, start/list payloads, and Mongo queries/assertions nest.

## Task

### `apps/workflows-test/e2e/workflowFixture.js`

The fixture helpers take `entity_id` / `entity_collection` (default `'things-collection'`) and use them to seed docs and post payloads:

- `startWorkflow(...)` (~lines 112-119) — assemble the start payload as `entity: { id: entity_id }` (drop `entity_collection` from the payload — the connection id is config-sourced). If it also seeds workflow/action docs directly in Mongo, write `entity: { connection_id: entity_collection, id: entity_id }`.
- `getEntityWorkflows({ entity_id, entity_collection })` (~lines 182-183) — post `{ entity: { connection_id: entity_collection, id: entity_id } }` to `get-entity-workflows`.
- Keep the helper parameter names as-is unless cleaner to rename; the nesting happens where the object is assembled.

### `apps/workflows-test/pages/thing-view.yaml`

The `actions-on-entity` `_ref` (~lines 37-42) passes `entity_collection: things-collection` → rename to `entity_connection_id: things-collection` (matches Task 10). `entity_id` stays.

### workflow_config runtime callers (Part 59 scope only)

In the nine `workflow_config/**` files, update only **runtime callers**: app-authored action requests reading `context.workflow.entity_id` → `context.workflow.entity.id`, and any in-config `get-entity-workflows` / start callers. **Leave** top-level `entity_collection` / `entity_ref_key` **definitions** to Part 57. Grep each file and classify before editing:

```bash
grep -rn "entity_id\|entity_collection\|context.workflow.entity" apps/workflows-test/modules/workflows/workflow_config
```

### e2e specs

Across `apps/workflows-test/e2e/workflows/*.spec.js` and `scaffold.spec.js`, update document **seeds and Mongo query/assertions** from flat `entity_collection` / `entity_id` to nested `entity: { connection_id, id }`. **Do not** change URL query params that carry `entity_id=…` (those stay flat per the link-sentinel rule).

## Acceptance Criteria

- `workflowFixture.js` assembles nested `entity` in both the start payload (`{ id }`) and the get-entity-workflows payload (`{ connection_id, id }`); any direct doc seeds write nested `entity`.
- `thing-view.yaml` passes `entity_connection_id` (renamed) + `entity_id`.
- workflow_config runtime reads use `context.workflow.entity.id`; definitions untouched (Part 57).
- e2e specs seed/query nested `entity`; URL-param assertions remain `entity_id`.
- `pnpm ldf:b` (from `apps/workflows-test`, or the equivalent filter) compiles with Part 57 + Tasks 9/10 landed; the e2e suite is runnable in a live-test environment (not part of the autonomous build gate).

## Files

- `apps/workflows-test/e2e/workflowFixture.js` — modify — nested start + get-entity-workflows payloads and any doc seeds.
- `apps/workflows-test/pages/thing-view.yaml` — modify — `_ref` var rename.
- `apps/workflows-test/modules/workflows/workflow_config/**/*.yaml` — modify — runtime `context.workflow.entity.id` reads + in-config callers only (definitions → Part 57).
- `apps/workflows-test/e2e/scaffold.spec.js` and `apps/workflows-test/e2e/workflows/*.spec.js` — modify — nested doc seeds + Mongo queries/assertions (URL params unchanged).

## Notes

Depends on Tasks 9 + 10. Be deliberate about the definition-vs-caller split inside each `workflow_config` file — the same file can hold a Part 57 definition and a Part 59 runtime read.
