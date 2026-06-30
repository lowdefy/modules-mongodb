---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-workflows": minor
---

**Feature:** workflows can declare an inline `entity.data` routine on the `entity:` block, and the action read handlers resolve it server-side to fetch host-shaped entity data (Part 26). The module generates an engine-only `{type}-entity-data` InternalApi from the routine (`makeWorkflowApis`) and carries the resolved endpoint id on `entity.data_endpoint` (`makeWorkflowsConfig`); the build-only `data` routine is stripped from the runtime config. `GetWorkflowAction`, `GetWorkflowActionGroupOverview`, and `GetWorkflowOverview` call the endpoint via the engine's `callApi` (same authenticated user) through a shared `resolveEntityData` helper.

The routine returns a reserved `name` (the instance display name, lifted onto `entity_link.name` for chrome) plus arbitrary host-owned fields (merged into the action's `entity` object, consumed by the action page slot / DataDescriptions). Resolution never fails the read — a missing endpoint, throwing routine, or deleted entity all degrade to `null` (chrome falls back to the type label, the entity object to a bare `{ id }`).

This replaces the previous `entity.name_field` dot-path + per-page `get_entity` request: the action templates (`view`/`review`) drop the `get_entity` request and read the instance name from `action.entity_link.name` and entity fields from `get_workflow_action.entity`. `entity.data` must be an object with a `routine:` array; the legacy string (`data_endpoint: <id>`) and the old `name_field` shape now hard-error with a migration hint.
