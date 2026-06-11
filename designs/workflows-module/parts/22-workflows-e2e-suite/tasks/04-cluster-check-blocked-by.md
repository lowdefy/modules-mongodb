# Task 4: Cluster `check-blocked-by`

## Context

Follows the `form-lifecycle` template (task 3). Story: check actions with a **type dep** and a **group-id dep**; completing the blocker fires the engine's `unblock` and the dependent becomes action-required. Mode: **Spine**.

Two surfaces this cluster owns:

- `kind: check` actions use the **static shared pages** `workflow-action-edit` / `-view` / `-review` (in `modules/workflows/pages/`), addressed by `?action_id=` — this cluster is the suite's coverage home for those pages rendering and serving check actions in a running app (the form clusters cover the per-action emitted pages instead).
- `blocked_by` semantics: an action's `blocked_by` entries may name an action **type** or an action-**group id** (groups are blocked_by *targets*, never carriers — see the comment in `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml`). The unblock fixpoint logic itself is unit-owned (`planAutoUnblock.test.js`); this spec proves it fires through the wired app.

Authoring reference for `blocked_by`: `onboarding/send-quote.yaml` (`blocked_by: [qualify]`), `track-company-setup.yaml`.

## Task

1. **Fixture workflow** `workflow_config/check-blocked-by/`: `type: check-blocked-by`, entity `things-collection`, `entity_ref_key: thing_ids`. Two groups (e.g. `prep` and `launch`) and four check actions, all `access.test: { view: true, edit: true }`:
   - `first-check` — group `prep`, starts `action-required`.
   - `second-check` — group `prep`, starts `action-required` (so group `prep` completes only when both are done).
   - `needs-type` — group `launch`, `blocked_by: [first-check]`, starts `blocked`.
   - `needs-group` — group `launch`, `blocked_by: [prep]` (the group id), starts `blocked`.
   - `status_map` messages for `blocked` / `action-required` / `done` on each.
   - `_ref` from `workflows.yaml`.

2. **Spec** `e2e/workflows/check-blocked-by.spec.js`:
   - Seed a thing, `workflow.start`. Assert initial stages: two action-required, two blocked.
   - **Type dep**: from `/thing-view`, click through the `actions-on-entity` row for `first-check` to `/workflows/workflow-action-edit?action_id=...`; assert the static page renders the check action; complete it via its real button → `first-check` done, `needs-type` flips to `action-required` (DB + UI on thing-view), while `needs-group` stays `blocked` (second-check still open).
   - **Group dep**: complete `second-check` → group `prep` completes → `needs-group` flips to `action-required`. Assert the group recompute via `workflow.assertGroups`.
   - **Static page sweep**: assert `workflow-action-view?action_id=` renders for a done action and `workflow-action-review?action_id=` renders (or cleanly rejects) per the pages' contracts — the design's Verification requires every static shared check page proven reachable. If `review` requires the verb, give one action `review: true` to make the page reachable honestly.
   - **Overview pages**: open the two static overview pages (`workflow-overview`, `workflow-group-overview`) for the started workflow and assert each renders its group-structured state — one render assertion each. This cluster is the suite's only coverage of these two pages (design § Cluster fixtures).
   - Blocked actions: assert the blocked state's UI affordance (no actionable button / blocked message from `status_map`).

## Acceptance Criteria

- Spec green in the full suite run.
- Both dependency kinds proven: completing a type blocker and completing a group unblocks the respective dependent, asserted in DB **and** reflected on `thing-view`.
- All three static shared pages (`workflow-action-edit`, `-view`, `-review`) get a render assertion against a check action in this app.
- `workflow-overview` and `workflow-group-overview` each get a render assertion against the group-structured workflow.
- No enumeration of FSM cells — representative transitions only.

## Files

- `apps/workflows-test/modules/workflows/workflow_config/check-blocked-by/check-blocked-by.yaml` + per-action yamls — create
- `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` — modify (add `_ref`)
- `apps/workflows-test/e2e/workflows/check-blocked-by.spec.js` — create

## Notes

- Exact stage names and the check action's completing signal: take from the shipped FSM tables (`fsm/tables.test.js` asserts every cell — read, don't guess) and part 43's design (`kind: check` + `action-*` pages).
- Blocked-by fixpoint edge cases (keyed terminality etc.) are explicitly out of scope here — unit-owned (`planAutoUnblock.test.js`); see task 13.
