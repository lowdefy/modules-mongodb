# Implementation Tasks — Part 08: Side-effect dispatch (log event + notifications)

## Overview

Wire the two always-on side effects into `SubmitWorkflowAction`: an audit log event via the events module's `new-event` Api, and a notification dispatch via the notifications module's `send-notification` Api. Both go through [part 1](../../01-call-api-primitive/design.md)'s `context.callApi` primitive. The handler currently has step-7 and step-8 no-op markers ([handleSubmit.js:391-393](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) — this part replaces them with working bodies. Derived from `designs/workflows-module/parts/08-side-effect-dispatch/design.md`.

## Tasks

| #   | File                                    | Summary                                                                                                                                                                            | Depends On |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-new-event-id-passthrough.md`        | Extend `modules/events/api/new-event.yaml` to honor a caller-supplied `_id` on the payload (fall back to `_uuid: true`). Backwards-compatible.                                     | —          |
| 2   | `02-workflow-api-schema-app-name.md`    | Add `app_name` to the `WorkflowAPI` connection schema (`schema.js`); engine reads `context.connection.app_name`.                                                                   | —          |
| 3   | `03-derive-entity-ref-key.md`           | `utils/deriveEntityRefKey.js` — pure helper that turns `entity_collection` → `<entity>_ids` (strip `-collection`, kebab→snake, append `_ids`). Tested.                             | —          |
| 4   | `04-build-default-log-event-payload.md` | `dispatchLogEvent.js` — pure `buildDefaultLogEventPayload({...})` returning `{ type, display, references, metadata }`. Tested without I/O.                                         | 3          |
| 5   | `05-dispatch-log-event.md`              | Add `dispatchLogEvent(context, inputBag)` wrapper in the same file; calls `context.callApi('new-event', module: 'events')` with `_id: context.eventId`.                            | 1, 2, 4    |
| 6   | `06-dispatch-notifications.md`          | `dispatchNotifications.js` — `context.callApi('send-notification', module: 'notifications')` with `{ event_ids: [eventId] }`. Tested.                                              | —          |
| 7   | `07-handler-lifecycle-step-7-8.md`      | Wire step 7 + step 8 into `handleSubmit.js`: capture `status_before` + input bag at step 1; invoke `dispatchLogEvent` then `dispatchNotifications`; populate `event_id` on return. | 5, 6       |
| 8   | `08-event-id-round-trip-regression.md`  | Round-trip integration test: submit an action, read the inserted event doc back from Mongo, confirm `_id` matches every `action.status[0].event_id`.                               | 7          |
| 9   | `09-worked-example-fixture-smoke.md`    | Integration smoke against a fixture app that wires `workflows`/`events`/`notifications` inline; submit `qualify`, assert event + notification dispatch.                            | 7          |

## Ordering Rationale

**Three foundational tasks in parallel (1, 2, 3).** All sibling foundations with no interdependencies:

- Task 1 is a one-line YAML change in the events module. Existing app-level callers (e.g. `apps/demo`'s contact creation flows) keep working because the fallback is `_uuid: true`.
- Task 2 adds `app_name` to `WorkflowAPI`'s connection schema. Existing connection configs continue to validate because the field is optional in v1 — only the engine that consumes it (from task 5 onward) starts depending on it.
- Task 3 is a pure helper (~10 LOC) with table-driven tests. Drives the `<entity-ref-key>` line in `buildDefaultLogEventPayload`'s `references` shape.

**Pure payload assembly next (4).** `buildDefaultLogEventPayload` is the import seam for [part 9](../../09-hook-invocation/design.md) — it has to land as a pure, side-effect-free function with stable named-arg shape so part 9 can import it as the bottom layer of the three-layer `event_overrides` merge. Imports `deriveEntityRefKey` from task 3. Unit-tested in isolation (no Mongo, no `context.callApi`).

**Dispatcher wrapper (5).** `dispatchLogEvent` ties together tasks 1, 2, 4: it calls `buildDefaultLogEventPayload` to assemble the bag, passes `_id: context.eventId` into the payload (relying on task 1's `_if_none` fallback), and consumes `connection.app_name` (from task 2). Returns `context.eventId` as the response payload's `event_id`.

**Notifications in parallel (6).** `dispatchNotifications.js` only consumes the event id returned from task 5's dispatcher, which is `context.eventId` — known at handler entry. So task 6 has no real dependency on the dispatcher implementation; it only depends on `context.callApi` (part 1) and the call-site contract. Lands in parallel with tasks 4 + 5.

**Lifecycle wiring (7).** Replaces the step 7 + step 8 no-op markers in [handleSubmit.js:391-393](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) with working bodies. Captures the log-event input bag at step 1 (after validation resolves `context.action`/`workflow`/`targetStatus`, before step 4 mutates `context.workflowActions`). Pass it into `dispatchLogEvent`, then `dispatchNotifications`. Populate `event_id` on the success-path return.

**Integration coverage last (8, 9).** Two test layers post-wiring:

- Task 8 is the [review-1 finding #1](../review/review-1.md) regression: confirms the engine's one-id-per-invocation contract from [engine/spec.md:213](../../../../workflows-module-concept/engine/spec.md) survives the round-trip through `new-event` (the inserted event's `_id` must equal every action's `status[0].event_id`).
- Task 9 is the worked-example smoke: submit `qualify`, assert the event lands with the expected `type`/`display`/`references` shape and the notification routine fires when wired. Stands up the minimum module entries inline per the design's pre-Part-20 instructions.

**Parallelism:**

- Tasks 1, 2, 3, 6 can all run in parallel — no interdependencies.
- Task 4 needs task 3.
- Task 5 needs 1, 2, 4.
- Task 7 needs 5, 6.
- Tasks 8, 9 need 7 (can run in parallel after).

### Verification posture

Per the top-level [§ Testing conventions](../../../design.md#testing-conventions): unit tests via Jest (colocated `*.test.js`), handler-touching integration via `mongodb-memory-server` (shared `inMemoryMongo.js` helper from Part 6 task 1). End-to-end Playwright coverage of the `qualify` flow lands in [part 22](../../22-workflows-e2e-suite/design.md) via `side-effects.spec.js`.

## Scope

**Source:** `designs/workflows-module/parts/08-side-effect-dispatch/design.md`
**Context files considered:** none — Part 8's design is single-file. Cross-checked against `designs/workflows-module-concept/submit-pipeline/spec.md` § Default log event, `designs/workflows-module-concept/engine/spec.md` § eventId contract, `modules/events/api/new-event.yaml`, `modules/events/components/events-timeline.yaml`, `modules/notifications/api/send-notification.yaml`, and the live `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/{handleSubmit,SubmitWorkflowAction,utils}/*.js`.
**Review files skipped:** `review/review-1.md`.
