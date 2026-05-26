# Part 11 — Group `on_complete` fan-out

**Source rationale:** [workflows-module-concept/action-groups/spec.md](../../../workflows-module-concept/action-groups/spec.md), [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** engine handlers. **Size:** S. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

## Goal

When a group transitions to `done` inside `SubmitWorkflowAction`, fire the group's declared `on_complete` Api via `context.callApi`. Fires at most once per group per workflow lifetime (groups never leave `done`). Not fired on `CancelWorkflow`.

## In scope

### `fireGroupOnComplete.js`

- Reads `completed_groups` from [part 7](../07-group-state-machine/design.md)'s return. Each entry's `on_complete` field is the raw `{ routine: [...] }` object from `workflowConfig.action_groups[].on_complete` (or `null`) — see [handleSubmit.js:336](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) and [makeWorkflowsConfig.js:106–126](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js) which enforces that shape. The field is used as a fire/skip signal only — the actual call targets the resolver-emitted Api id below, not the inline routine.
- For each entry whose `on_complete` is truthy:
  - **Api id.** Synthesize `workflow-{workflow_type}-group-{group_id}-on-complete` to match [part 13 § Hook emission](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md)'s deterministic naming. `workflow_type` is read from `context.workflow.workflow_type`; `group_id` is the entry's `id`. The handler hard-codes the template; the [Verification](#verification) unit test pins it so a divergence in part 13 fails loudly. (Same posture as [dispatchLogEvent.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js)'s hard-coded `new-event` target.)
  - **Invocation.** `context.callApi({ id: <derived-id>, module: 'workflows' }, payload, { user: context.user })`. The Api is module-scoped (emitted by `makeWorkflowApis` under the workflows module entry — [part 13](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md)), so the `{ id, module }` form is required; a bare string would silently dispatch into the consuming app's own-Api namespace. Matches the call shape established in [dispatchNotifications.js:17–21](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js).
  - **Payload shape** (committed here for the v1 contract; refinement deferred to a follow-up `api-hooks` sub-design per concept):
    - `workflow_id` — `context.workflow._id`.
    - `workflow_type` — `context.workflow.workflow_type`.
    - `group_id` — the entry's `id`.
    - `group_title` — `workflowConfig.action_groups[].title` indexed by `group_id` (required; part 4 validates non-empty).
    - `user: context.user` — explicit on the payload (mirrors [part 9](../09-hook-invocation/design.md)'s pre/post hook payload contract). The third-arg `{ user }` is the `callApi` auth context for the target Api; it doesn't auto-inject `user` into the payload, so the field is set explicitly.
    - `event_id` — `context.eventId` (the same id threaded through every write in this submit; equals the just-dispatched log event's `_id` per [part 8](../_completed/08-side-effect-dispatch/design.md)). The hook chains its own event with `references` pointing at this id.
- **Error policy.** Wrap each `callApi` invocation in a local try/catch. On failure, log with `{ workflow_id, group_id, on_complete_api_id, error }` and continue with the next entry — exceptions never escape `fireGroupOnComplete.js`. Match `dispatchNotifications.js`'s `result.success` check shape but invert the policy: on `result.success === false`, log instead of throw.

  This **diverges from [part 8's posture](../_completed/08-side-effect-dispatch/design.md)** for log-event and notification dispatch, which throw past `handleSubmit` to the request layer (their narrow try/catch at [handleSubmit.js:337,345](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) just stamps `err.step` and re-throws). The divergence is deliberate: log-event and notifications are engine-owned dispatch where a failure is a config or infrastructure bug we want surfaced. `on_complete` runs arbitrary author code; an author bug shouldn't return a 500 to a submitter whose action transitioned cleanly. The trade-off accepted here — caller has no signal that an `on_complete` hook didn't fire — is the v1 risk the concept already names ("if engine retries after group completion but before hook fire, hook may be missed entirely"), mitigated by idempotent hooks + periodic reconciliation (see "Out of scope / deferred" below).
- Returns nothing — fan-out runs after all writes are durable.

### Lifecycle integration

Step 9 in `handleSubmit` now executes (previously no-op'd in [part 6](../06-submit-action-writes/design.md)). Runs after step 7 (log event) and step 8 (notifications) but before step 10 (tracker subscription). The ordering is fixed by [submit-pipeline/spec.md § Flow](../../../workflows-module-concept/submit-pipeline/spec.md) and [part 10's "Contract to neighbours"](../10-tracker-subscription/design.md) — post-hook (step 11) reads `tracker_fired` from `result`, so tracker must run before post-hook; fan-out runs as part of the "this workflow's owned side effects" cluster (log event → notifications → group fan-out) before propagation moves up the parent chain.

### Cancellation exclusion

`CancelWorkflow` ([part 5](../05-start-cancel-handlers/design.md)) flips actions to `not-required`, which means groups land at `done` — but per concept, `on_complete` does **not** fire on cancel. Implementation: `CancelWorkflow`'s return shape ([CancelWorkflow.js:132](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) — committed in [part 7 § CancelWorkflow integration](../_completed/07-group-state-machine/design.md)) omits the `completed_groups` key entirely; only the submit path emits the fan-out.

### Idempotency

Group status is one-way (`blocked → in-progress → done`, no transitions back), so any given group only ever appears once in `completed_groups` across the workflow's lifetime — fan-out fires at most once per group naturally. Retry of an idempotent `SubmitWorkflowAction` call produces `completed_groups: []` (the group was already `done`), so no double-fire.

## Out of scope / deferred

- **Hook payload refinement** — concept defers to a follow-up `api-hooks` sub-design. v1 ships the minimal payload above; expand additively.
- **Retry semantics on hook failure** — concept acknowledges as a v1 risk ("if engine retries after group completion but before hook fire, hook may be missed entirely"). Mitigation in v1: idempotent hooks + periodic reconciliation (app-side catch-all).
- **Order-of-firing** when multiple groups complete in one submit — fire in `completed_groups` array order (which is workflow's `action_groups[]` declaration order from part 7).

## Depends on

[Part 1](../_completed/01-call-api-primitive/design.md), [part 7](../_completed/07-group-state-machine/design.md), [part 9](../09-hook-invocation/design.md) (same `context.callApi` invocation pattern).

## Verification

- Unit tests:
  - **Api id template pinned.** Given a fixture `action_groups: [{ id: 'phase-1', title: 'Discovery', on_complete: { routine: [...] } }]` on `workflow_type: onboarding`, a submit that completes phase-1 fires `context.callApi({ id: 'workflow-onboarding-group-phase-1-on-complete', module: 'workflows' }, ...)`. Locks the template against silent drift from [part 13](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md).
  - **Payload contract.** The same fixture asserts the payload carries `workflow_id`, `workflow_type`, `group_id`, `group_title`, `user`, and `event_id` (= `context.eventId`).
  - Entries with `on_complete: null` produce no call.
  - Hook errors are logged but the submit returns successfully.
  - `CancelWorkflow` doesn't fan out any hooks.
- Integration test against a fixture workflow with multiple groups all completing in one submit: fan-out fires in declaration order.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

None.

## Contract to neighbours

- **Part 7** surfaces `completed_groups`; this part consumes it.
- **Part 13** emits the `on_complete` Api at build time and synthesizes `auth.roles` from the union of the group's actions' `access.roles` ([part 13 § Auth by construction](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md)). The hook-auth gate holds by construction; no validation pass needed in this part.
