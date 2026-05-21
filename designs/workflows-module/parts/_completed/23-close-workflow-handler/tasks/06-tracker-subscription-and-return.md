# Task 6: Wire tracker subscription and return the final shape

## Context

After Task 5, the workflow doc is on-disk consistent (status pushed, summary + groups recomputed). This task fires the tracker subscription so a parent tracker action mirrors the child's `completed → done` transition, then returns the final result shape.

From [design.md § Tracker fan-up](../design.md):

> `CloseWorkflow.js` calls `fireTrackerSubscription(context, { workflowId, newStage: 'completed', eventId: null })` from part 10 directly — after the close write, before the return. Same posture as `CancelWorkflow.js`'s integration. Part 10 is synchronous-in-process, not a change-stream listener; each terminating handler invokes the subscription itself. The hard-coded `completed → done` child-stage map fires the parent action's `done` transition when the workflow has a `parent_action_id`.

Part 10 has shipped. The helper lives at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js`. `CancelWorkflow.js:130–134` already calls it:

```js
const trackerFired = await fireTrackerSubscription(context, {
  workflowId: payload.workflow_id,
  newStage: 'cancelled',
  depth: 0,
});
```

Returns the fire chain as `Array<{ parent_action_id, parent_workflow_id, new_status }>` — empty when no `parent_action_id`. Recurses when the parent recompute pushes the parent workflow to `completed`, capped at depth 10.

The design's Returns line reflects this: `{ action_ids, event_id: null, tracker_fired }` — `tracker_fired` carries the actual fire chain (matching what `CancelWorkflow.js` returns), `[]` when no parent was written.

## Task

### 1. Import the helper

At the top of `CloseWorkflow.js`:

```js
import fireTrackerSubscription from '../SubmitWorkflowAction/fireTrackerSubscription.js';
```

### 2. Call the subscription after Task 5's writeback

After the recompute writeback `MongoDBUpdateOne`:

```js
// Tracker subscription — fires after the final writeback so the completed
// doc is on-disk consistent before the parent recompute reads it. Returns []
// when the workflow has no parent_action_id, so safe to call unconditionally.
const trackerFired = await fireTrackerSubscription(context, {
  workflowId: payload.workflow_id,
  newStage: 'completed',
  depth: 0,
});
```

The `newStage: 'completed'` is the key difference from cancel's call (`newStage: 'cancelled'`). `fireTrackerSubscription` maps via the hard-coded `CHILD_STAGE_MAP`:

```js
{ active: 'in-progress', completed: 'done', cancelled: 'not-required' }
```

so a closed child fires `done` on its parent tracker action.

### 3. Return the final shape

```js
return {
  action_ids: actionIds,
  event_id: null,
  tracker_fired: trackerFired,
};
```

`actionIds` is the swept set from Task 4 (the local from that task). `event_id: null` because v1 close generates no log event (deferred per [design.md § Out of scope](../design.md)). `tracker_fired: trackerFired` — the fire chain from the subscription helper.

### 4. Verify the Task 2 no-op return shape matches

The early-return on already-`completed` workflows ([Task 2](./02-validate-payload-and-stage.md)) should already return `{ action_ids: [], event_id: null, tracker_fired: [] }` — uniformly an array for `tracker_fired` across every return path. If Task 2's implementation landed with `null` instead, fix it here so the handler's return shape is uniformly `{ action_ids: string[], event_id: null, tracker_fired: Array<...> }`.

## Acceptance Criteria

Add unit tests to `CloseWorkflow.test.js`:

- **No-parent workflow returns empty `tracker_fired`:** seed an `active` workflow with `parent_action_id: null`; call close; assert return is `{ action_ids: [...], event_id: null, tracker_fired: [] }`.
- **Child workflow fires parent `done`:** seed a parent tracker action (`kind: 'tracker'`, `status: [{ stage: 'in-progress' }]`) on workflow `wf-parent`, and a child workflow `wf-child` with `parent_action_id: <tracker-id>` in `active`. Call `CloseWorkflow({ workflow_id: 'wf-child' })`. Assert:
  - Parent tracker action's `status[0].stage === 'done'`.
  - Return value's `tracker_fired` is a one-element array with `{ parent_action_id, parent_workflow_id: 'wf-parent', new_status: 'done' }`.
- **Recursion: closing a leaf workflow that bubbles up two levels.** Seed grandparent workflow + parent tracker, parent workflow + child tracker, child workflow `active`. Close the child. Assert the grandparent tracker is `done` AND the parent tracker is `done` AND `tracker_fired` has two entries (newest at index 0 — matches the helper's documented shape).
- **Tracker same-stage no-op:** seed a parent tracker already at `done` and a child workflow `active`. Close the child. Assert the parent's `status` array has only the one pre-existing `done` entry (no double-push). `fireTrackerSubscription`'s built-in same-stage guard handles this; the test verifies end-to-end.
- **No-op on already-`completed` close returns `tracker_fired: []`:** seed an already-`completed` workflow with a `parent_action_id` set. Call close. Assert the return is `{ action_ids: [], event_id: null, tracker_fired: [] }` AND no parent tracker write happened (the early-return at Task 2 bypasses the subscription).
- **`action_ids` order preserved:** if Task 4 swept three actions in a specific order, `action_ids` in the return matches that order. (Same posture as the swept set's order — Mongo `MongoDBFind` returns insertion-order on the in-memory fixture; production might reorder, but the contract is "the set of swept ids", not "any specific order".)
- **`event_id: null` literal:** assert the return always has `event_id: null`. v1 contract.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — modify — add `fireTrackerSubscription` import; add subscription call + final return; update Task 2's no-op branch to return `tracker_fired: []` instead of `null`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — modify — add seven tests above. Task 2's no-op tests already assert `tracker_fired: []`; no rewrite needed there.

## Notes

- Do NOT special-case `parent_action_id == null` in this handler — `fireTrackerSubscription` already returns `[]` when there's no parent ([`fireTrackerSubscription.js:49–50`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js)). Calling unconditionally keeps the handler's call site clean.
- The `depth: 0` parameter is the recursion-depth counter. Always start at 0 from a top-level handler call.
- `eventId: null` on the context (set in Task 1) flows through to the parent tracker's status entry — same posture as `CancelWorkflow.js`'s cancel-side. The design's "Returns" line says `event_id: null`; the parent tracker action's `status[0].event_id` is correspondingly `null`. If a follow-on adds close-side log events, the `event_id` flows naturally without changing this handler's structure.
- If a test fails because `tracker_fired` is `undefined`, check that the helper await is in place and that no early-return paths skip it.
