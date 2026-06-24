# Task 8: `makeWorkflowApis` emits the update-fields endpoint per workflow

> **Rev 2:** the endpoint is now **one per workflow type** (`{workflow_type}-update-fields`), action_id-dispatched, mirroring the shipped `{workflow_type}-submit` — *not* per-action-type. The build-time `action_type` literal is dropped.

## Context

`modules/workflows/resolvers/makeWorkflowApis.js` emits the workflow Api endpoints. The main operations are emitted **once per workflow type**, dispatched by `action_id` + `signal`: `{workflow.type}-submit` (`:135`), `{workflow.type}-start` (`:174`), `{workflow.type}-{verb}` for cancel/close (`:221`). Only the pre/post **hooks** are per-action-type (`:18`). The submit handler reads `type` / `kind` off the loaded action doc — the endpoint carries no per-action-type config.

The update-fields operation follows the same shape: it takes `action_id` + `fields`, the `UpdateActionFields` handler (task 5) loads the action by id and reads `type` / `workflow_type` / `kind` from the doc. So it needs **one endpoint per workflow type**, not one per action. The `{workflow_type}-` prefix avoids cross-workflow collisions.

## Task

1. In `makeWorkflowApis.js`, add an `emitFieldsEndpoint(workflow)` emitted **once per workflow** from `emitForWorkflow` — gated on the workflow declaring at least one surface-bearing (`kind: form` or `kind: check`) action (a workflow that is tracker-only emits nothing). Place it alongside the existing per-workflow `{workflow.type}-submit` emission:

   ```yaml
   id: {workflow.type}-update-fields
   type: Api                                  # HTTP-callable, like the submit endpoint
   routine:
     - id: update_fields
       type: UpdateActionFields
       connectionId: { _module.connectionId: workflow-api }
       properties:
         action_id: { _payload: action_id }
         workflow_type: <workflow.type>       # build-time literal (the only per-workflow constant)
         fields: { _payload: fields }         # { assignees?, due_date?, description? }
         comment: { _payload: comment }       # optional; rides the planner's comment param (Part 33 renders it into display.{app_name}.description — no metadata.comment)
     - ':return':
         action_id: { _step: update_fields.action_id }
         event_id: { _step: update_fields.event_id }
   ```

   Match the JS-object construction style of the submit-endpoint emitter (operator keys as string literals, e.g. `{ _payload: 'action_id' }`).

2. The submit endpoint, start/cancel/close endpoints, hook emission, group `on_complete` emission, and the reserved-`workflow`-type guard are untouched. The reserved-type guard already protects the new id space (`workflow-update-fields` can't collide with module pages because `workflow` is a rejected workflow type).

3. Extend `makeWorkflowApis.test.js`:
   - A workflow with a form action emits `{wf}-update-fields` (exactly one, regardless of how many form/check actions it has); `type: Api` with exactly the properties above and the two-key `:return`.
   - A workflow with only check actions still emits `{wf}-update-fields` (check actions are independently updatable).
   - A **tracker-only** workflow emits **no** update-fields endpoint.
   - Two workflows emit two distinct ids (`{wfA}-update-fields`, `{wfB}-update-fields`).

## Acceptance Criteria

- `makeWorkflowApis` tests pass; existing emission cases unchanged apart from the new per-workflow endpoint.
- The emitted endpoint carries no `signal` / `form` / `interaction` / `action_type` keys — the operation is signal-less and workflow-scoped by contract.
- Demo app build (`apps/demo`) still succeeds (the routine references the `UpdateActionFields` request type registered in task 5 — required at runtime, independent at build).

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify — `emitFieldsEndpoint` (per-workflow) + emission gated on a surface-bearing action.
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — emission cases.

## Notes

- `type: Api` (not `InternalApi`) is deliberate: this endpoint is called from the client (the component's Update button via `CallAPI`), and the handler's load-phase `edit`-verb gate is the access authority — the same posture as the submit endpoint.
- `action_id` is the authoritative target locator (task 5); `workflow_type` is the only build-time literal the endpoint needs.
- Emit for both form and check workflows (check actions get the independent Update path in addition to writing fields on submit — design "no check special-case"). The component decides whether to render the Update button; the endpoint just needs to exist for the workflow.
