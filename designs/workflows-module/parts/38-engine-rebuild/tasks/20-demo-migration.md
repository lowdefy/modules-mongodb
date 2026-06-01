# Task 20: Demo app migration (end-to-end)

## Context

The demo app's `workflow_config/` is the **only in-tree end-to-end exercise** of the engine — without migrating it together, there is no integration test of the rebuild until external app migrations run (Proposed change #13). This task migrates the demo to the new payload + pre-hook return shapes (signals, no `force`), the Part 34 per-verb access map, the per-verb client mirror, and the new lifecycle event types. It is the capstone, depending on the rebuilt handlers (15, 17), the read path (7), the client component (8), the display renames (18), and the payload surfaces (19).

## Task

**`apps/demo/modules/workflows/workflow_config/*.yaml`:**

- Strip `force: true` everywhere.
- Convert pre-hook returns from `{ type, status }` → `{ type, signal }`.
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

- No `force` remains in demo `workflow_config`; no `{ type, status }` pre-hook returns remain.
- Demo button bars emit signals; demo action `access` blocks are all per-verb verb→gate maps; `install-step.access.demo` migrated.
- No authored `link:` in demo status_map cells.
- Demo page templates read the per-verb `action_allowed` bag.
- Demo notification config handles the new lifecycle event types (one wired, rest ignored).
- **End-to-end smoke test per demo workflow** (Playwright-style): start the workflow, transition through all states, verify the display surfaces render the expected `action.{appName}.message` and the per-verb links land the right pages. This is the integration test that catches resolver wiring, build-time validation, callApi boundaries, and page rendering that unit/integration tests miss.

## Files

- `apps/demo/modules/workflows/workflow_config/*.yaml` — modify (signals, access maps, strip force/links, button bars)
- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml` — modify (access.demo verb→gate map)
- demo page templates consuming `action_role_check` — modify (per-verb bool)
- demo notification config — modify (new event types)
- demo end-to-end smoke test(s) — create

## Notes

- Engine-internal apps with custom workflow configs (out of repo) get a separate migration doc — out of scope here. The in-repo demo is the canonical example.
- Non-goal: no action-doc backfill — the demo seeds no action docs (they're created at runtime by starting a workflow), so there's nothing stale to migrate; a developer with stale local action docs just re-runs the workflow.
- This task should land last; it validates the whole rebuild integrated.
