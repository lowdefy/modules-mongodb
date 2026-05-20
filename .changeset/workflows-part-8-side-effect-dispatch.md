---
"@lowdefy/modules-mongodb-events": patch
"@lowdefy/modules-mongodb-plugins": patch
---

Workflows Part 8 — side-effect dispatch (log event + notifications).

- `modules-mongodb-events`: `new-event` API now honors a caller-supplied `_id` on the payload, with `_uuid: true` as the fallback. Backwards-compatible — existing callers that don't pass `_id` are unchanged.
- `modules-mongodb-plugins`: `SubmitWorkflowAction` now dispatches the default log event (events module `new-event`) and notification (notifications module `send-notification`) after writes succeed. Adds `app_name` to the `WorkflowAPI` connection schema (optional) — engine reads `connection.app_name` to key the default event's per-app `display` block. `event_id` on the success-path response equals the engine's `eventId` (one id per invocation, threaded through every action transition's `status[0].event_id`).
