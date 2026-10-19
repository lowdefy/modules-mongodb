# Part 08 — Side-effect dispatch (log event + notifications)

**Source rationale:** [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** engine handlers. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

## Goal

Wire the two always-on side effects into `SubmitWorkflowAction`: dispatch a log event via the events module and a notification via the notifications module. Both use `context.callApi` (from [part 1](../01-call-api-primitive/design.md)) and run after writes succeed. No author-controlled overrides yet — those merge in via [part 9 (hook-invocation)](../09-hook-invocation/design.md).

## In scope

### `dispatchLogEvent.js`

Split into two exports so part 9 can compose the default payload without dispatching.

**`buildDefaultLogEventPayload({ workflow, action, actionConfig, interaction, current_key, status_before, status_after, user, eventId, appName })`** — pure function. No `context`, no I/O. Returns `{ type, display, references, metadata }`:

- **Type**: `action-{interaction}` (e.g. `action-submit_edit`).
- **Display**: per-`app_name` map `{ [appName]: { title: <nunjucks-template-string> } }` where the template is `"{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}"`. Mirrors the events module's per-`display_key` keying (see [modules/events/components/events-timeline.yaml:34-50](../../../../modules/events/components/events-timeline.yaml) — the timeline's `$addFields` projects `$<display_key>.title`). Consuming apps wire `app_name` such that `events.display_key === workflows.app_name`.
- **References**: `workflow_ids: [workflow_id]`, `action_ids: [action_id]`, and `<entity-ref-key>: [workflow.entity_id]` so the event surfaces on the entity page's timeline (which queries by `<entity>_ids` per [apps/demo/.claude/guides/events.md](../../../../apps/demo/.claude/guides/events.md)). The entity ref key derives from `workflow.entity_collection`: strip a trailing `-collection` if present, replace remaining `-` with `_`, append `_ids`. So `leads-collection → leads_ids`, `tickets-collection → tickets_ids`, `user-contacts → user_contacts_ids`. Pin this derivation in `buildDefaultLogEventPayload` as a small helper; export for unit testing.
- **Metadata**: `action_type`, `workflow_type`, `interaction`, `current_key`, `status_before`, `status_after`.

`status_before` is captured at handler entry as `context.action.status?.[0]?.stage` before step 4 mutates the in-memory `context.workflowActions` cache. `status_after` is the engine-resolved `targetStatus` for the user-submitted action (already computed at step 1 in [handleSubmit.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)). `appName` is read from `connection.app_name` — see § `app_name` plumbing below.

### `app_name` plumbing (WorkflowAPI connection schema)

[Part 20](../20-module-manifest/design.md) already declares `app_name: string (required)` as a workflows module manifest var. Part 8's job is to plumb it down to `WorkflowAPI.connection.app_name` so the engine reads `context.connection.app_name` at handler entry. Concretely: add an `app_name` field to the WorkflowAPI connection schema ([schema.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js)) as a sibling edit here, and reference `_module.var: app_name` from `connections/workflow-api.yaml` when [Part 20](../20-module-manifest/design.md) wires the connection file.

Consuming apps already set `app_name` once on the workflows module entry (typically from `app_config.yaml`'s `app_name`), matching how they wire `events.display_key` and `notifications.app_name` — see [docs/idioms.md#app-name](../../../../docs/idioms.md).

**Required-ness:** the connection-schema field stays optional (no entry on `schema.js`'s `required` array) so fixture-app tests can spin up a `WorkflowAPI` connection without setting `app_name`. The handler defends at runtime: `buildDefaultLogEventPayload` **throws** if `appName` is missing or empty. No silent default — events keyed by a fallback like `'default'` would render blank on any app whose `display_key` differs, and the bug would only surface when someone notices an entity timeline missing entries.

**`dispatchLogEvent(context, inputBag)`** — wraps the pure function, fires `context.callApi({ id: 'new-event', module: 'events' }, payload, { user })`. Passes `_id: context.eventId` on the payload so the event doc's `_id` equals the engine-generated id that step 4 already stamped on every `action.status[].event_id` (per [engine/spec.md:213](../../../workflows-module-concept/engine/spec.md): "one id per invocation, threaded through every write"). Returns `context.eventId` for the response payload — no round-trip dependency on `new-event`'s return.

### `new-event.yaml` extension (events module)

Extend [modules/events/api/new-event.yaml](../../../../modules/events/api/new-event.yaml) to honor a caller-supplied `_id` on the payload, falling back to `_uuid: true` when absent. Existing app-level callers that don't pass `_id` keep working unchanged; the workflows engine relies on the override to preserve the one-id-per-invocation guarantee. Single-line YAML change in the `MongoDBInsertOne` `doc` assembly:

```yaml
_id:
  _if_none:
    - _payload: _id
    - _uuid: true
```

### `dispatchNotifications.js`

Fires `context.callApi({ id: 'send-notification', module: 'notifications' }, ...)` with `{ event_ids: [event_id] }` and nothing else — the `send_routine` re-fetches the event doc to read `references` and `metadata`, so adding fields here is redundant and risks the routine drifting from the doc on disk. Silent no-op when the app hasn't wired a `send_routine` (notifications module already handles that).

### Lifecycle integration

Step 7 (log event) and step 8 (notifications) of `handleSubmit` now execute instead of no-op. Step 7 must complete before step 8 (notifications references the just-created event).

Capture the log-event input bag at step 1 (after the validation block resolves `context.action`, `context.workflow`, `targetStatus`), before step 4 mutates `context.workflowActions` in-memory. Pass the captured bag into `dispatchLogEvent` at step 7.

### Return payload

Populate `event_id` on the response. Hook payload assembled by [part 9](../09-hook-invocation/design.md) reads this same field on post-hook.

## Out of scope / deferred

- **`CancelWorkflow` event emission** — out of scope here. The concept is silent on whether `CancelWorkflow` emits a `workflow-cancelled` event; Part 8 lives under `SubmitWorkflowAction/` and `CancelWorkflow` lives in a sibling directory. If apps want a cancel-side event, raise it against the concept (likely as a follow-on part touching [CancelWorkflow.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) and the concept spec together).
- **Error-path log events.** Part 8 does **not** fire a log event for error transitions written by Part 6's catch block (steps 4-6 failures). The action's `status` array already carries `reason`, `error_message`, `error_metadata` ([handleSubmit.js:292-297](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) — durable audit trail without a second event. Revisit once [part 9](../09-hook-invocation/design.md) designs `hook_error` (pre-hook abort) emission, so both error paths get the same treatment.
- **`event_overrides` from pre-hooks** → [part 9](../09-hook-invocation/design.md). M8 emits the unvarnished engine default.
- **`action.event[interaction]` YAML override layer** → [part 9](../09-hook-invocation/design.md). The three-layer merge (engine default < YAML < pre-hook override) lands together with hooks so the merge logic is implemented once.
- **Group `on_complete` fan-out** → [part 11](../11-group-on-complete-fanout/design.md).

## Depends on

[Part 1](../01-call-api-primitive/design.md), [part 6](../06-submit-action-writes/design.md). Part 7 not required (events fire regardless of group transitions).

The module manifest's `dependencies: [events, notifications]` declaration is part 20's job; this part just assumes those modules resolve.

## Verification

- Unit tests on `buildDefaultLogEventPayload` (pure function, no Mongo, no callApi):
  - `type` is `action-{interaction}` for each of the five interactions.
  - `display` shape matches finding #2's resolution.
  - `references` shape matches finding #5's resolution.
  - `metadata` carries the six committed fields with `status_before` reflecting the pre-step-4 stage.
- Unit tests on `dispatchLogEvent` (handler-level, in-memory Mongo + stubbed `context.callApi`):
  - Notification call goes through with the expected payload.
  - `event_id` propagates onto the return.
- Regression test for finding #1: submitting an action and reading the inserted event doc back from Mongo confirms its `_id` equals every written action's `status[0].event_id` — proving the one-id-per-invocation contract from [engine/spec.md:213](../../../workflows-module-concept/engine/spec.md) survives the round-trip through `new-event`.
- Integration smoke against the worked-example:
  - Submitting `qualify` writes an event in `events` with the expected display, references, and metadata.
  - Notification routine receives a payload when wired; no error when unwired.
  - Runs against a **fixture app** wiring `workflows`, `events`, `notifications` together; before [part 20](../20-module-manifest/design.md) lands the fixture stands up the minimum module entries inline in the test file (worked-example wiring per [workflows-module-concept/design.md § Worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs)). After part 20, the smoke target shifts to `apps/demo`.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Step 7 / step 8 failure mode

Side-effect failures (log event, notifications) throw past `handleSubmit` to the `@lowdefy/api` request layer. They are **not** wrapped in the mid-write try/catch that Part 6's catch block scopes to steps 4-6. Reasons:

- The Part 6 catch exists to put the action into a defined state when a write step leaves it half-done. Steps 7-8 run **after** all writes are durable — there's no inconsistent action state to defend against. Writing an additional `error` status entry on top of the just-written success transition would corrupt the action's history.
- A surfaced exception with a stack trace is more useful to the developer integrating workflows into a new app than a `200 OK` with a silent `error_transition` field.
- Matches the dispatcher contract: `dispatchLogEvent` and `dispatchNotifications` both throw on `callApi` failure with `step` markers (`dispatch-log-event` / `dispatch-notifications`) the request layer can attribute.

The writes from steps 4-6 stay durable — the action's `status[0]` reflects the resolved target stage; only the audit event / notification side effect is missing. Apps that need a second-chance backfill can re-call `update-action-{action_type}` with the same `interaction` payload; the priority rule's same-stage self-exception (Part 6) writes a fresh `status` entry with a fresh `event_id`.

## Open questions

- **Per-app `event_types` config var** — concept flags this as an open question (events module's `event_display` precedent). Defer.

## Contract to neighbours

- **Part 9** layers `event_overrides` (from YAML and pre-hook) onto the default payload this part emits. `buildDefaultLogEventPayload` (above) is the import seam — part 9 calls it, then merges `event_overrides[interaction]` from the endpoint config, then the pre-hook return's unkeyed `event_overrides`, on top in that order. The function returns the unkeyed `{ type, display, references, metadata }` shape (matching the unkeyed runtime bag, not the keyed YAML override map).
- **Part 11** uses the same `context.callApi` pattern this part establishes for cross-module Api invocation.
