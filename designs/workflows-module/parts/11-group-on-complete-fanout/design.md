# Part 11 — Group `on_complete` fan-out

**Source rationale:** [workflows-module-concept/action-groups/spec.md](../../../workflows-module-concept/action-groups/spec.md), [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** engine handlers. **Size:** S. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

## Goal

When a group transitions to `done` inside `SubmitWorkflowAction`, fire the group's declared `on_complete` Api via `context.callApi`. Fires at most once per group per workflow lifetime (groups never leave `done`). Not fired on `CancelWorkflow`.

## In scope

### `fireGroupOnComplete.js`

- Reads `completed_groups` from [part 7](../07-group-state-machine/design.md)'s return.
- For each entry with a non-null `on_complete` Api id:
  - Invokes `context.callApi(<on_complete-api-id>, payload, { user })`.
  - Payload shape (committed here for the v1 contract; refinement deferred to a follow-up `api-hooks` sub-design per concept):
    - `workflow_id`, `workflow_type`.
    - `group_id`, `group_title`.
    - `user: { id, profile, roles }` (inherited via callApi auth context).
    - `event_id` from the just-dispatched log event (so the hook can chain its own event with `references`).
- Errors logged but do not fail the submit.
- Returns nothing — fan-out runs after all writes are durable.

### Lifecycle integration

Step 9 in `handleSubmit` now executes (previously no-op'd in [part 6](../06-submit-action-writes/design.md)). Runs after step 7 (log event) and step 8 (notifications) but before step 10 (tracker subscription) — because both step 9 (group fan-out) and step 10 may make in-process writes through `context.callApi`, the ordering matters for the `tracker_fired` signal.

### Cancellation exclusion

`CancelWorkflow` ([part 5](../05-start-cancel-handlers/design.md)) flips actions to `not-required`, which means groups land at `done` — but per concept, `on_complete` does **not** fire on cancel. Implementation: `CancelWorkflow` doesn't return a `completed_groups` list (or returns an empty one); only the submit path emits the fan-out.

### Idempotency

Group status is one-way (`blocked → in-progress → done`, no transitions back), so any given group only ever appears once in `completed_groups` across the workflow's lifetime — fan-out fires at most once per group naturally. Retry of an idempotent `SubmitWorkflowAction` call produces `completed_groups: []` (the group was already `done`), so no double-fire.

## Out of scope / deferred

- **Hook payload refinement** — concept defers to a follow-up `api-hooks` sub-design. v1 ships the minimal payload above; expand additively.
- **Retry semantics on hook failure** — concept acknowledges as a v1 risk ("if engine retries after group completion but before hook fire, hook may be missed entirely"). Mitigation in v1: idempotent hooks + periodic reconciliation (app-side catch-all).
- **Order-of-firing** when multiple groups complete in one submit — fire in `completed_groups` array order (which is workflow's `action_groups[]` declaration order from part 7).

## Depends on

[Part 1](../01-call-api-primitive/design.md), [part 7](../07-group-state-machine/design.md), [part 9](../09-hook-invocation/design.md) (same `context.callApi` invocation pattern).

## Verification

- Unit tests:
  - Each entry in `completed_groups` with `on_complete` set produces one `context.callApi` call.
  - Entries with `on_complete: null` produce no call.
  - Hook errors are logged but the submit returns successfully.
  - `CancelWorkflow` doesn't fan out any hooks.
- Integration test against a fixture workflow with multiple groups all completing in one submit: fan-out fires in declaration order.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Per-hook auth** — should `on_complete` Apis carry the same `hook.auth.roles ⊇ action.access.roles` build-time check that action-level hooks do? Concept doesn't say. Lean: yes, validate at build time in [part 13 (resolver-apis)](../13-resolver-apis/design.md) or [part 4 (workflow-config-schema)](../04-workflow-config-schema/design.md). Decide during implementation.

## Contract to neighbours

- **Part 7** surfaces `completed_groups`; this part consumes it.
- **Part 13** baked-in hook-auth check may need extending to cover `on_complete` Apis. Mention in part 13's open questions.
