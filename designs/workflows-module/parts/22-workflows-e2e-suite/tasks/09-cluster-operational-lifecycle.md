# Task 9: Cluster `operational-lifecycle`

## Context

Follows the harness patterns from tasks 2–3. Story: `start` / `cancel` / `close` / `get-entity-workflows` / `get-workflow-overview` end-to-end through the real operational APIs (part 19); the close sweep skips `required_after_close: true` actions; closing an already-completed workflow is a no-op; closing an already-cancelled workflow rejects. Mode: **Tail** — the one browser-free cluster: every call goes through `POST /api/endpoints/workflows/{api-id}` via the `workflow` fixture, assertions via `mdb`.

The API yamls are the contract: `modules/workflows/api/start-workflow.yaml`, `cancel-workflow.yaml`, `close-workflow.yaml`, `get-entity-workflows.yaml`, `get-workflow-overview.yaml` (there is also `get-action-group-overview.yaml` — the design's Verification says "each operational API returns its documented shape", so include it). Close-sweep semantics live in `CloseWorkflow.js` and its unit test (`plugins/.../WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js`) — exhaustive logic is unit-owned; this spec proves each API is **wired and reachable in the running app** and returns its documented shape.

## Task

1. **Fixture workflow** `workflow_config/operational-lifecycle/`: `type: operational-lifecycle`, entity `things-collection`. Three simple check actions, `access.test: { view: true, edit: true }`:
   - `routine-step` — starts `action-required`.
   - `must-finish` — starts `action-required`, **`required_after_close: true`** (spelling per `makeWorkflowsConfig.js` / `loadWorkflowState.js` — verify the exact key in the validator before authoring).
   - `optional-step` — starts `action-required`.
   - `_ref` from `workflows.yaml`.

2. **Spec** `e2e/workflows/operational-lifecycle.spec.js` (use `ldf.user()` once so calls are authenticated; no page navigation otherwise):
   - **start**: `workflow.start` → response shape `{ workflow_id, action_ids }`; `workflows` doc + three `actions` docs exist with starting stages.
   - **get-entity-workflows**: returns the started workflow for the seeded thing, in its documented shape (assert the load-bearing keys, not exhaustive deep-equal).
   - **get-workflow-overview** (and **get-action-group-overview**): documented shape for the started workflow.
   - **close sweep**: complete `routine-step`, leave the others open, `workflow.close` → `optional-step` swept to its closed/not-required stage, **`must-finish` skipped** (still open) per `required_after_close: true`; workflow summary reflects the close.
   - **close idempotency**: fully complete a second workflow instance (all actions done, workflow completed) → `workflow.close` is a no-op (2xx, no state change — snapshot the docs before/after).
   - **close-after-cancel rejects**: third instance, `workflow.cancel` (assert cancel semantics: workflow + open actions land cancelled stages), then `workflow.close` with `expectError: true` → rejected, error shape asserted, no state change.

## Acceptance Criteria

- Spec green in the full suite, with zero `page.goto` calls (tail purity — `ldf.user()` session setup excepted).
- All six operational APIs called over real HTTP and their documented response shapes asserted.
- `required_after_close: true` proven to survive the close sweep while a sibling is swept.
- No-op close and rejected close both asserted with before/after DB comparison.

## Files

- `apps/workflows-test/modules/workflows/workflow_config/operational-lifecycle/operational-lifecycle.yaml` + per-action yamls — create
- `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` — modify (add `_ref`)
- `apps/workflows-test/e2e/workflows/operational-lifecycle.spec.js` — create

## Notes

- This cluster needs three independent workflow instances; `workflow.start` against three seeded things (or the same thing three times if the engine allows concurrent instances — check; one thing each is simpler and avoids coupling to instance-uniqueness rules, which are not this cluster's story).
- Close/cancel edge logic beyond the three named cases is unit-owned — don't grow the matrix here.
