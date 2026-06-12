---
"@lowdefy/modules-mongodb-workflows": minor
---

Workflows Part 48 — per-workflow start/cancel/close endpoints; generic lifecycle Apis retired.

**Breaking.** The generic `start-workflow`, `cancel-workflow`, and `close-workflow` Apis are removed. `makeWorkflowApis` now emits `{type}-start`, `{type}-cancel`, and `{type}-close` per workflow (every workflow, including all-tracker ones). Callers construct the endpoint id from the workflow type and drop `workflow_type` from the start payload — it is baked into the type-scoped endpoint as a static literal. Remaining payload fields are unchanged (`entity_id`, `entity_collection`, `parent_action_id`, `actions`, `references`, `metadata` on start; `workflow_id`, `reason`, `references` on cancel/close), as are the `:return` shapes.

Each lifecycle endpoint carries the same `render_config` bundle as the workflow's `{type}-submit` (own + ancestor render slices), plus `lifecycle_event_override` — the workflow-level `event[started|cancelled|closed]` slice for the one signal the endpoint fires (omitted when not declared). No `hooks` ride these endpoints.

Migration: replace `_module.endpointId: { id: start-workflow, module: workflows }` with `{ id: <workflow_type>-start, module: workflows }` (same for cancel/close) and remove `workflow_type` from the start payload.
