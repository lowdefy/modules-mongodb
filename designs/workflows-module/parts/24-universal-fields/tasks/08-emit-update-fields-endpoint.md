# Task 8: `makeWorkflowApis` emits the fields endpoint per form action

## Context

`modules/workflows/resolvers/makeWorkflowApis.js` emits the per-action Api endpoints. `emitForWorkflow` walks `workflow.actions`, skips trackers, and emits hook Apis + the submit endpoint (`emitActionEndpoint`, id `{workflow.type}-{action.type}-submit`, an `Api` whose routine runs the `SubmitWorkflowAction` request type on `_module.connectionId: workflow-api`).

This task adds the universal-fields operation endpoint: one per **`kind: form`** action (simple actions write fields on `submit`; trackers have no surface). The id is **`{workflow_type}-{action_type}-update-fields`** — workflow-prefixed like the submit endpoints, because action types are only unique per workflow (this prefix is a user-approved deviation already folded back into design.md).

## Task

1. In `makeWorkflowApis.js`, add an `emitFieldsEndpoint(workflow, action)` used from `emitForWorkflow` for every action with `kind === 'form'` (after the submit endpoint emission; trackers and simple actions get nothing):

   ```yaml
   id: {workflow.type}-{action.type}-update-fields
   type: Api                                  # HTTP-callable, like the submit endpoint (not InternalApi)
   routine:
     - id: update_fields
       type: UpdateActionFields
       connectionId: { _module.connectionId: workflow-api }
       properties:
         action_id: { _payload: action_id }
         action_type: <action.type>           # build-time literal
         workflow_type: <workflow.type>       # build-time literal
         fields: { _payload: fields }         # { assignees?, due_date?, description? }
         comment: { _payload: comment }       # optional; rides the planner's comment param (Part 33 renders it into display.{app_name}.description — no metadata.comment)
     - ':return':
         action_id: { _step: update_fields.action_id }
         event_id: { _step: update_fields.event_id }
   ```

   Match the JS-object construction style of `emitActionEndpoint` (operator keys as string literals, e.g. `{ _payload: 'action_id' }`).

2. The submit endpoint, hook emission, group `on_complete` emission, and the reserved-`workflow`-type guard are untouched. Note the reserved-type guard already protects the new id space (`workflow-…-update-fields` can't collide with module pages because `workflow` is a rejected workflow type).

3. Extend `makeWorkflowApis.test.js`:
   - A form action emits both `{wf}-{action}-submit` and `{wf}-{action}-update-fields`; the fields endpoint is `type: Api` with exactly the properties above and the two-key `:return`.
   - A `kind: simple` action emits a submit endpoint and **no** fields endpoint.
   - A `kind: tracker` action emits neither (existing skip).
   - Two workflows sharing an action type name emit two distinct, non-colliding fields-endpoint ids.

## Acceptance Criteria

- `makeWorkflowApis` tests pass; existing emission snapshots/cases unchanged apart from the new endpoints.
- Emitted fields endpoints carry no `signal` / `form` / `interaction` keys — the operation is signal-less by contract.
- Demo app build (`apps/demo`) still succeeds (the endpoint routine references the `UpdateActionFields` request type registered in task 5 — at runtime it requires task 5; the build is independent).

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify — `emitFieldsEndpoint` + form-kind emission.
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — emission cases.

## Notes

- `type: Api` (not `InternalApi`) is deliberate: unlike hooks, this endpoint is called from the client (the component's Update button via `CallApi`), and the handler's load-phase `edit`-verb gate is the access authority — the same posture as the submit endpoint.
- The `action_type` / `workflow_type` literals mirror the submit-endpoint shape; `action_id` is the authoritative target locator (task 5).
- Don't emit for simple actions "for consistency" — explicitly deferred in the design's out-of-scope list.
