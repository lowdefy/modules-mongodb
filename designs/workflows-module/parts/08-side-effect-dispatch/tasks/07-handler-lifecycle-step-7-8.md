# Task 7: Wire steps 7 + 8 into `handleSubmit`

## Context

Part 6 left step 7 (log event) and step 8 (notifications) as no-op markers ([handleSubmit.js:391-393](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)):

```js
// Step 7 — Generate log event. → part 8.

// Step 8 — Dispatch notifications. → part 8.
```

This task replaces those markers with the working bodies, captures the log-event input bag at step 1 (per the design's lifecycle integration note), and populates `event_id` on the success-path return (currently `null` at [handleSubmit.js:404](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)).

The input bag has to be captured at step 1 because `status_before` is read from `context.action.status[0].stage` **before** step 4 mutates `context.workflowActions` in-memory ([handleSubmit.js:209-216](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)). Capturing after step 4 would read the post-write stage, not the pre-write one.

`context.connection` is not currently on the handler context — `SubmitWorkflowAction.js` builds `context` at [line 8-16](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js) without it. This task extends the context-build so `connection` is available for `dispatchLogEvent` to read `app_name` from.

## Task

### 1. Extend the context-build in `SubmitWorkflowAction.js`

Edit [plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js). Add the Lowdefy callApi handle and the connection config to the context bag:

```js
async function SubmitWorkflowAction(lowdefyContext) {
  const { request: payload = {}, connection, user, callApi } = lowdefyContext;
  const context = {
    mongoDBConnection: createMongoDBConnection(lowdefyContext),
    workflowsConfig: connection.workflowsConfig,
    actionsEnum: connection.actionsEnum,
    changeStamp: connection.changeStamp,
    connection, // for app_name access from dispatchLogEvent
    params: payload,
    user,
    callApi,    // forwarded to dispatchers
    eventId: randomUUID(),
  };
  return handleSubmit(context);
}
```

Notes:

- `lowdefyContext.callApi` is the [Part 1](../../01-call-api-primitive/design.md) primitive, exposed on every plugin handler's input. Plumb it onto our internal `context` bag so `dispatchLogEvent`/`dispatchNotifications` can use it.
- Don't pre-extract `connection.app_name` — keep the full `connection` object on context for forward-compat (other future handlers may want other connection fields).

### 2. Capture the log-event input bag at step 1

Edit [handleSubmit.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js). After the existing validation block and after `targetStatus` is computed (around line 132-136), but **before** the `internal` object is constructed, capture the input bag:

```js
const targetStatus = resolveTargetStatus({
  interaction: params.interaction,
  actionConfig,
  params,
});

// Capture log-event inputs before step 4 mutates context.workflowActions
// in-memory. status_before reads from the pre-write stage; status_after is
// the engine-resolved target. → part 8 dispatchLogEvent.
const logEventInputBag = {
  interaction: params.interaction,
  current_key: params.current_key ?? null,
  status_before: context.action.status?.[0]?.stage ?? null,
  status_after: targetStatus,
};
```

Pass nothing more — the dispatcher pulls everything else (`workflow`, `action`, `actionConfig`, `user`, `eventId`, `connection.app_name`) from `context` directly.

### 3. Wire step 7 in `handleSubmit.js`

Replace the marker comment at line 391:

```js
// Step 7 — Generate log event. → part 8.
```

with:

```js
// Step 7 — Generate log event.
let eventId;
try {
  eventId = await dispatchLogEvent(context, logEventInputBag);
} catch (err) {
  err.step = err.step ?? 'dispatch-log-event';
  throw err;
}
```

Hoist `eventId` declaration so step 8 can read it.

### 4. Wire step 8 in `handleSubmit.js`

Replace the marker comment at line 393:

```js
// Step 8 — Dispatch notifications. → part 8.
```

with:

```js
// Step 8 — Dispatch notifications.
try {
  await dispatchNotifications(context, eventId);
} catch (err) {
  err.step = err.step ?? 'dispatch-notifications';
  throw err;
}
```

### 5. Populate `event_id` on the success-path return

At the bottom of `handleSubmit.js` (currently line 401-407), replace `event_id: null` with `event_id: eventId`:

```js
return {
  action_ids: actionIds,
  completed_groups: completedGroups,
  event_id: eventId,
  tracker_fired: null,
  pre_hook_response: null,
  post_hook_response: null,
};
```

Leave the error-path return ([handleSubmit.js:380-388](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) with `event_id: null` — error transitions don't emit log events per the design's [§ Open questions](../design.md#open-questions).

### 6. Add the imports at the top of `handleSubmit.js`

```js
import dispatchLogEvent from './dispatchLogEvent.js';
import dispatchNotifications from './dispatchNotifications.js';
```

### 7. Update existing tests

[handleSubmit.test.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js) needs `context.callApi` on the test context now. Add a default Jest mock that returns `{ success: true, response: {} }` so existing assertions on writes still work. Tests that previously asserted `event_id: null` on the success return need updating to assert `event_id === context.eventId` (which the test sets up).

## Acceptance Criteria

- `pnpm test` passes — all of Part 6's existing `handleSubmit.test.js` cases still green, with the `event_id` field now populated.
- Step 7 fires `dispatchLogEvent` exactly once per successful submit; step 8 fires `dispatchNotifications` exactly once.
- A failing `new-event` call (mock `context.callApi` to return `{ success: false }`) bubbles up through `handleSubmit` and is **not** swallowed silently. The handler's outer mid-write try/catch from Part 6 does **not** wrap steps 7-8 (the catch ends at line 264 before step 7); a step 7 failure throws to the request layer. This is consistent with the design's open question on log-event failure mode.
- `status_before` reflects the pre-step-4 stage. Add a test case that asserts: an action submitted from `action-required` lands an event whose `metadata.status_before === 'action-required'`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js` — modify — add `connection` and `callApi` to the context bag.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — add imports, capture input bag at step 1, wire step 7 + step 8 bodies, populate `event_id` on success return.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — stub `callApi` on test context, update event_id assertions.

## Notes

- Don't put step 7 + 8 inside Part 6's existing mid-write try/catch (the `try` opens at line 168 and ends at line 264). The catch is scoped to "write transitions / summary / form_data failures land an `error` transition." Side-effect failures (log event, notifications) have different semantics — see [§ Open questions in design.md](../design.md#open-questions). Wrap step 7 + 8 in their own try/catch blocks that re-throw with the right `step` marker.
- Don't extract a helper for "step 7 then step 8" — they're two lines. The lifecycle scaffold's expressiveness comes from having each step visible at the top level of `handleSubmit`.
- The Part 6 handler's [handleSubmit.test.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js) lands its own `inMemoryMongo` setup but doesn't need a real Lowdefy app context — `context.callApi` is just a function passed through, easy to mock.
- After this task, the `handleSubmit` return signature's `event_id` field can no longer be `null` on success. Update the JSDoc typedef accordingly (`event_id: string | null` → still nullable to cover the error path, but document that success returns a string).
