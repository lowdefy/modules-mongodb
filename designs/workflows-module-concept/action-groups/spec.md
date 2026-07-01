# Workflows Action Groups — Spec

Elevates `action_group` from UI label to engine concept. Full rationale in [design.md](designs/workflows-module-concept/action-groups/design.md); this file carries only the committed decisions.

## Workflow YAML — top-level `action_groups:`

```yaml
type: onboarding
title: Onboarding
entity_collection: leads-collection
display_order: 1

action_groups:
  - id: phase-1
    title: Discovery
    on_complete: workflow_config/onboarding/api/phase-1-complete.yaml
  - id: phase-2
    title: Quote
  - id: phase-3
    title: Installation

starting_actions:
  - { type: qualify, status: action-required }
  - ...

actions:
  - _ref: ./qualify.yaml # action_group: phase-1
  - _ref: ./send-quote.yaml # action_group: phase-1, blocked_by: [qualify]
  - _ref: ./schedule-followup.yaml # action_group: phase-2, blocked_by: [phase-1]
  - _ref: ./track-installation.yaml # action_group: phase-3, blocked_by: [phase-2]
```

Per-group fields:

| Field         | Type    | Notes                                                                                       |
| ------------- | ------- | ------------------------------------------------------------------------------------------- |
| `id`          | string  | Unique within the workflow. Referenced from `action.action_group` and `blocked_by`.         |
| `title`       | string  | Display title in `workflow-header` group sections.                                          |
| `on_complete` | string? | Optional path to a Lowdefy routine YAML. Invoked once when the group transitions to `done`. |

**Display order = YAML order.** No separate `sort_order` on groups. Per-action `sort_order` controls intra-group ordering.

## `blocked_by` accepts group IDs

`blocked_by:` entries may mix action types and group IDs in one list:

```yaml
type: schedule-installation
action_group: phase-3
blocked_by: [phase-2, contact-customer] # group ID + action type
```

**Resolution precedence** (engine, at runtime):

1. Group ID match in the workflow's `action_groups:` → unblocks when group status is `done`.
2. Otherwise, action-type match in `actions:` → unblocks when an action with that type reaches terminal status (`done` or `not-required`).
3. Otherwise → build-time error.

**Collision rule.** No `action_groups[].id` may equal any `actions[].type` within the same workflow. Build-time validation rejects collisions.

## Group status — derived three-value enum

| Value         | Rule                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `done`        | Every action in the group has terminal status (`done` or `not-required`), and the group is non-empty.                                  |
| `in-progress` | At least one action is non-terminal AND at least one is `action-required`, `in-progress`, `in-review`, `changes-required`, or `error`. |
| `blocked`     | Every non-terminal action in the group is `blocked` (default for an unstarted group).                                                  |

**Empty groups** are `done` by convention. Build-time validation MAY warn on empty groups.

**Cancellation.** `CancelWorkflow` flips all open actions to `not-required` → every group lands at `done`. The `on_complete` hook **does NOT fire** on cancellation (Decision 6).

## Persistence — `groups[]` on the workflow doc

```js
// workflow doc
{
  _id, workflow_type, entity_id, entity_collection, ...,
  status: [ { stage: 'active', created } ],
  summary: { done: 3, not_required: 0, total: 6 },
  groups: [
    { id: 'phase-1', status: 'done',        summary: { done: 2, not_required: 0, total: 2 } },
    { id: 'phase-2', status: 'in-progress', summary: { done: 1, not_required: 0, total: 3 } },
    { id: 'phase-3', status: 'blocked',     summary: { done: 0, not_required: 0, total: 1 } },
  ],
}
```

Array (not map) preserves display order. Per-group `summary: { done, not_required, total }` parallel to workflow-level `summary`. Eager writeback inside `SubmitWorkflowAction` (Decision 5).

**Drift class** same as `summary` writeback. Direct DB writes to actions bypass the engine and may leave `groups[]` stale; the periodic reconciliation job covers this.

**Indexes.** No new module-shipped indexes. Apps that query by phase add their own (`groups.status` or denormalized scalar).

## Engine flow inside `SubmitWorkflowAction`

Ordered steps (extending engine sub-design's existing ordering):

1. Write the requesting action's status.
2. Recompute affected groups' statuses; write `groups[]` back to the workflow doc.
3. Re-evaluate `blocked_by` for every `blocked` action against new state; push `action-required` on those whose dependencies are now terminal.
4. Auto-complete check on the workflow. Re-run after step 3 (step 3 may have transitioned more actions).
5. If step 4 wrote a workflow status, run tracker subscription.
6. Recompute workflow-level `summary`.
7. Return `{ action_ids, completed_groups, event_id }`.

**Step 2 — affected groups.** "Affected" means the group containing the requesting action, plus groups containing any actions transitioned in this call. Handler MAY recompute every group (correctness fine; performance trade-off).

**Step 3 — `blocked_by` re-evaluation.** Single scan of every `blocked` action in the workflow. For each, evaluate every `blocked_by` entry against current group/action state; write `action-required` if all entries resolve to terminal. Subject to the priority transition rule (engine sub-design Decision 4). This single step covers both inter-action and inter-group dependencies.

**Step 7 — return shape.**

```
{
  action_ids: [...],          // ids of all actions written
  completed_groups: [         // groups that transitioned to `done` in step 2
    { workflow_id, id, on_complete? }
  ],
  event_id: string,
}
```

`completed_groups` is populated only when step 2 transitioned a group from any other status to `done`. Already-`done` groups don't appear. Retry of an idempotent `SubmitWorkflowAction` call produces `completed_groups: []` because step 2 no-ops.

**Idempotency.** Step 2 is idempotent (writing the same `groups[]` produces the same state). Step 3 is idempotent (the FSM no-ops repeated `unblock` re-fires — an already-unblocked `action-required` action has no `unblock` transition). Step 7's `completed_groups` is computed from actual transitions; retries don't re-fire hooks.

## `on_complete` invocation — engine-internal fan-out (submit-pipeline)

What this sub-design commits:

- `SubmitWorkflowAction` returns `completed_groups`. Each entry carries the `on_complete` Api id declared in YAML (or null).
- Fan-out is **engine-internal** — step 11 of the `SubmitWorkflowAction` lifecycle (submit-pipeline Decision 1) calls `context.callApi(<on_complete-api-id>)` per entry. Submit-pipeline owns the lifecycle ordering (after notifications dispatch, before post-hook).
- **Fires at most once per group per workflow lifetime** — `blocked → in-progress → done`, not back. Same one-way priority semantics as action statuses.
- **Does NOT fire on `CancelWorkflow`** — cancellation flips actions to `not-required` and groups to `done`, but the hook is for natural completion. Engine distinguishes by call site (`CancelWorkflow` doesn't populate `completed_groups`).
- **Reuses the same `eventId`** as the triggering call.

Groups without `on_complete` declared have no hook to fire; they appear in `completed_groups` with `on_complete: null` and the engine skips the call.

**What's deferred** to the `api-hooks` follow-up sub-design: refinements to per-group hook payload, error-propagation policy for hook failures, and any per-group retry semantics. Engine work (Decisions 1–5) ships independently — `completed_groups` lands first and is functional as a returned signal even before the fan-out step itself is implemented.

## Worked example — phase transition

User submits `send-quote` (last open action in phase-1) via `onboarding-send-quote-submit` (submit-pipeline). `SubmitWorkflowAction` runs the lifecycle:

1. Write `send-quote.status = done`.
2. Recompute affected groups: phase-1 all-terminal → `groups[0].status = done`. Write `groups[]`.
3. Re-evaluate `blocked_by`: `schedule-followup` has `blocked_by: [phase-1]`; phase-1 is now `done` → push `action-required`.
4. Auto-complete check: `schedule-followup` and `track-installation` still open → no workflow transition.
5. Tracker subscription: no workflow status change → skip.
6. Recompute workflow summary.
7. Log event, dispatch notifications.
8. Fan out `on_complete` for completed groups — engine calls `context.callApi(<phase-1-complete-api-id>)`; that hook emits its own event + writes `lead.stage = qualified`.
9. Return `{ action_ids: [send-quote, schedule-followup], completed_groups: [{ workflow_id, id: phase-1, on_complete: '<api-id>' }], event_id, tracker_fired: null }`.

## Open questions

1. **`api-hooks` follow-up refinements.** Per-group hook payload shape, error-propagation, retry semantics. Engine returns `completed_groups` cleanly today; refinements are additive.
2. **Auto-complete ordering.** When the last group completes, the workflow itself auto-completes. The hook for the last group fires _before_ the workflow auto-completes (step 3 runs before step 4). Authors can rely on the order.

## Risks

- **`groups[]` write contention.** Same family as `summary` write contention. Same opt-in `summary_dirty: true` lazy-writeback covers `groups[]`. Default eager.
- **`on_complete` retry duplication / loss.** If `SubmitWorkflowAction` retries after step 2 succeeded but before step 8's fan-out ran, the next retry returns `completed_groups: []` (group already `done`). **Hook is missed entirely** in that retry shape. Mitigation: idempotent hooks; periodic reconciliation extends to "groups in `done` whose `on_complete` audit-event is missing." Same risk class as the event/notification leak documented in submit-pipeline "Composition error semantics."
- **`blocked_by` evaluation cost.** Step 3 is O(N) per transition over blocked actions. Negligible for typical workflows (<20 actions). v2 optimisation if pathological.
