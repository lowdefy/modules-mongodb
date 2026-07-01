# Task 1: Add the action-group status enum

## Context

The group overview page (`modules/workflows/pages/workflow-group-overview.yaml`) currently derives its status badge from two duplicated inline `_if` chains over `group.status`, mapping the three rollup states to a label + colour:

- `done` → "Done", green
- `in-progress` → "In progress", blue
- anything else → "Blocked", grey/default

This is the **action group's rollup status** (the aggregate state across the actions in the group), which is distinct from an individual action's status in `modules/shared/enums/action_statuses.yaml`. Notably `action_statuses.yaml` uses a teal `in-progress`, whereas the group rollup uses blue — so this can't simply reuse `action_statuses.yaml`.

Status enums in this repo follow a standard entry shape consumed by the new title-block status pill:

```yaml
<slug>:
  color: "#e6f7ff" # light fill (pill background)
  borderColor: "#91d5ff" # pill border
  titleColor: "#096dd9" # pill text
  title: Action Required # display label
```

## Task

Create a new enum file `modules/workflows/enums/action_group_statuses.yaml` with three entries — `done`, `in-progress`, `blocked` — that preserve the current colours (done = green, in-progress = blue, blocked = grey) and the current labels ("Done", "In progress", "Blocked"). Use the standard `{ color, borderColor, titleColor, title }` contract.

Match the existing palettes already used in the repo so the result is visually consistent:

- **done** — green family, mirroring `workflow_lifecycle_stages.yaml`'s `completed` / `action_statuses.yaml`'s `done`: `color: '#f6ffed'`, `borderColor: '#b7eb8f'`, `titleColor: '#389e0d'`, `title: Done`.
- **in-progress** — blue family, mirroring `workflow_lifecycle_stages.yaml`'s `active` / `action_statuses.yaml`'s `action-required`: `color: '#e6f7ff'`, `borderColor: '#91d5ff'`, `titleColor: '#096dd9'`, `title: In progress`.
- **blocked** — grey family, mirroring `action_statuses.yaml`'s `blocked`: `color: '#efefef'`, `borderColor: '#aeaeae'`, `titleColor: '#595959'`, `title: Blocked`.

Do **not** create a `modules/workflows/components/action_group_statuses.yaml` wrapper. Per the design, this enum has no `*_display` override var yet, so it is referenced directly as a plain `enums/` map until a concrete per-app override need appears.

## Acceptance Criteria

- `modules/workflows/enums/action_group_statuses.yaml` exists with exactly the three keys `done`, `in-progress`, `blocked`.
- Each entry has `color`, `borderColor`, `titleColor`, and `title`.
- The colours and labels reproduce the current group-overview badge (done=green/"Done", in-progress=blue/"In progress", blocked=grey/"Blocked").
- No `components/action_group_statuses.yaml` wrapper is created.

## Files

- `modules/workflows/enums/action_group_statuses.yaml` — create — the new rollup-status enum.

## Notes

This task only adds the data file; wiring it into the page happens in task 4. The file is consumed there via `_ref: enums/action_group_statuses.yaml` (raw enums path, not `components/`).
