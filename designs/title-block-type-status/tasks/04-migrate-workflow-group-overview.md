# Task 4: Migrate workflow-group-overview; wire the group-status enum

## Context

After task 2, the title bar exposes `type`/`status`/`status_enum`/`loading` and no longer reads `badge_text`/`badge_color`. After task 1, `modules/workflows/enums/action_group_statuses.yaml` exists with `done` / `in-progress` / `blocked` entries in the standard enum contract (preserving the current done=green, in-progress=blue, blocked=grey badge colours and the "Done" / "In progress" / "Blocked" labels).

`modules/workflows/pages/workflow-group-overview.yaml` currently sets the title bar (lines ~20–57) with `title: { _state: group.title }`, a back link, and **duplicated inline `_if` chains** for `badge_text` and `badge_color` over `group.status` (done → "Done"/green, in-progress → "In progress"/blue, else → "Blocked"/default).

The page loads via `CallAPI` (`get-action-group-overview`) → `SetState` into `_state.workflow` and `_state.group`. There is **no request** to gate on; gate `loading` on `_state.group`.

There is also a `group_overview_workflow_title` Paragraph block (the parent-workflow context line) below the title bar — leave it as-is.

## Task

In the title-bar vars of `modules/workflows/pages/workflow-group-overview.yaml`:

- **Remove** both inline `_if`-chain `badge_text` and `badge_color` blocks.
- **Add** `type: Workflow` (the eyebrow — this is a workflow's action group; "Workflow" keeps it consistent with the overview page. If a more specific type reads better, prefer the design's intent of naming the entity type; default to `Workflow`).
- **Add** `status: { _state: group.status }` (the rollup slug — `done` / `in-progress` / `blocked`).
- **Add** `status_enum: { _ref: enums/action_group_statuses.yaml }` — reference the **raw `enums/` map directly** (this enum has no `*_display` override var and no `components/` wrapper, per task 1 / the design).
- **Add** `loading: { _not: { _state: group } }`.

Keep `title: { _state: group.title }`, `show_back_button`, and `back_link` unchanged. Leave the rest of the page (workflow context line, progress, action cards) untouched.

## Acceptance Criteria

- The inline `_if`-chain `badge_text`/`badge_color` blocks are gone.
- `type`, `status`, `status_enum`, `loading` are set as above; `status_enum` references `enums/action_group_statuses.yaml` (raw enums path, NOT `components/`).
- `loading` is gated on `_state.group`.
- The status pill reproduces the previous done=green/"Done", in-progress=blue/"In progress", blocked=grey/"Blocked" rendering.
- `pnpm ldf:b` builds successfully.

## Files

- `modules/workflows/pages/workflow-group-overview.yaml` — modify — inline-badge → `status`/`status_enum`; add `type` + `loading`.

## Notes

- Depends on task 1 (the enum file must exist) and task 2 (the prop interface).
- Unlike workflow-overview's lifecycle enum, this one is referenced via the raw `enums/` path because it has no override-merged `components/` wrapper.
