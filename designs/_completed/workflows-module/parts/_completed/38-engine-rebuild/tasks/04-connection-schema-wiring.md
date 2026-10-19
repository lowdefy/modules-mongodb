# Task 4: Connection schema + manifest wiring

## Context

The engine needs the module entry id at runtime (for `entry_id`-scoped pageId computation in `computeEngineLinks`), and two existing schema field descriptions become factually false under this rebuild and must be rewritten. This is small, foundational wiring that the render layer (task 3) and load/commit phases depend on.

## Task

**`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`:**

- Add an `entry_id` field — `string`, required (per Part 30). Wired from `_module.id: true` in the connection YAML (below).
- Add **`entity_ref_key`** to the workflow shape's required fields (beside `entity_collection` — the workflow-shape description at `schema.js:56–61`): `string`, the event-references key for the workflow's entity (e.g. `lead_ids`). Resolver-side validation lands in task 6; design "Event references" owns the rationale (replaces the deleted `deriveEntityRefKey` derivation).
- **Rewrite the `changeLog: { collection, meta }` field description.** The current text says it is "forwarded to the community-plugin MongoDBCollection handlers … automatically." That is now false — engine writes bypass the plugin (D8) and the engine consumes `changeLog` natively (D7). Rewrite to describe native engine consumption (same shape, same opt-in, same app-facing behaviour; engine populates before/after from the Plan). Keep the field.
- **Rewrite the `actionsEnum[].priority` field description.** The current "load-bearing — the engine compares priorities in the priority-rule check in SubmitWorkflowAction" is made false (the priority-rule check is removed; D4 makes priority display-only). Rewrite to: "display-only (ordering in pickers / visualizations); the engine no longer consults it for transition legality." The field itself stays required.

**`modules/workflows/connections/workflow-api.yaml`:**

- Add `entry_id: { _module.id: true }`.

**`modules/workflows/module.lowdefy.yaml`:**

- Update the `app_name` var description per Part 30.

## Acceptance Criteria

- `schema.js` declares a required `entry_id` string field.
- `changeLog` and `priority` descriptions no longer reference the community-plugin forwarding / priority-rule check respectively; both accurately describe post-rebuild behaviour.
- `workflow-api.yaml` wires `entry_id` from `_module.id`.
- The build resolves `entry_id` on the connection (verify the module still builds).
- `app_name` description updated in the manifest.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify (add `entry_id`; rewrite `changeLog` + `priority` descriptions)
- `modules/workflows/connections/workflow-api.yaml` — modify (add `entry_id`)
- `modules/workflows/module.lowdefy.yaml` — modify (update `app_name` description)

## Notes

- Manifest is the source of truth for var schema (CLAUDE.md) — update the manifest description, and keep the README "Vars" section in sync (handle README in the docs-update pass, not necessarily here).
- `entry_id` is consumed by `computeEngineLinks` (task 3) and the page/api id scoping (Part 34 D10).
