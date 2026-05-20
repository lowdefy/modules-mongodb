# Part 23 — `CloseWorkflow` handler

**Source rationale:** [workflows-module-concept/engine/spec.md](../../../workflows-module-concept/engine/spec.md), [workflows-module-concept/action-authoring/spec.md § `required_after_close`](../../../workflows-module-concept/action-authoring/spec.md), [part 6 review-1 finding #7](../06-submit-action-writes/review/review-1.md). **Layer:** engine handlers. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/` + `modules/workflows/api/`.

## Goal

Re-introduce the close-vs-cancel distinction the v0 workflows engine had. `CloseWorkflow` lets an author-initiated normal termination push the workflow to `completed` (not `cancelled`), sweeping non-terminal actions to `not-required` while **honoring `action.required_after_close: true`** (with the blocked-action exception). Pairs the missing handler with a `close-workflow` operational API.

The current design collapsed close into auto-complete-only (the path inside `SubmitWorkflowAction` that pushes `completed` when every action is terminal). That handles the natural case but leaves three real cases unowned:

1. **Author-initiated close on a non-terminal workflow.** Business decided to stop pursuing this (lead went cold, deal lost, customer paused). Workflow shouldn't show "needs work forever" but isn't aborted either.
2. **`required_after_close: true` actions surviving close.** v0's audit/notes actions stay submittable post-close; the close-sweep skips them. Cancel sweeps them anyway. The flag has no purpose if there's no close handler.
3. **Tracker subscription firing `done` (not `not-required`) on close.** Per the hard-coded child-stage map (`completed → done`, `cancelled → not-required`), a parent tracker of a closed child must land at `done`.

## In scope

### `CloseWorkflow.js`

- **Payload**:
  - Required: `workflow_id`.
  - Optional: `reason` (written into the `completed` status entry).
  - Optional: `references` (spread onto workflow doc on close using the engine's reserved-key merge order — references first, core fields including the `completed` status push last, per [engine spec § References write contract](../../../workflows-module-concept/engine/spec.md#references-write-contract)).
- **Validation** (runtime, at handler entry):
  - Workflow exists.
  - Workflow's current stage is `active` — already-`completed` is a no-op (idempotent), already-`cancelled` rejects (cancel is a stronger signal than close).
- **Writes**:
  - Push `{ stage: completed, created, reason? }` onto the workflow's `status[]`.
  - **Action sweep** — flip non-terminal actions to `not-required` _conditionally_:
    - Sweep when `status.0.stage NOT IN [done, not-required]` AND (`required_after_close ≠ true` OR `status.0.stage = blocked`).
    - Pushes use `force: true` (same posture as `CancelWorkflow`'s sweep — engine-driven write bypasses the priority rule).
    - The blocked-action exception is load-bearing: a `required_after_close: true` action that's `blocked` still gets swept, because the user can't act on it post-close anyway and leaving it lingering would be a footgun.
  - Recompute and write `summary`. `groups[]` recompute follows the same posture as [part 7's CancelWorkflow integration](../07-group-state-machine/design.md#cancelworkflow-integration); the group recompute hook lands there alongside the cancel recompute when part 7 ships.
- **Tracker fan-up**: If the workflow has a `parent_action_id`, the engine's tracker subscription (lands in [part 10](../10-tracker-subscription/design.md)) fires the parent action's `done` transition per the hard-coded `completed → done` mapping. This handler simply writes the workflow `completed` push; part 10 listens.
- **Returns**: `{ action_ids, event_id: null, tracker_fired: null }` (side effects land in parts 8, 10).

### Shared close/auto-complete write helper

[Part 7](../07-group-state-machine/design.md#auto-complete-check) auto-completes a workflow inside `SubmitWorkflowAction` when every action is terminal — it pushes `completed` to the workflow status array. This part introduces `src/connections/shared/closeWorkflow.js` carrying the workflow-close write (status push + summary recompute + reserved-key merge). Both call sites use it:

- `CloseWorkflow.js` — the author-initiated handler (this part).
- `SubmitWorkflowAction/handleSubmit.js` — the auto-complete path owned by part 7, refactored to delegate to the shared helper.

The action sweep is **not** in the shared helper — auto-complete doesn't sweep (every action is already terminal by definition; that's why it auto-completed). The sweep is local to `CloseWorkflow.js`.

The shared helper does not write event/notifications/tracker — those land in [parts 8](../08-side-effect-dispatch/design.md) and [10](../10-tracker-subscription/design.md). It's the workflow-doc write only.

### `close-workflow` operational API

Add a fifth operational API to [part 19](../19-operational-apis/design.md):

- `close-workflow.yaml` — single-step routine invoking `CloseWorkflow` from this part. Payload: `workflow_id` required; `reason`, `references` optional. Returns `{ action_ids, event_id, tracker_fired }`.

Part 19's design and exports list need updating to include this fifth API. Part 20's manifest exports list also adds it.

### Connection schema

No change. Reuses the existing `WorkflowAPI` connection schema from [part 3](../03-engine-plugin-shell/design.md).

## Out of scope / deferred

- **Log event + notifications on close** → [part 8](../08-side-effect-dispatch/design.md) — same deferral posture as `CancelWorkflow`. v1 close writes no event; opt-in in a follow-up.
- **Tracker subscription firing on parent close** → [part 10](../10-tracker-subscription/design.md). This handler writes the workflow `completed` push; part 10 reads workflow status changes and fires the tracker.
- **Group recompute on close** → folds into [part 7's CancelWorkflow integration](../07-group-state-machine/design.md#cancelworkflow-integration) — part 7 picks up both cancel and close group-recompute writeback when it ships.
- **`CloseWorkflow` button / UI surface** — part 17's `workflow-overview` page is the natural home; opt-in in a follow-up after part 17 lands.
- **Idempotency of double-close** — committed: already-`completed` is a no-op (silently); already-`cancelled` rejects (cancel ≠ close).
- **Backfill / migration** — no live consumers depend on the close handler today (v0's `CloseWorkflowActions` doesn't ship in the current plugin), so no migration concern.

## Depends on

[Part 3](../03-engine-plugin-shell/design.md) (connection scaffold, schemas), [part 4](../04-workflow-config-schema/design.md) (`required_after_close` is in `ACTION_FIELDS`), [part 5](../05-start-cancel-handlers/design.md) (`createMongoDBConnection`, `getActions`, change-stamp threading).

Light dependency on [part 7](../07-group-state-machine/design.md) — part 7 owns the auto-complete check (the path that pushes `completed` to workflow status when every action is terminal). The shared workflow-close write helper this part introduces is consumed by both `CloseWorkflow.js` and part 7's auto-complete. Either order works; the shared-helper seam is committed.

## Verification

- Workflow `active` → close → `completed` push lands; summary recomputes.
- Action sweep: non-terminal actions without `required_after_close: true` become `not-required`; actions with `required_after_close: true` stay; blocked actions get swept even when `required_after_close: true`.
- Already-`completed` close is a no-op (idempotent).
- Already-`cancelled` close rejects with a clear error.
- Reference-key spread on the workflow `completed` push.
- Tracker fan-up: when part 10 lands, closing a child workflow fires the parent tracker action's `done` push.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Should `CancelWorkflow` adopt the same sweep filter** (honor `required_after_close: true` except when `blocked`)? Current shipped behavior in part 5 sweeps all non-terminal actions unconditionally. v0 used the same filter for both close and cancel. Lean: yes, align cancel with the v0 filter — but that touches shipped code, so it spins out as a follow-up against part 5's shipped behavior rather than landing here.
- **Auto-complete path on a workflow with surviving `required_after_close: true` actions.** Today's auto-complete fires only when every action is terminal. With `required_after_close: true` actions staying open after close, auto-complete inside a re-submit on such an action would push `completed` again on an already-`completed` workflow — caught by the same-stage guard ([engine spec § Idempotency](../../../workflows-module-concept/engine/spec.md#idempotency)), so harmless. Worth confirming with a test in part 22.

## Contract to neighbours

- **Part 7** delegates its auto-complete workflow-status push to `src/connections/shared/closeWorkflow.js` (introduced here). Part 7 ships its own inline push if it lands first; refactor folds in when this part ships.
- **Part 7** also picks up the group-recompute writeback for both cancel and close in its `CancelWorkflow` integration section — broaden to "termination integration" when this part lands.
- **Part 10** fires tracker subscription on the workflow `completed` push from this handler, using the `completed → done` mapping from the hard-coded child-stage table.
- **Part 19** adds `close-workflow.yaml` as a fifth operational API.
- **Part 20** adds `close-workflow` to the module manifest's exports.
