# Task 9: Documentation, parent-design row, full verification

## Context

Tasks 1–8 changed the workflows module's public surface (a new exported
component, new block events, rewritten shared pages). Per the repo's
documentation rules, the per-module README and the plugin docs must reflect
the final state, and the design's "Parent design" section asks for a Part 40
row in the parent follow-on table. The concept docs need **nothing** — the
design's reconciliation table was applied 2026-06-10.

## Task

1. **`modules/workflows/README.md`**:
   - Exports: add `check-action-modal` (what it is, the fixed
     blockId + open contract in one or two sentences, the
     "bundled by `actions-on-entity`; host pages compose it with
     `EventsTimeline.onActionClick`" rule, the `on_complete` var).
   - Pages: update the `workflow-action-edit` / `-view` / `-review`
     descriptions to the signal model (no status selector; signal button bar
     resolved server-side via `GetWorkflowAction`; error recovery =
     `resolve_error` on the view page).
   - No new module vars — the manifest's `vars:` section is untouched by this
     part (`allow_not_required` is per-action workflow config, validated by
     Part 46's `makeWorkflowsConfig`, not a module var).
2. **`plugins/modules-mongodb-plugins/README.md`** — if the package overview
   lists block capabilities/events, mention `onActionClick` on `ActionSteps`
   and `EventsTimeline` (the per-block READMEs were updated in tasks 1–2).
3. **Parent design** — `designs/workflows-module/design.md`: add a Part 40 row
   to the follow-on parts table (depends on Parts 46, 34, 35, 38, 24; lands
   after 46, which owns the `GetWorkflowAction` contract this part renders
   from; note Part 42 — shipped — consumes this part's modal via host
   composition). The design also says to flag Part 34's sequencing — Part 34
   is in `_completed` now, so listing it as a satisfied dependency suffices;
   no graph re-slotting note is needed.
4. **`designs/workflows-module/implementation-plan.md`** — the Part 40 row's
   status currently reads "📐 design only — stale tasks deleted (review-4 #9);
   regenerate after 46". Update it to reflect that tasks exist /
   implementation is underway, matching the plan's status vocabulary used by
   the other rows.
5. **Full verification**:
   - `pnpm build` (repo root — plugin + module packages);
   - `pnpm test` (root jest — connection tests + the new block tests);
   - the demo app's lowdefy build (`apps/demo`, per its package scripts)
     completes with no missing-`_ref`, duplicate-requestId, or operator
     errors.

## Acceptance Criteria

- Module README documents the new export and the rewritten pages; manifest
  and README agree (manifest is the source of truth).
- Parent design table carries the Part 40 row; implementation-plan status is
  current.
- All three verification commands pass.

## Files

- `modules/workflows/README.md` — modify — exports + page descriptions
- `plugins/modules-mongodb-plugins/README.md` — modify (if applicable) — block events
- `designs/workflows-module/design.md` — modify — Part 40 follow-on row
- `designs/workflows-module/implementation-plan.md` — modify — Part 40 status

## Notes

- Client-name rule: no client/app names in any of these docs — "the reference
  project" / generic phrasing only.
- Do not touch `designs/workflows-module/parts/_completed/` content.
