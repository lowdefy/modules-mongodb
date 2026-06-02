# Task 20: Demo app migration (end-to-end)

## Context

The demo app's `workflow_config/` is the **only in-tree end-to-end exercise** of the engine — without migrating it together, there is no integration test of the rebuild until external app migrations run (Proposed change #13). This task migrates the demo to the new payload + pre-hook return shapes (signals, no `force`), the Part 34 per-verb access map, the per-verb client mirror, and the new lifecycle event types. It is the capstone, depending on the rebuilt handlers (15, 17), the read path (7), the client component (8), the display renames (18), and the payload surfaces (19).

## Task

**`apps/demo/modules/workflows/workflow_config/*.yaml`:**

- Strip `force: true` everywhere.
- Add the **required `entity_ref_key`** to every workflow config (`installation.yaml`, `onboarding.yaml`: `entity_ref_key: lead_ids`, beside `entity_collection: leads-collection`) — the engine now reads it for event references instead of deriving `leads_ids` from the collection name (task 6 validation; design "Event references"). The lead page timeline (`lead-view.yaml:208`, `reference_field: lead_ids`) starts surfacing engine-written workflow events as a result.
- Convert pre-hook returns from `{ type, status }` → `{ type, signal }`.
- Re-key `hooks:` blocks from interaction names to signal names (`hooks.submit_edit` → `hooks.submit`), per the action-authoring grammar (hooks are keyed by button-surfaced signal name).
- **Replace the raw-insert spawn with an engine spawn.** Delete `apps/demo/api/onboarding-spawn-proof-of-installation-actions.yaml` (it hand-builds action docs via `MongoDBInsertMany`, bypassing the engine entirely — under the rebuild those docs would lack the rendered display cell, per-verb `links`, audit-log entries, and `event_id` threading the engine commits, and would silently diverge from the read path). The qualify pre-submit hook instead returns one `actions[]` entry per captured device serial: `{ type: proof-of-installation, key: <device_serial>, signal: block, upsert: true }` — the engine creates each keyed instance via the FSM `none` row at `blocked` (D4 / state-machine.md § Creation).
- Convert page-template button bars to **signal-emitting** form (per state-machine.md) — buttons fire `signal: ...`, not status/force.
- Migrate every action's `access` to Part 34's per-verb verb→gate map (`access.{app}: { view: true | [roles], edit: ..., review: ..., error: ... }`).
- Strip authored `link:` from status_map cells (per Part 30's existing demo migration item — built-in kinds reject `link:`; engine computes links).

**`apps/demo/modules/workflows/workflow_config/installation/install-step.yaml`:**

- Migrate `access.demo` from the old nested `{ roles, verbs }` shape to the Part 34 verb→gate map (e.g. `demo: { view: [admin] }`).

**`action_role_check` consumers (Part 18 / Part 34 D8):**

- Demo page templates read the per-verb `_state.action_allowed: { view, edit, review, error }` (the component itself is migrated in task 8; this migrates the demo's template consumers).

**Demo notification config:**

- Add subscriptions or filters for the new `workflow-started` / `workflow-cancelled` / `workflow-closed` event types as appropriate. Default policy is "ignore unless explicitly wired" — wire **one** notification to demonstrate, leave the rest ignored.

## Acceptance Criteria

- No `force` remains in demo `workflow_config`; no `{ type, status }` pre-hook returns remain; `hooks:` blocks are signal-keyed (no `submit_edit` keys).
- `apps/demo/api/onboarding-spawn-proof-of-installation-actions.yaml` is deleted; proof-of-installation instances are spawned via the qualify pre-hook's `actions[]` upsert entries and carry engine-written display cells, per-verb `links`, and audit entries (verify by inspecting a spawned doc).
- Demo button bars emit signals; demo action `access` blocks are all per-verb verb→gate maps; `install-step.access.demo` migrated.
- No authored `link:` in demo status_map cells.
- Demo page templates read the per-verb `action_allowed` bag.
- Demo notification config handles the new lifecycle event types (one wired, rest ignored).
- **End-to-end smoke test per demo workflow** (Playwright-style): start the workflow and walk its **happy path** (qualify → quote → review → approve → keyed installs → tracker child → complete), verifying the display surfaces render the expected `action.{appName}.message` and the per-verb links land the right pages. This is the integration test that catches resolver wiring, build-time validation, callApi boundaries, and page rendering that unit/integration tests miss. **Scope is the example's happy path only** — exhaustive FSM/state coverage (every signal, error recovery, cascades, upsert spawn, tracker recovery, close) is owned by [Part 22](../../_next/22-workflows-e2e-suite/design.md) and its dedicated `test` coverage workflow, not this task.

## Files

- `apps/demo/modules/workflows/workflow_config/*.yaml` — modify (signals, signal-keyed hooks, access maps, strip force/links, button bars)
- `apps/demo/api/onboarding-spawn-proof-of-installation-actions.yaml` — **delete** (replaced by qualify pre-hook `actions[]` upsert entries); remove its `_ref` from the `apis:` section of `apps/demo/lowdefy.yaml`
- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/qualify-pre-submit.yaml` — modify (return upsert spawn entries instead of calling the spawn Api)
- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml` — modify (access.demo verb→gate map)
- demo page templates consuming `action_role_check` — modify (per-verb bool)
- demo notification config — modify (new event types)
- demo end-to-end smoke test(s) — create

## Notes

- Engine-internal apps with custom workflow configs (out of repo) get a separate migration doc — out of scope here. The in-repo demo is the canonical example.
- Non-goal: no action-doc backfill — the demo seeds no action docs (they're created at runtime by starting a workflow), so there's nothing stale to migrate; a developer with stale local action docs just re-runs the workflow.
- This task should land last; it validates the whole rebuild integrated.
