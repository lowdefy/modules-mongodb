# Task 10: Demo deals vars + full runtime verification + host-reconstitution gate

## Context

Final integration for Workstream C. Tasks 1–9 generalized the module, extracted the shared components, and authored the onboarding workflow + quote-builder page. This task points the demo's deals module at the onboarding workflow and verifies the whole rework end to end.

## Task

Update `apps/demo/modules/deals/vars.yaml`:
- `workflow_type: sales-pipeline → onboarding`;
- extend `stages` / `action_groups` / `outcomes` vars to cover onboarding's slugs (so stage chips + action-group headers + outcome badge render);
- confirm `company_fields` / `info_grid_slots` still resolve (the volumes tile, now host-supplied per task 2, either stays via `info_grid_slots` or is dropped for the generic demo);
- confirm `entity_connection_id` (task 1) is left at default `deals` matching the app connection + the workflow's `entity.connection_id`.

Then run full verification.

## Acceptance Criteria

- `CI=true pnpm ldf:b` (from `apps/demo`) green; `pnpm docs:check` green; a changeset exists for every module whose package changed across tasks 1–9 (deals, workflows, activities, events).
- **Demo runtime walkthrough:** create a deal → walk the onboarding workflow → confirm stage advances, the **open-actions and open-tasks cards** render, task create/update works, an @mention **note appears in the Events tab**, a **check-action opens the in-context modal**, and **Won/Lost outcome + value/close render from the stored fields**.
- **No consumer-specific identifiers** reintroduced on the full diff.
- **Host-reconstitution gate (manual, record only):** confirm on paper (or via a host-side check by someone with host access) that the host can reproduce its current deal list/detail using only config — value/close from stamped fields, volumes tile via `info_grid_slots`, `entity_connection_id` var, and the extracted components driven by the host's vars. This gate is not automatable in this repo's CI; record its status. The host-side backfill migration (existing deals → stamped `value`/`close_date`) is a Phase-D concern, not part of this task.

## Files

- `apps/demo/modules/deals/vars.yaml` — modify — workflow_type + stages/groups/outcomes.
- `apps/demo/menus.yaml`, `apps/demo/pages/home.yaml` — modify (if needed) — ensure deals links still resolve.

## Notes

Depends on all prior tasks (1–9). This is the fold-in verification vehicle for PR #111. If the accumulated diff is unwieldy, this is the decision point to fall back to a stacked follow-up PR (per the design's Sequencing).
