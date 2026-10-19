# Task 3: Ship `close-workflow.yaml`

## Context

Third handler-wrapper. `close-workflow` proxies into the `CloseWorkflow` plugin handler shipped by [part 23](../../23-close-workflow-handler/design.md). Same shape as task 1's `cancel-workflow.yaml`, different request type.

`CloseWorkflow` is user-initiated normal termination — pushes the workflow to `completed` (not `cancelled`) and sweeps non-terminal actions while honoring `required_after_close: true` (with the blocked-action exception). See [part 23 design § `CloseWorkflow.js`](../../23-close-workflow-handler/design.md) for the handler's contract.

Handler payload contract:

- **Required:** `workflow_id`.
- **Optional:** `reason`, `references`.
- **Returns:** `{ action_ids, event_id, tracker_fired }`. Same shape as `cancel-workflow` after parts 8 and 10 landed: `tracker_fired` is the array from [part 10](../../_completed/10-tracker-subscription/design.md)'s `fireTrackerSubscription` (`[]` when no parent); `event_id` is `null` on the close path in v1 (no event-log backfill).

The `CloseWorkflow` request type is added to the `WorkflowAPI` connection's `requests:` map by part 23. If part 23 has not landed yet, this routine will fail at request-resolution time with "unknown request type" — that's the expected coupling.

## Task

Create `modules/workflows/api/close-workflow.yaml`:

```yaml
id: close-workflow
type: Api
routine:
  - id: close
    type: CloseWorkflow
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
        _step: close.action_ids
      event_id:
        _step: close.event_id
      tracker_fired:
        _step: close.tracker_fired
```

Do **not** register the API in `modules/workflows/module.lowdefy.yaml` yet — batched into task 7.

## Acceptance Criteria

- `modules/workflows/api/close-workflow.yaml` exists with the shape above.
- File parses as valid YAML.
- `id` is kebab-case (`close-workflow`); step `id` is snake_case (`close`); `connectionId` uses `_module.connectionId`.
- The `type: CloseWorkflow` matches the request-type key part 23 registers on the `WorkflowAPI` connection's `requests:` map.
- No `auth:` block.

## Files

- `modules/workflows/api/close-workflow.yaml` — **create** — single-step routine invoking the `CloseWorkflow` plugin request, returning the handler's `{ action_ids, event_id, tracker_fired }` shape.

## Notes

- This task is independent of task 2 — both depend only on task 1's directory layout. They can ship in parallel.
- If part 23 ships after this task lands, the routine YAML is in place but unusable until then. That's intentional — keeping the routine alongside cancel/start makes the part-19 unit clean and avoids a follow-up PR. The part-23 implementation task adds `CloseWorkflow` to the `WorkflowAPI.requests` map ([`WorkflowAPI.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js)), which lights this routine up automatically.
- The "user-initiated" vs "auto-complete" distinction matters at the call site, not the routine. Auto-complete is the path inside `SubmitWorkflowAction` that pushes `completed` when every action is terminal ([part 7 § auto-complete check](../../_completed/07-group-state-machine/design.md)); this API is the **other** path — a user clicking "close this workflow" on the UI surface (eventually part 17's `workflow-overview` page; UI lands later).
