# Task 3: Update Demo `workflow_config` to Use `kind: simple` and `simple-edit` Page Refs

## Context

Tasks 1 and 2 have landed: the workflows module's validator accepts `kind: simple` (and rejects `kind: task`), the three shared pages are renamed (`simple-edit.yaml`, `simple-view.yaml`, `simple-review.yaml`) with new inner IDs, and the manifest's `pages:` list references the new filenames.

The demo app at `apps/demo/` has two workflow_config files that still declare `kind: task`:
- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml`
- `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml`

The `schedule-followup.yaml` file additionally references `_module.pageId: { id: task-edit, module: workflows }` in its link cells (two such references per the design — used to wire status-map cells to the shared edit page).

The other four onboarding workflow configs (`qualify`, `send-quote`, `track-installation`, `proof-of-installation`) use `kind: form` or `kind: tracker` and are not touched by this task.

This task flips both demo files and verifies the build resolves cleanly. With Tasks 1, 2, and 3 all landed, `pnpm build` for `apps/demo` must succeed.

## Task

### Demo workflow_config files

1. **`apps/demo/modules/workflows/workflow_config/installation/install-step.yaml`** — Flip `kind: task` → `kind: simple`. Single site.

2. **`apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml`** —
   - Flip `kind: task` → `kind: simple` (one site).
   - Flip both `_module.pageId: { id: task-edit, module: workflows }` references → `id: simple-edit`. (Two sites per the design.) These are inside link cells of the status-map config.

### Sweep check

Search `apps/demo/modules/workflows/workflow_config/` for any remaining `kind: task` or `task-edit` / `task-view` / `task-review` page-ID references. There should be none after this task.

### Build verification

Run `pnpm build` (or the project's build command) for `apps/demo`:

- The validator must accept `kind: simple` for both demo files and produce no validation errors.
- The build must resolve `_module.pageId: { id: simple-edit, module: workflows }` in `schedule-followup.yaml` without an "unknown pageId" warning.
- The build should complete with no new errors or warnings introduced by the rename.

If stale entries in `apps/demo/.lowdefy/server/build/pages/workflows/` are suspected (e.g. lingering `task-edit.json`), run `pnpm clean && pnpm build` to regenerate the cache from scratch.

## Acceptance Criteria

- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml` has `kind: simple`.
- `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml` has `kind: simple` and two `_module.pageId: { id: simple-edit, module: workflows }` references.
- A search across `apps/demo/modules/workflows/workflow_config/` for `kind: task`, `task-edit`, `task-view`, `task-review` returns no hits.
- `pnpm build` for `apps/demo` completes successfully with no validation errors and no unresolved-pageId warnings.
- After build, `apps/demo/.lowdefy/server/build/pages/workflows/` contains `simple-edit.json`, `simple-view.json`, `simple-review.json` and not the `task-*.json` equivalents.

## Files

- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml` — modify — flip `kind: task` → `kind: simple`.
- `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml` — modify — flip `kind: task` → `kind: simple` (one site) and two `_module.pageId: { id: task-edit }` → `id: simple-edit`.

## Notes

- Do not touch the other four onboarding workflow configs (`qualify`, `send-quote`, `track-installation`, `proof-of-installation`) — they use `kind: form` or `kind: tracker`.
- This task depends on Tasks 1 and 2 landing first. If only Task 1 has landed, the build fails on unresolved page IDs; if only Task 2 has landed, the build fails on unknown `kind: simple`. All three must be in the same build cycle.
- If the build fails after this task with an unrelated error, do not amend the kind values to work around it — diagnose the underlying issue separately.
