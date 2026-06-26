# Task 7: Cluster `tracker-child`

## Context

Follows the `form-lifecycle` template (task 3). Story: a parent workflow with a `kind: tracker` action mirroring a child workflow — start child → `internal_mirror_child_active` pulls the parent action to in-progress; child completes → parent done; child cancels → parent not-required; **terminal-row recovery** (child reactivates after the parent action already landed a terminal stage). Mode: **Spine + Tail**.

Authoring reference: `apps/demo/modules/workflows/workflow_config/onboarding/track-company-setup.yaml` (`kind: tracker`, `tracker.child_workflow_type` — part 48's rename of `tracker.workflow_type`, `tracker.start_link` with `action_id`/`entity_id` urlQuery → the tracker action `_id` becomes the child's `parent_action_id`). Tracker cascade logic (multi-level, depth guard, FSM no-op) is unit-owned (`runTrackerCascade.test.js`, tracker FSM table 6×7 in `fsm/tables.test.js`); this cluster proves the mirror fires through the wired app, including across **two workflow docs**.

## Task

1. **Fixture workflows** `workflow_config/tracker-child/` — two workflow types:
   - `tracker-parent` — entity `things-collection`. Actions: a `track-child` action, `kind: tracker`, starts `action-required`, `tracker.child_workflow_type: tracker-child-flow`, `tracker.start_link` pointing at `thing-view` (or the simplest page that can carry the query params), `access.test: { view: true, edit: true }`, `status_map` messages per stage (copy the demo tracker's stage list).
   - `tracker-child-flow` — entity `things-collection`, one or two simple check actions so it can be completed quickly.
   - Both `_ref`'d from `workflows.yaml`.

2. **Spec** `e2e/workflows/tracker-child.spec.js`:
   - **Spine — mirror up**: seed thing, start `tracker-parent`. Start the child via `workflow.start({ workflow_type: 'tracker-child-flow', entity, parent_action_id })` — the real operational API, the same call the start_link page would make (assert the start_link renders on the parent's surface too). Assert `internal_mirror_child_active` pulled `track-child` to in-progress (DB + thing-view UI).
   - **Spine — child completes**: complete the child's actions through their real pages → child workflow completes → parent `track-child` flips to done. Assert parent workflow summary via `workflow.assertSummary`.
   - **Child cancels** (fresh parent+child pair): `workflow.cancel(child_id)` → parent action lands not-required.
   - **Tail — terminal-row recovery**: with the parent action at a terminal stage (done via the completed pair, or repositioned with `workflow.setStage`), reactivate the child (e.g. a child action transitions back out of terminal through its real endpoint, or a new child start — per the shipped recovery semantics in the tracker FSM table) and assert the parent action leaves its terminal row accordingly. Seed-state + real endpoint only; no backdoor.

## Acceptance Criteria

- Spec green in the full suite.
- All three mirror directions proven across two real workflow docs: child active → parent in-progress; child complete → parent done; child cancel → parent not-required.
- Terminal-row recovery asserted through real endpoints (tail), matching the shipped tracker FSM row.
- The parent's `start_link` surface gets at least a render assertion (the link with its `action_id`/`entity_id` query).

## Files

- `apps/workflows-test/modules/workflows/workflow_config/tracker-child/tracker-parent.yaml`, `tracker-child-flow.yaml` + per-action yamls — create
- `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` — modify (add two `_ref`s)
- `apps/workflows-test/e2e/workflows/tracker-child.spec.js` — create

## Notes

- Verify how the child start carries `parent_action_id` (payload key on `start-workflow` — see `modules/workflows/api/start-workflow.yaml`) before writing the fixture helper call.
- Spec titles in concept-doc language, e.g. `"completing the child workflow flips the parent tracker to done"` (the design quotes exactly this).
- Exhaustive tracker-table coverage stays in `fsm/tables.test.js` — representative transitions only.
