# Part 08 — Side-effect dispatch (log event + notifications)

**Source rationale:** [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** engine handlers. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

## Goal

Wire the two always-on side effects into `SubmitWorkflowAction`: dispatch a log event via the events module and a notification via the notifications module. Both use `context.callApi` (from [part 1](../01-call-api-primitive/design.md)) and run after writes succeed. No author-controlled overrides yet — those merge in via [part 9 (hook-invocation)](../09-hook-invocation/design.md).

## In scope

### `dispatchLogEvent.js`

Builds the default log event:

- **Type**: `action-{interaction}` (e.g. `action-submit_edit`).
- **Display template**: `"{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}"`.
- **References**: `workflow_ids: [workflow_id]`, `action_ids: [action_id]`.
- **Metadata**: `action_type`, `workflow_type`, `interaction`, `current_key`, `status_before`, `status_after`.
- Fires `context.callApi({ id: 'new-event', module: 'events' }, ...)`. Captures `event_id` and threads it into the return payload.

### `dispatchNotifications.js`

Fires `context.callApi({ id: 'send-notification', module: 'notifications' }, ...)` with `{ event_ids: [event_id] }`. Silent no-op when the app hasn't wired a `send_routine` (notifications module already handles that).

### Lifecycle integration

Step 7 (log event) and step 8 (notifications) of `handleSubmit` now execute instead of no-op. Step 7 must complete before step 8 (notifications references the just-created event).

### Return payload

Populate `event_id` on the response. Hook payload assembled by [part 9](../09-hook-invocation/design.md) reads this same field on post-hook.

### Cancel-workflow event (deferred or scoped here)

Concept allows `CancelWorkflow` to emit a `workflow-cancelled` event via `context.callApi`. Ship inside this part if cheap; otherwise carve out as a v1.x follow-up.

## Out of scope / deferred

- **`event_overrides` from pre-hooks** → [part 9](../09-hook-invocation/design.md). M8 emits the unvarnished engine default.
- **`action.event[interaction]` YAML override layer** → [part 9](../09-hook-invocation/design.md). The three-layer merge (engine default < YAML < pre-hook override) lands together with hooks so the merge logic is implemented once.
- **Group `on_complete` fan-out** → [part 11](../11-group-on-complete-fanout/design.md).

## Depends on

[Part 1](../01-call-api-primitive/design.md), [part 6](../06-submit-action-writes/design.md). Part 7 not required (events fire regardless of group transitions).

The module manifest's `dependencies: [events, notifications]` declaration is part 20's job; this part just assumes those modules resolve.

## Verification

- Unit tests:
  - Log-event default payload shape matches the spec exactly.
  - Notification call goes through with the expected payload.
  - `event_id` propagates onto the return.
- Integration smoke against the worked-example:
  - Submitting `qualify` writes an event in `events` with the expected display, references, and metadata.
  - Notification routine receives a payload when wired; no error when unwired.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Failure mode if `new-event` errors.** Concept says engine surfaces it via the error transition; confirm that doesn't compound with hook-error semantics from part 9. Lean: log-event failure throws an engine error transition, but the action transition is already durable (matches "no transactional atomicity" risk).
- **Per-app `event_types` config var** — concept flags this as an open question (events module's `event_display` precedent). Defer.

## Contract to neighbours

- **Part 9** layers `event_overrides` (from YAML and pre-hook) onto the default payload this part emits. Make the default-payload assembly its own pure function so part 9 can call it before merging overrides.
- **Part 11** uses the same `context.callApi` pattern this part establishes for cross-module Api invocation.
