# Task 1: Ship `cancel-workflow.yaml`

## Context

This task creates the `modules/workflows/api/` directory (greenfield — does not exist yet) and ships the smallest of the three handler-wrapper APIs. `cancel-workflow` proxies a Lowdefy `CallApi` payload into the `CancelWorkflow` plugin handler that lives on the `workflow-api` connection (shipped by part 5).

The handler is at [`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js). Its payload contract:

- **Required:** `workflow_id`.
- **Optional:** `reason`, `references`.
- **Returns:** `{ action_ids, event_id, tracker_fired }`. As of the shipped handler ([`CancelWorkflow.js:143`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)), `tracker_fired` is the array from [part 10](../../_completed/10-tracker-subscription/design.md)'s `fireTrackerSubscription` (`[]` when no parent); `event_id` is `null` on the cancel path in v1 — [part 8](../../_completed/08-side-effect-dispatch/design.md) lit it up for `SubmitWorkflowAction` but did not backfill cancel.

The canonical "Lowdefy routine invoking a `WorkflowAPI` request type" shape lives in [`modules/workflows/resolvers/makeWorkflowApis.js:85-108`](../../../../../modules/workflows/resolvers/makeWorkflowApis.js) — the resolver emits routines of exactly the shape this task hand-writes:

```js
{
  type: 'Api',
  routine: [
    { id: 'submit', type: 'SubmitWorkflowAction', connectionId: { '_module.connectionId': 'workflow-api' }, properties: { ... } },
    { ':return': { action_ids: { _step: 'submit.action_ids' }, ... } },
  ],
}
```

`references` is passed through unchanged. The handler defends against reserved-key collisions via `RESERVED_WORKFLOW_KEYS` deletion ([`CancelWorkflow.js:4-17`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)); the routine does not re-validate.

This task also establishes the directory convention. Subsequent tasks (2, 3, 5, 6) add files alongside.

## Task

1. Create the directory `modules/workflows/api/`.

2. Create `modules/workflows/api/cancel-workflow.yaml`:

   ```yaml
   id: cancel-workflow
   type: Api
   routine:
     - id: cancel
       type: CancelWorkflow
       connectionId:
         _module.connectionId: workflow-api
       properties:
         workflow_id:
           _payload: workflow_id
         reason:
           _payload: reason
         references:
           _payload: references

     - :return:
         action_ids:
           _step: cancel.action_ids
         event_id:
           _step: cancel.event_id
         tracker_fired:
           _step: cancel.tracker_fired
   ```

3. Do **not** register the API in `modules/workflows/module.lowdefy.yaml` yet — that batches into task 7.

## Acceptance Criteria

- `modules/workflows/api/cancel-workflow.yaml` exists with the shape above.
- File parses as valid YAML (no tab/indent errors).
- `id` is kebab-case (`cancel-workflow`); inner step `id`s are snake_case (`cancel`); the `connectionId` uses `_module.connectionId` (matching CLAUDE.md's portable-module convention).
- No `_state` references in routine properties (per CLAUDE.md anti-pattern; only `_payload`).
- The optional `reason` and `references` payload keys are passed through even when absent — `_payload` returns `undefined` for missing keys and the handler treats them as omitted.

## Files

- `modules/workflows/api/cancel-workflow.yaml` — **create** — single-step routine invoking the `CancelWorkflow` plugin request, returning the handler's `{ action_ids, event_id, tracker_fired }` shape.

## Notes

- The shipped handler returns `event_id: null` and `tracker_fired: <array>` ([`CancelWorkflow.js:143`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) after parts 8 and 10 landed). The routine's `:return:` shape is fixed; an event-log backfill onto cancel (would flip `event_id` to a real id) is a follow-up against part 5's shipped behavior, not blocked on this task.
- Do not add `auth:` / `auth.roles:` on the API. Authorization on cancel is the host app's concern (e.g. the page that calls this API gates the button via `action_role_check`); the module ships open and the consumer wraps it.
- No event logging in the routine. The handler's `event_id: null` posture means cancel does not generate a log event in v1 ([part 5 design](../../_completed/05-start-cancel-handlers/design.md) defers this as a follow-up).
