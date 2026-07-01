---
"@lowdefy/modules-mongodb-plugins": minor
---

**Feature (Part 26):** workflows declare an inline `entity.data` routine on the `entity:` block (authored exactly like a hook — `{ routine: [...] }`) that returns host-shaped data about the entity instance. The module generates an engine-only `{type}-entity-data` InternalApi from the routine (`makeWorkflowApis`) and carries the resolved endpoint id on `entity.data_endpoint` (`makeWorkflowsConfig`, with the build-only `data` routine stripped from the runtime config). The single-workflow read handlers — `GetWorkflowAction`, `GetWorkflowOverview`, `GetWorkflowActionGroupOverview` — call the endpoint server-side via the engine's `callApi` (same authenticated user) through a shared `resolveEntityData` helper.

The routine's reserved `name` key is lifted onto `entity_link.name` for the breadcrumb / back-link; all other keys are host-owned and merged onto the action response's `entity` object (consumed by the action page's `DataDescriptions` summary and the `entity_view` slot). Resolution never fails the read — a missing endpoint, a throwing routine, or a deleted entity all degrade to `name: null` (chrome falls back to the type label) and `entity: { id }`.

This replaces the previous `entity.name_field` dot-path + the per-page `get_entity` request: the request file is deleted, all five action templates (`view`/`review`/`edit`/`error`/`action`) drop the `get_entity` request + onMount read and source the instance name from `entity_link.name` and entity fields from `get_workflow_action.entity`. The action-workspace shell stops blanking the page on the self-set `entity_id` — the middle/right content show content-shaped skeletons gated on the `get_workflow_action` request, and the entity-id mount gate is narrowed to just the `actions-on-entity` and History panels.

`entity.data` must be an object with a `routine:` array; a string value (the legacy external-endpoint-id shape) hard-errors with a migration hint. The demo onboarding workflow declares an `entity.data` routine and its `entity_view` slot reads `get_workflow_action.entity.*`.
