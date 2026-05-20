# Task 7: Replace `SubmitWorkflowAction.js` stub + land the 11-step `handleSubmit.js` scaffold

## Context

`SubmitWorkflowAction.js` is currently a stub that throws `WorkflowAPINotImplemented`:

```js
async function SubmitWorkflowAction() {
  const err = new Error('not implemented: SubmitWorkflowAction');
  err.code = 'WorkflowAPINotImplemented';
  err.handler = 'SubmitWorkflowAction';
  throw err;
}
SubmitWorkflowAction.schema = {};
SubmitWorkflowAction.meta = { checkRead: false, checkWrite: false };
export default SubmitWorkflowAction;
```

This task replaces it with a working entry that builds the engine `context`, delegates to `handleSubmit.js` (the orchestrator), and flips `meta.checkWrite: true`. It also lands the 11-step scaffold in `handleSubmit.js` per the design's [Lifecycle scaffold](../design.md#lifecycle-scaffold):

> Full 11-step skeleton in `handleSubmit.js`; only steps 1, 3 (auto-unblocks for action types only — group ids defer to part 7), 4, 5, 6 execute. Other steps no-op with TODO comments pointing at their part.

Tasks 8–13 then fill in the real bodies of steps 1, 3, 4, 5, 6 and the mid-write error wrapper. This task lands the scaffold so subsequent tasks have a place to drop their step bodies.

V0 reference: `dist/workflows-module/old/WorkflowAPI/UpdateWorkflowActions/UpdateWorkflowActions.js` shows the wrapper-around-handler shape (build `context` from `lowdefyContext`, delegate to `handleUpdateActions(context)`, return). The new entry mirrors that.

Compare with the shipped `StartWorkflow.js` ([`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js)) — it builds `context` inline rather than delegating to a separate `handleStart.js`. The submit lifecycle is too large for that posture; the `handleSubmit.js` split is what the design commits.

## Task

### 1. Replace `SubmitWorkflowAction.js`

File: `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js`.

```js
import { randomUUID } from 'node:crypto';

import createMongoDBConnection from '../../shared/createMongoDBConnection.js';
import handleSubmit from './handleSubmit.js';

async function SubmitWorkflowAction(lowdefyContext) {
  const { request: payload = {}, connection } = lowdefyContext;
  const context = {
    mongoDBConnection: createMongoDBConnection(lowdefyContext),
    workflowsConfig: connection.workflowsConfig,
    actionsEnum: connection.actionsEnum,
    changeStamp: connection.changeStamp,
    params: payload,
    eventId: randomUUID(),
  };
  return handleSubmit(context);
}

SubmitWorkflowAction.schema = {};
SubmitWorkflowAction.meta = {
  checkRead: false,
  checkWrite: true,
};

export default SubmitWorkflowAction;
```

Key shape:

- `context.params` is the **per-endpoint payload** (`action_id`, `interaction`, `current_key`, `form`, `form_review`, `fields`, `current_status`, `hooks`, `event_overrides`) — see [design.md § Payload](../design.md#payload).
- `context.eventId` is generated here on entry. Threaded into every status push during the call so all writes in this invocation share one event id (per [engine/spec.md § SubmitWorkflowAction payload](../../../../workflows-module-concept/engine/spec.md#submitworkflowaction-payload) and the worked example).
- `meta.checkWrite: true` — flipping this from `false` (the stub posture) lets the framework's permission check fire. Matches what part 5 did for `StartWorkflow` and `CancelWorkflow` once their bodies landed.

### 2. Create `handleSubmit.js` — 11-step scaffold

File: `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`.

```js
/**
 * Orchestrate the SubmitWorkflowAction lifecycle.
 *
 * 11 steps per submit-pipeline/spec.md § Flow. Only steps 1, 3, 4, 5, 6
 * have working bodies in part 6. Steps 2, 7, 8, 9, 10, 11 are no-op stubs
 * with TODO markers pointing at the parts that light them up.
 *
 * @param {Object} context
 * @returns {Promise<{
 *   action_ids: string[],
 *   completed_groups: Array,
 *   event_id: string | null,
 *   tracker_fired: any | null,
 *   pre_hook_response: any | null,
 *   post_hook_response: any | null,
 * }>}
 */
async function handleSubmit(context) {
  // Step 1 — Validate + translate per-endpoint payload to internal shape.
  // TODO(task 08): build { currentActionId, actions[], eventId } here; throw on
  // pre-lookup failures; cache fetched workflow + action for downstream steps.
  const internal = {
    currentActionId: null,
    actions: [],
    eventId: context.eventId,
  };

  // Step 2 — Pre-hook. → part 9.

  // Step 3 — Compute auto-unblocks (action-type entries only; group ids → part 7).
  // TODO(task 09): call computeAutoUnblocks(...), append entries to internal.actions.

  // Step 4 — Write action transitions (per-entry loop with priority rule).
  // TODO(task 10): iterate internal.actions, call updateAction per entry.
  // Track action ids that wrote (for the return shape).
  const actionIds = [];

  // Step 5 — Recompute workflow summary (counts only; groups[] → part 7).
  // TODO(task 11): load workflow actions, recompute summary, $set on workflow doc.

  // Step 6 — Write form_data (merge form + form_review, $set per-field).
  // TODO(task 12): merge form + form_review, build dot-notation $set keys,
  // execute against workflows collection.

  // Step 7 — Generate log event. → part 8.

  // Step 8 — Dispatch notifications. → part 8.

  // Step 9 — Group on_complete fan-out. → part 11.

  // Step 10 — Tracker subscription. → part 10.

  // Step 11 — Post-hook. → part 9.

  return {
    action_ids: actionIds,
    completed_groups: [], // PART 7: swap for [{ workflow_id, id, on_complete? }] entries.
    event_id: null,
    tracker_fired: null,
    pre_hook_response: null,
    post_hook_response: null,
  };
}

export default handleSubmit;
```

Key shape:

- All 11 steps present as comment markers. Tasks 8–13 replace the TODO lines with real bodies.
- The return shape is final per [design.md § Lifecycle scaffold](../design.md#lifecycle-scaffold). `event_id`, `tracker_fired`, `pre_hook_response`, `post_hook_response` stay `null` in v1 of part 6; parts 8, 10, 9 populate them later.
- `completed_groups: []` is a literal placeholder per part 6 review-1 #8; part 7 swaps it for the real entries.
- The function compiles and runs end-to-end today (no-op writes, empty action_ids). A unit test in this task can call `handleSubmit` against an empty action set and assert the return shape.

### 3. Smoke test against the existing scaffold

A minimal unit test exercising the scaffold:

```js
// plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js
import handleSubmit from './handleSubmit.js';

test('handleSubmit: returns the v1 return shape with empty action_ids', async () => {
  const result = await handleSubmit({
    mongoDBConnection: () => ({}),
    actionsEnum: {},
    workflowsConfig: [],
    changeStamp: { timestamp: new Date(), user: { id: 'u1', name: 'User' } },
    params: {},
    eventId: 'event-1',
  });
  expect(result).toEqual({
    action_ids: [],
    completed_groups: [],
    event_id: null,
    tracker_fired: null,
    pre_hook_response: null,
    post_hook_response: null,
  });
});
```

That test grows as tasks 8–13 land — each subsequent task replaces the `.toEqual` with richer assertions.

## Acceptance Criteria

- `SubmitWorkflowAction.js` no longer throws `WorkflowAPINotImplemented`.
- `SubmitWorkflowAction.js` builds `context` with the seven expected keys (`mongoDBConnection`, `workflowsConfig`, `actionsEnum`, `changeStamp`, `params`, `eventId`), delegates to `handleSubmit`, returns its result.
- `meta.checkWrite` is `true`.
- `handleSubmit.js` exists with all 11 lifecycle steps as comment markers and TODO references to the right tasks/parts.
- `handleSubmit.js` returns the canonical v1 return shape (six keys, four nulls, two empty arrays).
- The smoke test passes against the no-op scaffold.
- Plugin builds cleanly.
- The `eventId` generated in `SubmitWorkflowAction.js` is a fresh UUID per invocation (verifiable by reading the source — two consecutive calls produce two different ids).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js` — modify — replace stub with the wrapper around `handleSubmit`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — create — 11-step scaffold returning the canonical v1 shape.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — create — smoke test for the return-shape skeleton.

## Notes

- **Numbering note.** Lifecycle numbering follows [submit-pipeline/spec.md § Flow](../../../../workflows-module-concept/submit-pipeline/spec.md#flow), not the [engine/spec.md § Ordering inside one SubmitWorkflowAction invocation](../../../../workflows-module-concept/engine/spec.md#ordering-inside-one-submitworkflowaction-invocation) numbering (which is a different write-ordering view of the same flow). Keep the step numbers in `handleSubmit.js` matching the design's bullet list.
- **`actionsConfig` lookup.** v0's `handleUpdateActions.js` looks up `context.actionsConfig = context.workflowsConfig.find((w) => w.type === currentAction.workflow_type)?.actions` once it has the current action. The same pattern lands in step 1 (task 8) — not here. This task ships the scaffold; the workflow-type lookup is part of step 1's validation.
- **Why `eventId` lives in `context`, not `params`.** It's generated server-side on entry, not supplied by the caller. Putting it on `context` (rather than mutating `context.params`) keeps the per-endpoint payload clean and reflects that the event id is engine state, not user input.
