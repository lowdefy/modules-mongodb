# Task 10: Strip authored `link:` from demo workflow configs

## Context

For built-in action kinds (`task`, `form`, `tracker`), the engine now computes `link` per `(kind, stage, access verbs)`. Authors cannot write `link:` in cells for these kinds — the validator added in Task 11 rejects it. Demo configs that still author `link:` must be cleaned up before the validator goes in, or the demo build will fail.

The demo workflow configs sit under `apps/demo/modules/workflows/workflow_config/`. The `install-step` and `track-step-*` actions are built-in kinds and currently author `link:` in their `status_map` cells.

This task also aligns the `install-step` demo with the design's worked example: a templated message that references `{{ metadata.* }}` to exercise the new metadata accumulation and render context.

## Task

1. **`apps/demo/modules/workflows/workflow_config/installation/install-step.yaml`** — strip authored `link:` from every cell. Optionally trim cells to demonstrate sticky display (drop the `not-required` cell, etc.). Update at least one cell's `message` to reference `{{ metadata.* }}` matching the worked example, e.g.:

   ```yaml
   action-required:
     demo: { message: 'Install {{ metadata.physical_id }}.' }
     customer: { message: Installation pending. }
     status_title: Installation pending
   ```

2. **`apps/demo/modules/workflows/workflow_config/onboarding/track-step-*.yaml`** — strip authored `link:` from every cell. No other changes; sticky display means missing stages (e.g. no `action-required` cell) are fine.

3. Walk the rest of `apps/demo/modules/workflows/workflow_config/` and remove any other authored `link:` in cells whose `kind` is `task`, `form`, or `tracker`. Leave `kind: custom` cells alone if any exist (custom kind keeps author-written `link:`).

## Acceptance Criteria

- No `link:` keys remain in `status_map` cells for built-in-kind actions in the demo configs.
- `install-step.yaml` references `{{ metadata.physical_id }}` (or a comparable metadata field) in at least one cell.
- `pnpm ldf:b` (demo build) succeeds.
- The Lowdefy build does not warn about unused `link:` fields in cells.

## Files

- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml` — modify.
- `apps/demo/modules/workflows/workflow_config/onboarding/track-step-*.yaml` — modify (multiple files; one task each).
- Any other demo workflow YAML under `apps/demo/modules/workflows/workflow_config/` that still authors `link:` for built-in-kind cells — modify.

## Notes

The demo display will be blank for these cells until Task 7/8 (engine wiring) lands — that's expected; the cleanup is safe to land first because the engine doesn't read `link:` from cells today anyway.
