# Task 6: `dispatchNotifications.js`

## Context

The notifications module's [`send-notification` Api](../../../../../modules/notifications/api/send-notification.yaml) is an `InternalApi` whose routine is supplied by the consuming app via `_module.var: send_routine`. When apps wire the workflows module + notifications module together, the routine receives `event_ids` on its payload and resolves recipients by re-fetching the event doc.

Spec ([submit-pipeline/design.md § Side effects](../../../../workflows-module-concept/submit-pipeline/design.md)): *"that routine reads the event doc by id, resolves recipients (typically from `event.references` or the action's role declarations), and dispatches via whatever channels the app wires"*.

So the engine's dispatch is dead simple: call `send-notification` with `{ event_ids: [eventId] }` and nothing else. Apps that haven't wired a `send_routine` get a silent no-op because the notifications module's default `send_routine` is `[]`.

Per the design's [§ dispatchNotifications.js](../design.md#dispatchnotifications) sub-section, **do not** pad the payload with `references` or `metadata` "to help" — the routine re-fetches the event doc itself, and passing extras risks the routine drifting from the doc on disk.

## Task

### 1. Create `dispatchNotifications.js`

Create [plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js):

```js
/**
 * Dispatch a notification for the just-emitted log event.
 *
 * The consuming app's `send_routine` (notifications module var) re-fetches
 * the event doc to read references and metadata, so `event_ids` is the
 * only field on the payload. Adding extras risks the routine drifting
 * from the doc on disk.
 *
 * Silent no-op when the app hasn't wired a `send_routine` — the
 * notifications module ships an empty default routine.
 *
 * @param {object} context - handler context (must carry callApi, user)
 * @param {string} eventId - just-dispatched event's _id (= context.eventId)
 * @returns {Promise<void>}
 */
async function dispatchNotifications(context, eventId) {
  const result = await context.callApi(
    { id: 'send-notification', module: 'notifications' },
    { event_ids: [eventId] },
    { user: context.user },
  );

  if (!result.success) {
    const err = new Error(
      `dispatchNotifications: send-notification failed: ${result.error?.message ?? 'unknown'}`,
    );
    err.cause = result.error;
    err.step = 'dispatch-notifications';
    throw err;
  }
}

export default dispatchNotifications;
```

### 2. Colocated tests

Create [dispatchNotifications.test.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.test.js). Coverage:

- **Calls `context.callApi` with the right endpoint reference** — `{ id: 'send-notification', module: 'notifications' }`.
- **Passes `event_ids: [eventId]`** as the only field on the payload — assert no extra fields are present (`Object.keys(payload).length === 1`).
- **Inherits user via options** — `{ user: context.user }` passed as third arg.
- **Returns `undefined`** on success — the dispatcher is fire-and-go, no return value needed.
- **Throws with `step: 'dispatch-notifications'`** on `callApi` failure — same shape as the log-event dispatcher.

Use a hand-rolled Jest mock for `context.callApi`. No `mongodb-memory-server` needed.

## Acceptance Criteria

- `dispatchNotifications.js` exists with the function as default export.
- Test file colocated, all coverage points pass under `pnpm test`.
- Payload contains exactly `{ event_ids: [eventId] }` — verified by asserting `Object.keys(payload)` length and contents.
- Throws on failure with the right `step` marker.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.test.js` — create.

## Notes

- Don't try to detect the "unwired routine" case to skip the call — the `send-notification` Api itself handles that (its default routine is `[]`, which is a successful no-op invocation). The engine fires unconditionally; the app's side decides what to do with the call.
- Don't import the notifications module from JS — `context.callApi` resolves the Api by `{ id, module }` at runtime; no compile-time coupling to the notifications module.
- The function takes `eventId` as an explicit argument rather than reading `context.eventId` directly. Reason: the handler (task 7) calls `dispatchLogEvent` first, which returns the eventId — passing it through as a positional argument keeps the dispatcher's contract independent of what the log-event step did. Easier to reason about in tests, easier to reorder if the lifecycle ever needs it.
