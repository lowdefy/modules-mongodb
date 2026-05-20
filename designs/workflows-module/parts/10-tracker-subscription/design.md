# Part 10 — Tracker subscription

**Source rationale:** [workflows-module-concept/engine/spec.md](../../../workflows-module-concept/engine/spec.md). **Layer:** engine handlers. **Size:** S. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Goal

Mirror child workflow status changes into the parent tracker action synchronously and in-process. After this part, completing a child workflow flips the parent's tracker action to `done`; cancelling the child flips it to `not-required`; reopening the child flips it back to `in-progress`.

## In scope

### Trigger sites

The subscription fires inside every handler that changes a workflow's status:

- `SubmitWorkflowAction` — after step 10 (currently no-op). When this submit transitioned the workflow stage (e.g. auto-complete from [part 7](../07-group-state-machine/design.md) pushed `completed`), fire.
- `CancelWorkflow` — after the cancel push. Fires with the cancelled stage.

### Logic

For the workflow whose status just changed:

1. Read `parent_action_id`. If null, no-op.
2. Look up the parent tracker action by primary key. If missing (shouldn't happen, but guard), log and no-op.
3. Apply the hard-coded child-stage map:
   - `active` → `in-progress`
   - `completed` → `done`
   - `cancelled` → `not-required`
4. Push the new status to the parent action (subject to the priority rule; same-stage idempotent no-op).
5. Surface the fan-up on the originating submit response as `tracker_fired: { parent_action_id, parent_workflow_id, new_status }`.

### Implementation

- New file: `src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` (also called from `CancelWorkflow.js`).
- Reuses `updateAction.js` from [part 6](../06-submit-action-writes/design.md) for the parent write.
- The map is module-level constant; not configurable per concept design.

## Out of scope / deferred

- **Hierarchical cancel propagation** (cancel parent ⇒ cancel children). Not in v1. Subscription only goes child→parent.
- **Multi-parent tracker scenarios.** Concept enforces one-parent-per-child in `StartWorkflow` ([part 5](../05-start-cancel-handlers/design.md)).
- **Async / change-stream variant.** Concept defers to a follow-up if multi-process writers surface.
- **Hooks on tracker transitions** — tracker actions never receive user submissions; per-hook contract doesn't apply.

## Depends on

[Part 5](../05-start-cancel-handlers/design.md), [part 6](../06-submit-action-writes/design.md), [part 7](../07-group-state-machine/design.md) (auto-complete is the most common trigger).

## Verification

- Unit tests:
  - `active` push fires parent `in-progress`; `completed` fires `done`; `cancelled` fires `not-required`.
  - No-op when workflow has no `parent_action_id`.
  - Re-firing the same stage is a no-op (priority rule).
  - `tracker_fired` payload populated on the originating submit response.
- Integration test using the worked-example: completing the child `device-installation` workflow flips the parent's `track-installation` to `done` in one server-side call.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Tracker subscription inside the same Mongo client/session** as the originating handler. Yes — synchronous in-process per concept. No transaction wrapping in v1.
- **Whether tracker fires recurse** (parent of parent). Concept doesn't call for it; v1 fires one level. Document explicitly.

## Contract to neighbours

- **Part 11** runs after this part in the lifecycle ordering — `on_complete` fan-out reads `completed_groups`; the tracker subscription updates parent action status (potentially a separate workflow's group state). Document the ordering: tracker subscription writes the parent action; the parent workflow's groups recompute happens on the parent's next submit, not now.
