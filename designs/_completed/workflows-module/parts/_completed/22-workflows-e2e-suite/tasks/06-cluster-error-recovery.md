# Task 6: Cluster `error-recovery`

## Context

Follows the `form-lifecycle` template (task 3). Story: an error-verb action — a pre-hook cascades `error` → the action lands the error stage, a timeline **event** and a **notification** fire, the emitted `-error` page is reachable per the `error` verb, then `resolve_error` → in-review → `approve` → done. This revives the intent of the demo's old skipped `apps/demo/e2e/workflows/error-push-and-resolve.spec.js` (deleted in task 11 once this lands). Mode: **Spine**.

This cluster is also the suite's designated home for the design's third "only e2e can prove" item: **real cross-module `callApi`**. The plugin integration tests mock `callApi`; here a submit must be observed writing a timeline event via the events module's `new-event` API and dispatching via the notifications module's `send-notification` API — through the real endpoints, asserted via `mdb` reads. Verified collection names: events land in **`log-events`** (`modules/events/connections/events-collection.yaml`), notifications in **`notifications`** (`modules/notifications/connections/notifications-collection.yaml`).

## Task

1. **Fixture workflow** `workflow_config/error-recovery/`: `type: error-recovery`, entity `things-collection`. Actions:
   - `trigger` — `kind: form` (or check), starts `action-required`, `access.test: { view: true, edit: true }`. Its `submit` pre-hook returns `actions: [{ type: fragile, signal: error }]` (the production mechanism, same as task 5).
   - `fragile` — `kind: form`, starts `action-required`, `access.test: { view: true, edit: true, error: true, review: true }` — the `error` verb makes `makeActionPages` emit the `error-recovery-fragile-error` page from `templates/error.yaml.njk`; `review` covers the post-resolve approval. `status_map` messages for the error stage and the recovery stages.
   - `_ref` from `workflows.yaml`.

2. **Spec** `e2e/workflows/error-recovery.spec.js`, one sequential story:
   - Seed thing, `workflow.start`. Submit `trigger` through its real edit page (spine).
   - Assert `fragile` lands the error stage (`workflow.assertStatus`) and `thing-view` shows the error state.
   - **Cross-module dispatch**: poll `mdb.collection('log-events')` for the event the engine logged for this transition, and `mdb.collection('notifications')` for the dispatched notification — both keyed to this action/workflow, both written by the real `events.new-event` / `send-notification` endpoints, not mocks.
   - **Error page reachable**: open `/workflows/error-recovery-fragile-error?action_id=...`; assert it renders the error surface (message from `status_map`, resolve affordance).
   - **Recovery**: fire `resolve_error` from that page → `in-review`; approve from the review page → `done`. Spine closure on `thing-view`.

## Acceptance Criteria

- Spec green in the full suite.
- The emitted `error-recovery-fragile-error` page renders — the `error` verb's page surface is proven reachable (no other cluster covers an `-error` page).
- Event and notification documents are asserted via `mdb` reads in `log-events` and `notifications` — the design's Verification item "real cross-module dispatch is observed end-to-end" is satisfied by this spec.
- Full recovery path lands `done` with each hop asserted in DB.

## Files

- `apps/workflows-test/modules/workflows/workflow_config/error-recovery/error-recovery.yaml` + per-action yamls — create
- `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` — modify (add `_ref`)
- `apps/workflows-test/e2e/workflows/error-recovery.spec.js` — create

## Notes

- The notifications module may require notification-type config for `send-notification` to dispatch (check `modules/notifications/api/send-notification.yaml` and the module manifest's vars wired in task 1). If the engine's dispatch needs a configured notification type, add the minimal config to the test app's notifications vars — that's substrate, not speculative surface.
- Exact signal names (`resolve_error`) and the error-stage name: read from the shipped FSM tables / part 38 design, not from this prompt.
