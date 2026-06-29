# Task 12: Retarget e2e specs and fixtures from `workflow-action-*` to `{workflow_type}-check`

> **Status (as-built):** Parts 1, 2, 4 shipped — all check-link navigations and
> fixture comments retargeted to `{workflow_type}-check` (onboarding,
> check-blocked-by, error-recovery, tracker-child), and the `entity_view` slot was
> wired into the demo `onboarding` workflow (`lead-detail-slot.yaml` +
> `entity.name_field: name`) so the slot bakes into the form pages and the
> `onboarding-check` page. **Part 3 (the new three-tier render + cross-action-nav
> spec) was intentionally skipped** — the only Part 22 spec is quarantined
> (`test.skip`), e2e cannot run in the build sandbox, and live three-tier coverage
> is a `/r:dev-test` deliverable. See the "Implementation notes (as-built)" section
> of `design.md`.

## Context

Retargeting check links to the per-workflow `{workflow_type}-check` page (Tasks 2

- 10. and retiring the shared pages (Task 11) breaks every e2e spec that
      navigates to, waits for, or asserts the old `workflow-action-{view,edit,review}`
      URLs for a **check** action. Those specs and their fixture comments must move to
      the new page id. (Form-action navigations are unaffected.)

## Task

1. **`apps/demo/e2e/workflows/onboarding-happy-path.spec.js`** — the
   `waitForURL` / URL assertions on `workflow-action-edit` / `-review` for
   **check** steps (around `:124, 314, 361, 425, 595`) and the negative
   `not.toContain('workflow-action-edit')` checks: retarget to the workflow's
   `{workflow_type}-check` page id. (Confirm which workflow type the onboarding
   check actions belong to and use that exact id.)

2. **`apps/workflows-test/e2e/workflows/check-blocked-by.spec.js`** — the URLs and
   `toHaveURL(/workflow-action-*/)` assertions (around `:79, 95, 102, 124`)
   retarget to `{workflow_type}-check`. Update the surrounding fixture comments:
   - `check-blocked-by.yaml` (~`:12`)
   - `second-check.yaml` (~`:3`)

3. **Part 22 e2e (`apps/demo` / `apps/workflows-test`)** — add/extend coverage
   for the three-tier workspace: three-tier render (left/middle/RHS), cross-action
   navigation via the left panel (check included, via the degrade path), and — per
   the design's Verification — a workflow fixture that declares `entity_view` so
   the Details tab (form) / middle slot (check) is exercised.

4. Grep the e2e trees for any remaining `workflow-action-` references on check
   paths and retarget them; ensure no spec still navigates to a deleted page id.

## Acceptance Criteria

- No e2e spec or fixture comment references `workflow-action-{view,edit,review}`
  for a check action; check navigations target `{workflow_type}-check`.
- The onboarding happy-path and `check-blocked-by` specs pass against the new
  pages (run by a human / `/r:dev-test` with real secrets + MongoDB — not part of
  an autonomous build gate).
- Part 22 covers three-tier render + cross-action navigation, with an
  `entity_view` fixture exercising the slot.

## Files

- `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — modify — retarget check-step URLs/assertions.
- `apps/workflows-test/e2e/workflows/check-blocked-by.spec.js` — modify — retarget URLs + `toHaveURL` assertions.
- `apps/workflows-test/modules/workflows/workflow_config/.../check-blocked-by.yaml`, `.../second-check.yaml` — modify — update fixture comments.
- Part 22 e2e spec(s) + a fixture declaring `entity_view` — create/modify — three-tier render + cross-action navigation coverage.

## Notes

- e2e runs need real secrets and a reachable MongoDB; do not run them in the
  sandbox build gate. Verify the retarget by inspection + a human/`dev-test` run.
- Determine the exact `{workflow_type}` for each check action from its workflow
  config fixture before hard-coding the new id.
- This is the last task — it depends on the new pages existing (Task 10) and the
  old ones being retired (Task 11).
