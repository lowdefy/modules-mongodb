# Task 4: Wire `fireTrackerSubscription` into `CancelWorkflow`

## Context

`CancelWorkflow` ([CancelWorkflow.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)) currently:

1. Pushes `{ stage: 'cancelled' }` onto the workflow's `status[]` (lines 53–67).
2. Flips non-terminal actions to `not-required` (lines 69–94).
3. Reads the actions again, recomputes summary + groups, writes both in one `$set` (lines 96–127).
4. Returns `{ action_ids, event_id: null, tracker_fired: null }` (line 132).

This task adds the tracker subscription fire after step 3, before the return. The cancelled workflow may have a parent tracker action that needs to flip to `not-required` — that's what the subscription handles. The handler's return shape's `tracker_fired` field stays in the same position but is now populated with the subscription's fire array.

`CancelWorkflow` doesn't generate an event in v1 (per [part 5 design.md § Out of scope](../../05-start-cancel-handlers/design.md) — event lands in [part 8](../../08-side-effect-dispatch/design.md)). The handler's `context.eventId` is therefore `null` — and the subscription's `eventId` propagation is documented to surface `event_id: null` on the parent action's status entry on the cancel path. **Do not synthesize a fresh event id** to feed the subscription.

## Task

### 1. Add the imports.

At the top of [CancelWorkflow.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js):

```js
import fireTrackerSubscription from '../SubmitWorkflowAction/fireTrackerSubscription.js';
```

### 2. Extend the context object with `eventId: null`.

The current context-build at lines 21–28 doesn't include `eventId`. `fireTrackerSubscription` reads `context.eventId` to thread into the parent action's status entry. Set it explicitly to `null`:

```js
const context = {
  mongoDBConnection: createMongoDBConnection(lowdefyContext),
  workflowsConfig: connection.workflowsConfig,
  actionsEnum: connection.actionsEnum,
  changeStamp: connection.changeStamp,
  eventId: null,
  params: payload,
};
```

Explicit `null` (rather than omitting) documents the contract: the cancel path doesn't carry an event id, and the subscription doesn't synthesize one. Same posture as the handler's return at line 132.

### 3. Call the subscription after the final writeback, before the return.

Currently the file ends with:

```js
  await context.mongoDBConnection('workflows').MongoDBUpdateOne({
    filter: { _id: payload.workflow_id },
    update: {
      $set: {
        summary: { done, not_required, total },
        groups,
        updated: context.changeStamp,
      },
    },
  });

  // NOTE: do NOT include completed_groups — per part 7 design, CancelWorkflow
  // doesn't fire on_complete hooks. Part 11's fan-out reads completed_groups
  // only from SubmitWorkflowAction's return.
  return { action_ids: actionIds, event_id: null, tracker_fired: null };
}
```

Replace with:

```js
  await context.mongoDBConnection('workflows').MongoDBUpdateOne({
    filter: { _id: payload.workflow_id },
    update: {
      $set: {
        summary: { done, not_required, total },
        groups,
        updated: context.changeStamp,
      },
    },
  });

  // Tracker subscription — fire after the final summary + groups writeback so
  // the cancelled workflow doc is consistent before the parent recompute reads
  // it (via fireTrackerSubscription → recomputeWorkflowAfterActionWrite, which
  // is on a *different* workflow but may interact with the cancelled doc in
  // future cross-workflow scenarios). The subscription returns [] when the
  // workflow has no parent_action_id, so this is safe to call unconditionally.
  const trackerFired = await fireTrackerSubscription(context, {
    workflowId: payload.workflow_id,
    newStage: 'cancelled',
    depth: 0,
  });

  // NOTE: do NOT include completed_groups — per part 7 design, CancelWorkflow
  // doesn't fire on_complete hooks. Part 11's fan-out reads completed_groups
  // only from SubmitWorkflowAction's return.
  return { action_ids: actionIds, event_id: null, tracker_fired: trackerFired };
}
```

Notes:
- Call unconditionally (no `if (parent_action_id)` guard). The subscription itself reads the workflow's `parent_action_id` and returns `[]` when null — pushing the guard into the helper keeps the call site simple and matches `SubmitWorkflowAction`'s posture (it guards on `shouldPushCompleted`, not on parent presence).
- The subscription propagates whatever `context.eventId` is — explicitly `null` here per step 2 above. Parent action's status entry gets `event_id: null`.

### 4. Don't change the action-sweep ordering.

Steps 1, 2, and 3 (workflow cancel push, action sweep, summary + groups writeback) stay in the current order. The subscription fires only after all three so the cancelled workflow's on-disk state is consistent before the parent's recompute (inside the subscription) runs.

## Acceptance Criteria

- `CancelWorkflow.js` imports `fireTrackerSubscription` from `'../SubmitWorkflowAction/fireTrackerSubscription.js'`.
- `context.eventId = null` is explicit on the context object.
- The subscription call sits after the final `MongoDBUpdateOne` (summary + groups writeback), before the `return` statement.
- The return value is `{ action_ids, event_id: null, tracker_fired: trackerFired }` — `tracker_fired` is now the array returned by the subscription, not the literal `null`.
- Test coverage in `CancelWorkflow.test.js`:
  - Cancel a workflow with `parent_action_id: null` → `tracker_fired` is `[]`; no writes to any other action collection.
  - Cancel a workflow with a valid `parent_action_id` (tracker on a different workflow) → `tracker_fired` has one entry `{ parent_action_id, parent_workflow_id, new_status: 'not-required' }`; the parent action's status[0] is `not-required` in DB; the parent action's status entry's `event_id` is `null`.
  - Cancel a child whose parent tracker is already at `not-required` → same-stage guard fires; `tracker_fired` is `[]`; no write to the parent action.
  - Existing pre-task behaviour preserved: cancel writes the workflow's `cancelled` status push first; flips non-terminal actions to `not-required`; recomputes summary + groups in one writeback. Existing assertions on those facts still pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — modify — import, `eventId: null` on context, subscription call before return, swap return literal.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.test.js` — modify — add the three new cases; update any existing case that asserted on `tracker_fired === null` for a workflow with a parent.

## Notes

- **`eventId: null` is load-bearing.** Without it, `context.eventId` would be `undefined`, and `updateAction`'s default at [shared/updateAction.js:42](../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js) would coerce it to `null` — net effect identical. But explicit `null` documents the contract at the cancel call site so a future change to `updateAction`'s default doesn't silently break the cancel path's documented behaviour.
- **Why call unconditionally?** Pushing the `parent_action_id` check into the helper (already there as step 2 of fireTrackerSubscription's body) keeps the call site readable and matches `SubmitWorkflowAction`'s symmetry. The unconditional call is cheap — the helper short-circuits with one find before any writes.
- **Multi-level recurse on cancel.** If the cancelled workflow's parent itself becomes `completed` (because all its other actions are already terminal and the just-flipped tracker is the last one), the subscription recurses. Same multi-level mechanics as the submit path. The 11-level depth-limit test in task 5 covers both paths.
- **Per [part 5](../../05-start-cancel-handlers/design.md):** the `tracker_fired: null` placeholder in the cancel return shape was always reserved for this part — wiring it up is the contract this task fulfils.
