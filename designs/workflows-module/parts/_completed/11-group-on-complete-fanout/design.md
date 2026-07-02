# Part 11 — Group `on_complete` fan-out

> **SHIPPED (0.9.2) — deviations from this design.** The dispatch shipped, but simpler than the body below (which predates the Part 38/48/66 rebuild — see the stale-contract note that already opens it). What actually landed:
>
> - **Phase, not `fireGroupOnComplete.js`.** Implemented as `plugins/…/shared/phases/dispatchGroupOnComplete.js`, called from `handleSubmit.js` **post-commit, before the tracker cascade and post-hook** (lifecycle step 9). Iterates `plan.completedGroups`.
> - **Shipped `callApi` contract.** `callApi({ endpointId, payload })` with a build-resolved, pre-scoped endpoint id. `makeWorkflowApis` emits `group_on_complete` on the submit endpoint — a `{ group_id → { _module.endpointId } }` map, the same mechanism as hooks — and the dispatcher reads it off `params.group_on_complete`. No runtime `workflow-{type}-group-{id}-on-complete` id synthesis.
> - **Error policy: throws propagate** (post-commit, idempotent contract — identical to the post-hook), *not* the log-and-continue + `fan_out_results` return this design specifies. The handler return is unchanged (`completed_groups` is the originating diff); there is no `fan_out_results` key.
> - **Payload.** `{ workflow_id, workflow_type, group_id, user, context: { workflow } }`. No `group_title`, no `event_id` — mirrors the post-hook `context` so a routine can reach `context.workflow.entity.id`. Revisit if a concrete consumer needs more.
> - **Parent-level fan-out IS implemented** (the "Extends `fireTrackerSubscription`" scope, adapted to the cascade loop). `planTrackerLevel` computes each level's `completedGroups` diff; `runTrackerCascade` accumulates them paired with the committed parent doc; `handleSubmit` dispatches the union of originating + cascade completions **after** the cascade (lifecycle reordered: tracker=9, fan-out=10 — a parent completion doesn't exist until its level commits). The dispatcher resolves the endpoint by `workflow_type`, so `group_on_complete` is emitted as a `{ workflow_type → group_id → endpoint }` bundle spanning the workflow + its ancestors (same ancestor walk as `render_config`). **The "Open questions" auth-context problem is moot:** the emitted `on_complete` endpoints are `InternalApi` with no role gate (engine-only), so parent-level fires under `context.user` never auth-fail — no elevated identity needed. Deviations from the design's version: single flat union fan-out (not a per-level `fireGroupOnComplete` call), no `fan_out_results` in the handler return, and the handler response's `completed_groups` stays **originating-only** (the union is used for dispatch, not surfaced) — revisit if a consumer needs parent completions in the response.
> - **Worked example.** `apps/demo/…/onboarding/onboarding.yaml` — the `qualification` group's `on_complete` advances the lead's pipeline status to `qualified` (moved out of `qualify`'s post-hook; the transition-only firing removes the need for that hook's `$cond` replay guard).

**Source rationale:** [workflows-module-concept/action-groups/spec.md](../../../../workflows-module-concept/action-groups/spec.md), [workflows-module-concept/submit-pipeline/spec.md](../../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** engine handlers. **Size:** S. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

> **Stale `callApi` contract — re-derive before implementing.** This design's invocation, error-policy, and payload passages cite the unshipped `callApi({ id, module }, payload, { user })` / `result.success` proposal. The shipped contract ([call-api/spec.md](../../../../workflows-module-concept/call-api/spec.md); Part 38 § "The shipped `callApi` contract") is `callApi({ endpointId, payload })` — opaque **pre-scoped** endpoint id string, throws on failure, returns the `:return` value or `null`, no user override. Consequences for this design: the runtime id synthesis (`workflow-{type}-group-{id}-on-complete`) must instead consume build-resolved ids — `makeWorkflowApis` wraps emitted on-complete Api ids in `_module.endpointId` the same way Part 38 task 22 wraps hook ids — and the "log on `result.success === false`" policy becomes "catch the throw, log, continue". The handler architecture this design extends (`handleSubmit`/`fireTrackerSubscription`) is also rebuilt by Part 38; re-derive against the Part 38 phase model.

## Goal

When a group transitions to `done` inside `SubmitWorkflowAction` — either on the originating workflow or on a parent workflow whose tracker action was just propagated to `done` — fire the group's declared `on_complete` Api via `context.callApi`. Fires at most once per group per workflow lifetime (groups never leave `done`). Not fired on `CancelWorkflow`.

## In scope

### `completed_groups` entry shape (extended)

Each entry in the `completed_groups` array carries the full per-workflow context needed to fan out, because a single submit can produce entries spanning multiple workflows (the originating one + any parent levels reached by tracker propagation):

- `workflow_id` — the workflow whose group transitioned to `done`.
- `workflow_type` — the workflow's `workflow_type`, needed for the Api id template.
- `id` — the group's id.
- `group_title` — `workflowConfig.action_groups[].title` indexed by `id`, or `null` if not declared (validator does not require it; see [makeWorkflowsConfig.js:106–126](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js)).
- `on_complete` — the raw `{ routine: [...] }` object from `workflowConfig.action_groups[].on_complete`, or `null`. Used as a fire/skip signal only; the actual call targets the resolver-emitted Api id below, not the inline routine.

Both producers ([handleSubmit.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) for the originating workflow's diff, [fireTrackerSubscription.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js) for each parent level) emit this same shape. See "Extends `fireTrackerSubscription`" below.

### `fireGroupOnComplete.js`

- Accepts a `completedGroups` list whose entries may span multiple workflows (originating + tracker-propagated parents).
- For each entry whose `on_complete` is truthy:
  - **Api id.** Synthesize `workflow-{entry.workflow_type}-group-{entry.id}-on-complete` to match [part 13 § Hook emission](../../_completed/13-resolver-apis/design.md)'s deterministic naming. Read `workflow_type` from the **entry** (not `context.workflow`) — `context.workflow` reflects only the originating workflow, but entries may belong to parent workflows. The handler hard-codes the template; the [Verification](#verification) unit test pins it so a divergence in part 13 fails loudly. (Same posture as [dispatchLogEvent.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js)'s hard-coded `new-event` target.)
  - **Invocation.** `context.callApi({ id: <derived-id>, module: 'workflows' }, payload, { user: context.user })`. The Api is module-scoped (emitted by `makeWorkflowApis` under the workflows module entry — [part 13](../../_completed/13-resolver-apis/design.md)), so the `{ id, module }` form is required; a bare string would silently dispatch into the consuming app's own-Api namespace. Matches the call shape established in [dispatchNotifications.js:17–21](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js). `context.user` is the submit caller for all entries — tracker-propagated parent fires inherit the submitter's auth context, matching how Part 10's `fireTrackerSubscription` already writes parent tracker actions under the submitter's identity.
  - **Payload shape** (committed here for the v1 contract; refinement deferred to a follow-up `api-hooks` sub-design per concept). All sources are per-entry, not from `context.workflow`:
    - `workflow_id` — `entry.workflow_id`.
    - `workflow_type` — `entry.workflow_type`.
    - `group_id` — `entry.id`.
    - `group_title` — `entry.group_title` (may be `null` if not declared on the group config).
    - `user: context.user` — explicit on the payload (mirrors [part 9](../../_completed/09-hook-invocation/design.md)'s pre/post hook payload contract). The third-arg `{ user }` is the `callApi` auth context for the target Api; it doesn't auto-inject `user` into the payload, so the field is set explicitly.
    - `event_id` — `context.eventId` (the same id threaded through every write in this submit; equals the just-dispatched log event's `_id` per [part 8](../../_completed/08-side-effect-dispatch/design.md)). The hook chains its own event with `references` pointing at this id. Parent-level fires reference the **originating** submit's event, which is the correct provenance — the parent-level group transition was caused by this submit's tracker propagation, and there is no separate per-level log event written.
- **Error policy.** Wrap each `callApi` invocation in a local try/catch. On failure, log with `{ workflow_id, group_id, on_complete_api_id, error }` and continue with the next entry — exceptions never escape `fireGroupOnComplete.js`. Match `dispatchNotifications.js`'s `result.success` check shape but invert the policy: on `result.success === false`, log instead of throw.

  This **diverges from [part 8's posture](../../_completed/08-side-effect-dispatch/design.md)** for log-event and notification dispatch, which throw past `handleSubmit` to the request layer (their narrow try/catch at [handleSubmit.js:337,345](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) just stamps `err.step` and re-throws). The divergence is deliberate: log-event and notifications are engine-owned dispatch where a failure is a config or infrastructure bug we want surfaced. `on_complete` runs arbitrary author code; an author bug shouldn't return a 500 to a submitter whose action transitioned cleanly. The trade-off accepted here — caller has no signal that an `on_complete` hook didn't fire — is the v1 risk the concept already names ("if engine retries after group completion but before hook fire, hook may be missed entirely"), mitigated by idempotent hooks (see "Out of scope / deferred" below).

- **Return shape.** Returns `Array<{ workflow_id, group_id, on_complete_api_id, success: boolean, error?: any }>` — one entry per fired (or attempted) call, in declaration order. `success: false` carries the captured `error`. This lets `handleSubmit` thread the outcome into the post-hook payload and the response (see "Lifecycle integration"); without it, post-hook authors who want to react to "did fan-out fire cleanly?" have no signal.
- **Concurrency.** Sequential `for-of` (not `Promise.all`). Two reasons: (a) "Out of scope / deferred" commits to firing in declaration order, which `Promise.all` violates for any side effects observed externally; (b) per-fire cost is small (one in-process `callApi` per group, and groups completing in a single submit are typically ≤ a handful). Spell out `for (const entry of completedGroups) { await ... }` in the implementation so a reader doesn't reach for `Promise.all` thinking it's a parallelisation win.

### Extends `fireTrackerSubscription` (Part 10 helper)

Part 10's [`fireTrackerSubscription.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js) already calls `recomputeWorkflowAfterActionWrite` on the parent workflow per recursion level, which returns `groupsBefore` and `groupsAfter` ([recomputeWorkflowAfterActionWrite.js:132–140](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.js)). Today those diffs are discarded.

Extend the helper to:

1. At each recursion level, after the parent recompute returns, compute the parent's `completed_groups` diff using the same logic `handleSubmit.js:275–289` applies for the originating workflow: groups whose `status` was non-`done` in `groupsBefore` and is `done` in `groupsAfter`. Resolve `group_title` and `on_complete` from the parent's `workflowConfig.action_groups[]`, and stamp `workflow_id` / `workflow_type` from the parent workflow doc the helper already loaded.
2. Attach the resulting list (possibly empty) to that level's fire-chain entry as `completed_groups: [...]`.

New return shape: `Array<{ parent_action_id, parent_workflow_id, new_status, completed_groups: Array<{ workflow_id, workflow_type, id, group_title, on_complete }> }>`.

This deviates from Part 10's documented return ([Part 10 design.md "Logic"](../../_completed/10-tracker-subscription/design.md)), which is in `_completed/`. Per CLAUDE.md, that design is read-only history — the deviation is documented inline at the top of `_completed/10-tracker-subscription/design.md` as part of this Part 11 work, and the extension itself ships as a small change within Part 11's implementation scope (the helper file is in the `SubmitWorkflowAction/` directory and its consumer, `handleSubmit`, is the same file Part 11 is wiring).

### Lifecycle integration

The submit-pipeline spec ordering is amended (see [submit-pipeline/spec.md § Flow](../../../../workflows-module-concept/submit-pipeline/spec.md)): step 9 is tracker subscription, step 10 is group `on_complete` fan-out. The data dependency forces this swap — fan-out consumes the union of the originating workflow's `completed_groups` (computed in `handleSubmit` from step 5's recompute diff) and each parent level's `completed_groups` (computed inside `fireTrackerSubscription` and attached to the fire chain). Until step 9 runs, parent-level completions don't exist.

`handleSubmit` after the swap:

- **Step 9** — Tracker subscription. Sets `trackerFired = await fireTrackerSubscription(...)`. With the extension above, each entry in `trackerFired` carries its level's `completed_groups`.
- **Step 10** — Group `on_complete` fan-out. Build `unionCompletedGroups = [...originatingCompletedGroups, ...trackerFired.flatMap(f => f.completed_groups)]` and call `fireGroupOnComplete(context, { completedGroups: unionCompletedGroups })`. Capture the return as `fanOutResults`.
- **Step 11** — Post-hook. Receives `completed_groups: unionCompletedGroups` (so post-hook authors see every group that completed on this submit, regardless of which workflow it lives on), `tracker_fired: trackerFired`, and `fan_out_results: fanOutResults`.

The handler's return shape gains `completed_groups` as the union and adds `fan_out_results`; existing fields keep their names.

### Cancellation exclusion

`CancelWorkflow` ([part 5](../05-start-cancel-handlers/design.md)) flips actions to `not-required`, which means groups land at `done` — but per concept, `on_complete` does **not** fire on cancel. Implementation: `CancelWorkflow`'s return shape ([CancelWorkflow.js:143](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) — committed in [part 7 § CancelWorkflow integration](../../_completed/07-group-state-machine/design.md)) omits the `completed_groups` key entirely; only the submit path emits the fan-out.

### Engine-side idempotency

Group status is one-way (`blocked → in-progress → done`, no transitions back), so any given group on any given workflow only ever appears once in `completed_groups` across that workflow's lifetime — the engine emits each entry at most once. Retry of an idempotent `SubmitWorkflowAction` call produces `completed_groups: []` (the group was already `done`), so the engine won't re-emit. This holds for parent-level entries too: re-running `fireTrackerSubscription`'s recompute against a parent whose group is already `done` produces a `groupsBefore === groupsAfter` no-op for that group, so the parent-level diff is also empty.

This is engine-side bookkeeping only. The `on_complete` Api itself is arbitrary author code; whether its side effects are idempotent is the hook author's responsibility. See "Out of scope / deferred" below — the v1 risk of "engine retries after group completion but before hook fire" is mitigated by idempotent hooks.

## Out of scope / deferred

- **Hook payload refinement** — concept defers to a follow-up `api-hooks` sub-design. v1 ships the minimal payload above; expand additively.
- **Retry semantics on hook failure** — concept acknowledges as a v1 risk ("if engine retries after group completion but before hook fire, hook may be missed entirely"). Mitigation in v1: idempotent hooks.
- **Order-of-firing** when multiple groups complete in one submit — fire in `completedGroups` array order: originating workflow's groups (in `action_groups[]` declaration order) first, then parent levels in the order `fireTrackerSubscription` walks them (child → parent → grandparent), and within each level in that workflow's `action_groups[]` declaration order. This is the natural array order produced by `[...originatingCompletedGroups, ...trackerFired.flatMap(f => f.completed_groups)]`.

## Depends on

[Part 1](../../_completed/01-call-api-primitive/design.md), [part 7](../../_completed/07-group-state-machine/design.md), [part 9](../../_completed/09-hook-invocation/design.md) (same `context.callApi` invocation pattern), [part 10](../../_completed/10-tracker-subscription/design.md) (this part extends `fireTrackerSubscription`'s return shape — see "Extends `fireTrackerSubscription`" above), [part 13](../../_completed/13-resolver-apis/design.md) (Api id template — the handler hard-codes the template; the unit test pins it so divergence fails loudly).

## Verification

- Unit tests:
  - **Api id template pinned.** Given a fixture `action_groups: [{ id: 'phase-1', title: 'Discovery', on_complete: { routine: [...] } }]` on `workflow_type: onboarding`, a submit that completes phase-1 fires `context.callApi({ id: 'workflow-onboarding-group-phase-1-on-complete', module: 'workflows' }, ...)`. Locks the template against silent drift from [part 13](../../_completed/13-resolver-apis/design.md).
  - **Payload contract.** The same fixture asserts the payload carries `workflow_id`, `workflow_type`, `group_id`, `group_title`, `user`, and `event_id` (= `context.eventId`).
  - Entries with `on_complete: null` produce no call.
  - **Per-entry sources.** A fixture with two `completed_groups` entries belonging to different workflows (different `workflow_id` / `workflow_type`) fires two distinct Api ids and tags each payload with the entry's own `workflow_id` / `workflow_type` — proves the implementation reads from the entry, not `context.workflow`.
  - **Tracker-propagated parent fan-out.** Fixture: child workflow `child-type` with a single action whose completion auto-completes it; parent workflow `parent-type` with a tracker action wired to the child and a group containing only that tracker action with an `on_complete` declared. A submit on the child fires the parent group's `on_complete` Api (`workflow-parent-type-group-{id}-on-complete`) with `workflow_id` set to the parent's id. Locks the option-1 plumbing.
  - **Sequential ordering.** Multiple completed groups produce sequential `callApi` invocations (not concurrent) in the union's array order. Assert by spying on `callApi` and checking the call sequence.
  - **Error isolation.** Three sub-cases, all asserting "log + continue, submit returns successfully":
    1. Target routine throws → `result.success === false` is observed → logged + continue.
    2. Target routine returns `{ success: false, error: ... }` → logged + continue.
    3. `callApi` itself throws (e.g. unknown `{ id, module }`) → caught locally → logged + continue.
       Without (3), an implementer who copies `dispatchNotifications.js`'s pattern verbatim would let unknown-module throws bubble.
  - **Return-shape audit.** Helper returns one entry per attempted call with `success` boolean and (on failure) `error`; `handleSubmit` threads this into the post-hook payload as `fan_out_results`.
  - `CancelWorkflow` doesn't fan out any hooks.
- Integration test against a fixture two-level workflow (child + parent with tracker subscription): child submit auto-completes child → tracker propagates to parent → parent group completes → parent `on_complete` fires. Asserts both calls happen and in correct order (originating first, then parent).
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Auth context for tracker-propagated fan-out.** Originating-workflow `on_complete` fires hold Part 13's auth gate "by construction" because the submitter already passed the originating action's role gate at the top of `handleSubmit` ([handleSubmit.js:104–113](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) and the originating group's `auth.roles` is the union of those same actions' `access.roles`. Tracker-propagated parent fires don't have that guarantee: the submitter may have no role in the parent workflow at all. Part 10's tracker-propagated **action writes** bypass auth deliberately (engine-initiated), but `on_complete` Apis go through `context.callApi` which enforces `auth.roles`, so under `context.user` they may auth-fail spuriously.

  Three options to consider during implementation:
  1. Fire parent-level `on_complete` under `context.user` and accept that auth failures land in the error-policy log+skip path. Simplest; surfaces the failure but doesn't fire the hook. Risk: a real semantic "should fire" can be silently dropped because the submitter happens to lack parent-workflow roles.
  2. Fire all engine-dispatched hooks (originating + parent-level) under an elevated system identity. Matches log-event/notification dispatch posture (those are engine-owned and don't enforce per-user gates). Requires defining or borrowing a system identity for `callApi`'s third-arg `{ user }`.
  3. Synthesize a per-fire auth context from the parent workflow's group's union of `access.roles` — i.e. give the call exactly the roles the gate is checking for. Effectively the same as option 2 but scoped per fire. Cleaner than option 2 for audit purposes (the hook sees who would have been allowed to do this), worse for traceability of "who really triggered it."

  Resolve at implementation time once the trade-off is visible against real hooks. v1 implementation should at minimum log the auth-failure case distinctly so it's not lost in the general error-policy noise.

## Contract to neighbours

- **Part 7** surfaces `completed_groups` for the originating workflow's diff; this part consumes it and the parent-level diffs from Part 10's extended helper.
- **Part 10** ([`fireTrackerSubscription.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js)) gains a `completed_groups` field on each fire-chain entry, as described in "Extends `fireTrackerSubscription`" above. Documented as a deviation note at the top of the completed Part 10 design.
- **Part 13** emits the `on_complete` Api at build time and synthesizes `auth.roles` from the union of the group's actions' `access.roles` ([part 13 § Auth by construction](../../_completed/13-resolver-apis/design.md)). For the originating workflow's fan-out, the hook-auth gate holds by construction because the submitter already passed the action's role gate. For tracker-propagated parent fires, see "Open questions" above.
