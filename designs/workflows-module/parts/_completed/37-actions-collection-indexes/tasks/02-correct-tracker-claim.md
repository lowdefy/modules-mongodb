# Task 2: Correct the tracker-subscription mechanism wording in the tasks-module-plan concept doc

## Context

The tasks-module-plan concept doc (`designs/workflows-module-concept/tasks-module-plan/design.md`) contains a factually wrong description of how the tracker subscription relates to the `actions` collection. In the "Engine boundary" section there is a bullet (around line 172) that currently reads:

> - The tracker subscription queries the `actions` collection looking for `child_workflow_id` matches — tasks never set this field, so they're transparent to the subscription.

This mechanism is incorrect. `fireTrackerSubscription.js` (in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`) does **not** query `actions` by `child_workflow_id`. Verified against the source: it

1. finds the workflow by `_id` (`MongoDBFindOne({ query: { _id: workflowId }, options: { projection: { parent_action_id: 1 } } })`),
2. reads `parent_action_id` off that workflow doc,
3. fetches the tracker action by that `_id` (`getActionFields(connection, child.parent_action_id)`).

So the join is `workflow.parent_action_id → action._id`, never a query on `actions.child_workflow_id`. The `child_workflow_id` field is written on tracker actions for display/UI but is not used as a query key.

The **semantic claim** the bullet is making — that tasks are transparent to the tracker subscription — still holds and must be preserved. Only the *mechanism* described is wrong.

## Task

Edit the bullet so it states the correct mechanism while keeping the "tasks are transparent to the subscription" conclusion. Suggested replacement:

> - The tracker subscription joins via `workflow.parent_action_id → action._id` (it looks up the child workflow by `_id`, reads its `parent_action_id`, then fetches that action) — it never queries `actions` by `child_workflow_id`, and tasks have no parent workflow linkage, so they're transparent to the subscription.

Match the surrounding bullet style. Do not alter the other two bullets in that list (the `workflow_id` group-recomputation bullet and the `references` write-contract bullet) or the "All three are already true in the current implementation" closing line.

## Acceptance Criteria

- The tracker-subscription bullet in `designs/workflows-module-concept/tasks-module-plan/design.md` describes the join as `workflow.parent_action_id → action._id`, not a query on `actions.child_workflow_id`.
- The "tasks are transparent to the subscription" claim is preserved.
- The other bullets and the closing sentence in that section are unchanged.

## Files

- `designs/workflows-module-concept/tasks-module-plan/design.md` — modify — correct the one tracker-subscription bullet in the "Engine boundary" section (~line 172).

## Notes

- This is the only change to the concept doc. It is independent of Task 1 and can be done in parallel.
