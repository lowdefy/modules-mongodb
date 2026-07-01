# Part 23 — `CloseWorkflow` handler

**Source rationale:** [workflows-module-concept/engine/spec.md](../../../workflows-module-concept/engine/spec.md), [workflows-module-concept/action-authoring/spec.md § `required_after_close`](../../../workflows-module-concept/action-authoring/spec.md), [part 6 review-1 finding #7](../06-submit-action-writes/review/review-1.md). **Layer:** engine handlers. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/` + `modules/workflows/api/`.

## Goal

Re-introduce the close-vs-cancel distinction the v0 workflows engine had. `CloseWorkflow` lets a user-initiated normal termination push the workflow to `completed` (not `cancelled`), sweeping non-terminal actions to `not-required` while **honoring `action.required_after_close: true`** (with the blocked-action exception). Pairs the missing handler with a `close-workflow` operational API.

The current design collapsed close into auto-complete-only (the path inside `SubmitWorkflowAction` that pushes `completed` when every action is terminal). That handles the natural case but leaves three real cases unowned:

1. **User-initiated close on a non-terminal workflow.** Business decided to stop pursuing this (lead went cold, deal lost, customer paused). Workflow shouldn't show "needs work forever" but isn't aborted either.
2. **`required_after_close: true` actions surviving close.** v0's audit/notes actions stay submittable post-close; the close-sweep skips them. Cancel sweeps them anyway. The flag has no purpose if there's no close handler.
3. **Tracker subscription firing `done` (not `not-required`) on close.** Per the hard-coded child-stage map (`completed → done`, `cancelled → not-required`), a parent tracker of a closed child must land at `done`.

## In scope

### `CloseWorkflow.js`

- **Payload**:
  - Required: `workflow_id`.
  - Optional: `reason` (written into the `completed` status entry).
  - Optional: `references` (spread onto workflow doc on close, defended via the same `RESERVED_WORKFLOW_KEYS` deletion pattern shipped in [`CancelWorkflow.js:4–18`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) — engine spec's "merge order" rule covers action-doc `$set` writes, but the workflow close write combines `$set` with `$push: status`, and merge-order alone doesn't protect against a malicious `references: { status: [...] }` that would land before the `$push` appends).
- **Validation** (runtime, at handler entry):
  - Workflow exists.
  - Workflow's current stage is `active` — already-`completed` is a no-op (idempotent), already-`cancelled` rejects (cancel is a stronger signal than close).
- **Writes**:
  - Push `{ stage: completed, created, reason? }` onto the workflow's `status[]`.
  - **Action sweep** — flip non-terminal actions to `not-required` _conditionally_ via a two-step bulk pattern:
    - **Step 1 — fetch candidates.** `MongoDBFind` against `{ workflow_id, 'status.0.stage': { $nin: ['done', 'not-required'] } }` with projection `{ _id: 1, type: 1, key: 1, status: { $slice: 1 } }`. Same query shape as shipped `CancelWorkflow.js:73–79`, plus the sliced `status` so the blocked-action exception can be evaluated in-memory.
    - **Step 2 — filter in-memory against `workflowsConfig`.** Keep an action for sweep when (`required_after_close ≠ true` OR `status.0.stage = blocked`). The `required_after_close` flag lives in `workflowsConfig` (per-action-type), not on the action doc, so this filter has to land here — a single Mongo query can't express it.
    - **Step 3 — bulk write.** `MongoDBUpdateMany` against `{ _id: { $in: filteredIds } }` pushing `{ stage: 'not-required', created: changeStamp }` onto `status[]`. Same shape as shipped `CancelWorkflow.js:80–93`. Bypasses the priority rule by writing directly via the bulk dispatcher rather than going through `updateAction` (which is the only path that runs the priority rule). No per-action `force: true` calls — that's the per-doc helper's force surface, not the bulk path's.
    - The blocked-action exception is load-bearing: a `required_after_close: true` action that's `blocked` still gets swept, because the user can't act on it post-close anyway and leaving it lingering would be a footgun.
  - Recompute and write `summary` + `groups[]` inline against the post-sweep action set — same inline shape as shipped [`CancelWorkflow.js:96–127`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) (re-read all actions with `{ status: { $slice: 1 }, action_group: 1 }` projection, compute counts, call `recomputeGroups`, write both in one `MongoDBUpdateOne`). No "fold into part 7" — Part 7 shipped without a close hook; Part 23 owns the recompute. See the Write shape subsection below.
  - **Groups with `required_after_close: true` survivors land at whatever `deriveGroupStatus` returns** — likely `in-progress` or `blocked`, not `done`. This is an asymmetry with cancel (where every group lands at `done` because every action is terminal post-sweep), and it's intentional: the surviving actions remain submittable per the action-authoring spec, so a `done` status on their group would lie about open work. The workflow lands in `completed` (terminal) with truthful per-group status; UI consumers decide whether to surface group status on terminal workflows.
- **Tracker fan-up**: `CloseWorkflow.js` calls `fireTrackerSubscription(context, { workflowId: payload.workflow_id, newStage: 'completed', depth: 0 })` from shipped [part 10](../10-tracker-subscription/design.md) directly — after the recompute writeback, before the return. Same posture as shipped [`CancelWorkflow.js:130–134`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)'s integration. Part 10 is synchronous-in-process, not a change-stream listener; each terminating handler invokes the subscription itself. The hard-coded `completed → done` child-stage map fires the parent action's `done` transition when the workflow has a `parent_action_id`; the helper returns `[]` when there's none, so the call is unconditional.
- **Returns**: `{ action_ids, event_id: null, tracker_fired }` — `action_ids` is the swept set; `event_id` stays `null` in v1 (close generates no log event); `tracker_fired` is the array returned by `fireTrackerSubscription` (empty when no parent was written, one entry per fan-up level otherwise). The no-op path on already-`completed` returns `{ action_ids: [], event_id: null, tracker_fired: [] }`.

### Write shape — reuse shipped helpers, no new shared helper

The handler reuses the two helpers already shipped in `src/connections/shared/` and otherwise mirrors `CancelWorkflow.js`'s inline shape. No new "shared close helper" — auto-complete in [part 7](../../_completed/07-group-state-machine/design.md#auto-complete-check) bundles its `completed` `$push` into the same `MongoDBUpdateOne` as `summary` + `groups` for one round-trip ([handleSubmit.js:287–321](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)); refactoring it to delegate would split that bundle and force the helper to cope with two different upstream action-set shapes (all-terminal vs mixed with `required_after_close: true` survivors). Leave Part 7 alone.

Helpers used:

- [`SubmitWorkflowAction/recomputeGroups.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js) — same import path `CancelWorkflow.js:2` uses. Computes `groups[]` from a projected action list.
- [`SubmitWorkflowAction/fireTrackerSubscription.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js) — shipped by Part 10. Same import path `CancelWorkflow.js:2` uses for its own integration. Fires the parent tracker `done` push and surfaces the fire chain as `tracker_fired`.

Note: shipped [`shared/pushWorkflowStatus.js`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.js) names this part as a future caller in its docstring, but the helper is not invoked here — its signature can't carry the `reason` field or a `$set` of defended `references` that the close-write needs. The inline `MongoDBUpdateOne` in step 1 of the Write sequence above subsumes the helper's behaviour for this handler.

Write sequence (same posture as [`CancelWorkflow.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)):

1. Push `completed` status onto the workflow doc — one inline `MongoDBUpdateOne` doing both the defended-`references` `$set` and the `completed` `$push`. Matches [`CancelWorkflow.js:55–69`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)'s shape. The shipped [`shared/pushWorkflowStatus.js`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.js) helper doesn't fit here — its signature doesn't accommodate `reason` on the pushed entry or a `$set` of defended `references`, so inlining keeps the close write to one round-trip.
2. Run the action sweep (the three-step bulk pattern described in the Action sweep bullet above — fetch candidates, in-memory filter against `workflowsConfig`, `MongoDBUpdateMany`).
3. Re-read all actions with `{ status: { $slice: 1 }, action_group: 1 }` projection; recompute `summary` + `groups[]`; one final `MongoDBUpdateOne` writing both.
4. Call `fireTrackerSubscription` (see Tracker fan-up bullet above) to mirror the workflow `completed` push onto a parent tracker action, if any. Returns `[]` when no `parent_action_id` is set — safe to call unconditionally.

Two workflow-doc writes instead of one bundled write — same trade-off `CancelWorkflow.js` already accepts. Event/notifications side-effects are out of scope (see Out of scope below); tracker fan-up is in scope and committed in step 4.

### `close-workflow` operational API

Add a fifth operational API to [part 19](../19-operational-apis/design.md):

- `close-workflow.yaml` — single-step routine invoking `CloseWorkflow` from this part. Payload: `workflow_id` required; `reason`, `references` optional. Returns `{ action_ids, event_id, tracker_fired }`.

Part 19's design and exports list include this fifth API (added during part 19's action-review pass, [review-1 #12](../19-operational-apis/review/review-1.md#12-close-workflow-api-not-yet-in-the-specs-api-list)). Part 20's manifest exports list also adds it.

### Connection schema

No change. Reuses the existing `WorkflowAPI` connection schema from [part 3](../03-engine-plugin-shell/design.md).

## Out of scope / deferred

- **Log event + notifications on close** — same deferral posture as shipped `CancelWorkflow` (which also writes no event in v1; see [`_completed/08-side-effect-dispatch/design.md`](../../_completed/08-side-effect-dispatch/design.md) for the action-side dispatch surface that close could later opt into). Deferred to a follow-on; v1 close writes no event.
- **`fireTrackerSubscription` implementation** — owned by shipped [part 10](../10-tracker-subscription/design.md), which ships the helper, the recursion shape, and the `tracker_fired` return-shape population. This handler reuses the helper as-is; no contract change to Part 10.
- **`CloseWorkflow` button / UI surface** — part 17's `workflow-overview` page is the natural home; opt-in in a follow-up after part 17 lands.
- **Idempotency of double-close** — committed: already-`completed` is a no-op (silently); already-`cancelled` rejects (cancel ≠ close).
- **Backfill / migration** — no live consumers depend on the close handler today (v0's `CloseWorkflowActions` doesn't ship in the current plugin), so no migration concern.

## Depends on

[Part 3](../03-engine-plugin-shell/design.md) (connection scaffold, schemas), [part 4](../04-workflow-config-schema/design.md) (`required_after_close` is in `ACTION_FIELDS`), [part 5](../05-start-cancel-handlers/design.md) (`createMongoDBConnection`, `getActions`, change-stamp threading).

Light dependencies on shipped neighbours (no contract change):

- [Part 7](../../_completed/07-group-state-machine/design.md) — reuses `SubmitWorkflowAction/recomputeGroups.js` for the post-close groups recompute. Part 7's auto-complete bundle at [handleSubmit.js:287–321](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) is left untouched.
- [Part 10](../10-tracker-subscription/design.md) — reuses `SubmitWorkflowAction/fireTrackerSubscription.js` for the tracker fan-up. Called the same way `CancelWorkflow.js` calls it.

## Verification

- Workflow `active` → close → `completed` push lands; summary recomputes.
- Action sweep: non-terminal actions without `required_after_close: true` become `not-required`; actions with `required_after_close: true` stay; blocked actions get swept even when `required_after_close: true`.
- Group recompute with survivors: a group containing a surviving `required_after_close: true` action lands at `in-progress` (or `blocked` if the survivor itself is blocked) — not `done`. The workflow is `completed` with non-`done` groups.
- Already-`completed` close is a no-op (idempotent).
- Already-`cancelled` close rejects with a clear error.
- Reference-key spread on the workflow `completed` push.
- Tracker fan-up: closing a child workflow fires the parent tracker action's `done` push via shipped `fireTrackerSubscription`; `tracker_fired` carries the fire chain in the return shape.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Auto-complete path on a workflow with surviving `required_after_close: true` actions.** Today's auto-complete fires only when every action is terminal. With `required_after_close: true` actions staying open after close, auto-complete inside a re-submit on such an action would push `completed` again on an already-`completed` workflow — caught by the same-stage guard ([engine spec § Idempotency](../../../workflows-module-concept/engine/spec.md#idempotency)), so harmless. Worth confirming with a test in part 22.

## Resolved questions

- **Should `CancelWorkflow` adopt the same sweep filter?** **No.** `required_after_close` applies to close only — cancel's blanket sweep is the v1 contract. v0 had no separate cancel handler (only `CloseWorkflowActions`); the v0 filter never applied to a cancel path because v0 didn't have one. Semantically, cancel is the stronger termination (workflow aborted, not concluded) and audit/notes work is meaningless on a cancelled workflow. The action-authoring spec wording at [action-authoring/spec.md § Terminal-behaviour field](../../../workflows-module-concept/action-authoring/spec.md) was amended to say "completed (close path only)" rather than "completed or cancelled". No follow-up against shipped part 5.

## Contract to neighbours

- **Part 7** (shipped) — no contract change. This part reuses `recomputeGroups.js` as-is; part 7's bundled auto-complete `$set` is left untouched. The shipped `shared/pushWorkflowStatus.js` is NOT used (its signature can't carry `reason` or defended `references`; the handler inlines the workflow-status push instead — see Write sequence step 1).
- **Part 10** (shipped) — this handler calls `fireTrackerSubscription` directly, same posture as `CancelWorkflow.js`. The `completed → done` mapping from Part 10's hard-coded child-stage table fires the parent action's `done` transition.
- **Part 19** adds `close-workflow.yaml` as a fifth operational API.
- **Part 20** adds `close-workflow` to the module manifest's exports.
