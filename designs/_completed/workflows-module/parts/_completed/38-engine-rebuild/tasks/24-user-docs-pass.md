# Task 24: User documentation pass

> **Executed ahead of Bands 4–5 landing** (user direction: document the design's target state, assuming tasks 17/18/19 implement as specced). Docs updated: `modules/workflows/README.md` (full pass below), `modules/workflows/module.lowdefy.yaml` (var descriptions: `entity_ref_key` in `workflows_config`, priority-logic phrasing in `action_statuses_display`), `plugins/modules-mongodb-plugins/README.md` (peer deps `mongodb`/`community-plugin-mongodb`, `WorkflowAPI` row), repo `README.md` (dependency graph `workflows --> notifications`). `docs/idioms.md` checked — no cross-cutting idiom changed, untouched. Residual: when tasks 17–19 land, re-verify the README claims against the landed code (the acceptance criteria below); task 18 no longer needs its own README Pages-table edit (done here).

## Context

Several tasks change contracts that `modules/workflows/README.md` documents for module consumers, and each deferred the README update to a docs pass rather than bundling it with engine work (tasks 4, 14, 19). This task is that pass. Per CLAUDE.md: the manifest is the source of truth for var schema — README restates it in narrative form; if they disagree, the manifest wins.

## Collected deferrals

- **From task 4** — README "Vars" section sync with the rewritten manifest descriptions (`changeLog`/`priority` description rewrites; `entry_id` wiring).
- **From task 14** — Document the post-hook contract in the module README: "writes are out-of-band" framing and the author-side idempotency obligation on post-hook routines (D6).
- **From task 19** — README "API Endpoints" section: the generated hook endpoint pattern `{workflow_type}-{action_type}-{interaction}-{phase}` becomes signal-keyed (`{signal}`; list is `submit, progress, not_required, resolve_error, approve, request_changes` — no `submit_edit`); the per-action submit endpoint description reflects the final payload mapping (`signal`, no `force`/`interaction`/`current_status`); the `start-workflow` row notes the `{ type, status }` seed grammar (legal seeds `action-required` | `blocked`) and the `metadata` payload field.
- **General sweep** — Any remaining stale interaction-key / `force` / `current_status` references in README prose and the "Transition model (signals)" section; verify against the landed code, not the design.

## Acceptance Criteria

- `modules/workflows/README.md` matches the implemented post-rebuild surfaces (vars, API endpoints, hook contract); no stale interaction keys or `force` references remain.
- README "Vars" narrative agrees with `module.lowdefy.yaml` descriptions.

## Files

- `modules/workflows/README.md` — modify
- `docs/idioms.md` — check (touch only if a cross-cutting idiom changed)

## Notes

- Depends on tasks 14, 17, 18, 19 (documents their landed state). Task 18 edits its own README Pages-table rows directly — don't duplicate.
