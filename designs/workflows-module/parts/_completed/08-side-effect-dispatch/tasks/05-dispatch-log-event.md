# Task 5: `dispatchLogEvent(context, inputBag)` wrapper

## Context

[Task 4](./04-build-default-log-event-payload.md) lands `buildDefaultLogEventPayload` — a pure function that assembles the default log event's `{ type, display, references, metadata }` bag. This task adds the dispatcher that wraps it: calls the pure function, threads in `context.eventId` as the doc's `_id`, and fires `context.callApi` to invoke the events module's `new-event` Api.

Same file as task 4 (`dispatchLogEvent.js`) — two exports:

1. `buildDefaultLogEventPayload` (named, from task 4) — pure, no I/O.
2. `dispatchLogEvent` (default export) — wraps + dispatches; consumes handler context.

The dispatcher relies on three sibling changes:

- [Task 1](./01-new-event-id-passthrough.md) makes `new-event.yaml` accept caller-supplied `_id`. Without it, the inserted doc's `_id` would diverge from `context.eventId`.
- [Task 2](./02-workflow-api-schema-app-name.md) adds `app_name` to the connection schema so `context.connection.app_name` is reachable.
- [Task 4](./04-build-default-log-event-payload.md) supplies the payload-assembly function.

The dispatcher returns `context.eventId` directly — it does **not** consume `new-event`'s returned `eventId`. With task 1's `_if_none` fallback, the two are guaranteed equal, but the dispatcher avoids the round-trip dependency for clarity.

## Task

### 1. Add `dispatchLogEvent` to `dispatchLogEvent.js`

Append below the `buildDefaultLogEventPayload` export from task 4:

```js
/**
 * Dispatch the default log event for the just-completed submit.
 *
 * Builds the default payload via `buildDefaultLogEventPayload`, passes
 * `_id: context.eventId` so the event doc's `_id` matches every action's
 * `status[0].event_id` (engine spec § Client and transaction model:
 * "one id per invocation"). Fires `context.callApi` to the events module's
 * `new-event` Api.
 *
 * Returns `context.eventId` for the response payload — no round-trip
 * dependency on `new-event`'s return.
 *
 * @param {object} context - handler context (must carry workflow, action,
 *   actionConfig, user, eventId, connection, callApi)
 * @param {object} inputBag - log-event inputs captured at step 1 of handleSubmit:
 *   { interaction, current_key, status_before, status_after }
 * @returns {Promise<string>} eventId (= context.eventId)
 */
async function dispatchLogEvent(context, inputBag) {
  const payload = buildDefaultLogEventPayload({
    workflow: context.workflow,
    action: context.action,
    actionConfig: context.actionConfig,
    interaction: inputBag.interaction,
    current_key: inputBag.current_key,
    status_before: inputBag.status_before,
    status_after: inputBag.status_after,
    appName: context.connection?.app_name,
  });

  const result = await context.callApi(
    { id: 'new-event', module: 'events' },
    { _id: context.eventId, ...payload },
    { user: context.user },
  );

  if (!result.success) {
    const err = new Error(
      `dispatchLogEvent: new-event failed: ${result.error?.message ?? 'unknown'}`,
    );
    err.cause = result.error;
    err.step = 'dispatch-log-event';
    throw err;
  }

  return context.eventId;
}

export default dispatchLogEvent;
```

### 2. Extend `dispatchLogEvent.test.js`

Add a second `describe` block alongside the pure-function tests from task 4. Coverage:

- **Calls `context.callApi` with the right endpoint reference** — `{ id: 'new-event', module: 'events' }`.
- **Passes `_id: context.eventId`** on the payload alongside the assembled `type`/`display`/`references`/`metadata` bag.
- **Inherits user via options** — `{ user: context.user }` is passed as the third arg.
- **Reads `appName` from `context.connection.app_name`** — stub a context with `connection: { app_name: 'demo' }` and assert the produced `display` is keyed by `demo`.
- **Returns `context.eventId`** — not the value returned by `callApi` (use a stub that returns `{ success: true, response: { eventId: 'OTHER-ID' } }` and assert the dispatcher still returns `context.eventId`).
- **Throws on `callApi` failure** — stub returns `{ success: false, error: { message: 'boom' } }`; expect a thrown error with `step: 'dispatch-log-event'` and `cause` set.

Use a hand-rolled stub for `context.callApi` (a Jest mock). No `mongodb-memory-server` needed — the test asserts dispatch behaviour, not Mongo state.

## Acceptance Criteria

- `dispatchLogEvent` lands as the **default export** of `dispatchLogEvent.js` (the file now has one named + one default export).
- All test points pass under `pnpm test`.
- Calls `context.callApi` exactly once per invocation.
- Returns `context.eventId` even when `new-event`'s response carries a different `eventId` (it shouldn't with task 1, but the dispatcher is contract-clean independently).
- Throws (not returns null) on `callApi` failure — the handler's outer try/catch from [Part 6](../../_completed/06-submit-action-writes/design.md) catches it and writes an error transition. See [§ Open questions in design.md](../design.md#open-questions) ("Failure mode if `new-event` errors").

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js` — modify — append `dispatchLogEvent` function and default export.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.test.js` — modify — add the `describe` block for `dispatchLogEvent`.

## Notes

- Don't import or reference `context.params` — by the time the dispatcher runs (step 7 of `handleSubmit`), the relevant fields have already been captured into the `inputBag` at step 1 (per task 7). Reading from `context.params` here would risk drift if the params shape changes.
- The error path matches Part 6's existing convention: throw with `err.step` set so the handler's try/catch can attribute it correctly. See [handleSubmit.js:200-202](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) for the pattern.
- `context.callApi` returns `{ success, response, error? }` per [Part 1](../../01-call-api-primitive/design.md). Never throws — caller checks `success`. Don't await-throw; check `success` first.
- The `_object.assign` order in `new-event.yaml` ([line 11-25](../../../../../modules/events/api/new-event.yaml)) spreads `_payload: display` and `_payload: references` first, then sets `_id` (which now honors `_payload: _id`). So this dispatcher's payload — `{ _id, type, display, references, metadata }` — assembles cleanly without field collisions.
