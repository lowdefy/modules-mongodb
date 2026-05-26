# Task 5: Author `schedule-followup` task action

## Context

`schedule-followup` is the task-kind action in the new `onboarding` worked example — `kind: task`, in group `g2` alongside `send-quote`. Task actions don't have their own `form:` block; they drive the shared `task-edit` page from `modules/workflows/pages/task-edit.yaml` (shipped by part 17), which renders universal fields (`due_date`, `assignees`, `description`) plus a status selector and `comment` field.

`makeWorkflowApis` still emits a per-action endpoint for task actions (`update-action-schedule-followup`), but `makeActionPages` does *not* emit form pages for them ([makeActionPages.js:41](../../../../../modules/workflows/resolvers/makeActionPages.js): `if (action.kind !== "form") return [];`). So this task only authors the action YAML — there's no `form:` block, no resolver-emitted pages.

## Task

Create `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml`:

- `type: schedule-followup`
- `kind: task`
- `action_group: g2`
- `sort_order: 20` (sorts after `send-quote` in group `g2`).
- `description: Schedule a follow-up call with the lead within a week of qualification.`
- `access.demo: [edit, view]`, `access.roles: [admin]`.
- No `form:` block, no `hooks:` block, no `interactions:` overrides — engine runs default lifecycle.
- `status_map` covering `action-required`, `in-progress`, `done`, plus `blocked` (initial state):
  - `action-required.demo.link.pageId: { _module.pageId: { id: task-edit, module: workflows } }`, `urlQuery: { action_id: true }`.
  - `in-progress.demo.link` — same `task-edit` target.
  - `blocked.demo.message: Awaiting qualification.` (no `link:`).
  - `done.demo.message: Follow-up scheduled.` (no `link:`).

See [action-authoring spec § Task action lines 395–421](../../../../workflows-module-concept/action-authoring/spec.md) for the canonical task-action shape.

## Acceptance Criteria

- File exists and is valid YAML.
- No `form:`, no `hooks:`, no `interactions:` blocks.
- `status_map` covers at minimum `action-required`, `in-progress`, `done`, and `blocked`.
- `link` blocks target the shared `task-edit` page (not an `onboarding-schedule-followup-*` page — those don't get emitted for task kinds).
- `apps/demo` builds without errors.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml` — create.

## Notes

- This action depends on the universal-fields component from [part 24](../../24-universal-fields/design.md) at *runtime* (the shared `task-edit` page renders it). The action YAML doesn't reference universal-fields directly — `task-edit` does. As long as task-edit can build, this action can ship.
- The `task-edit` page calls `update-action-{action_type}` with `interaction: submit_edit`, `current_status: <user-selected>`, `fields:` (universal-fields data), and a top-level `comment` (mapped to `event.metadata.comment` by the resolver-emitted API per [part 13 design.md § Comment mapping](../../13-resolver-apis/design.md)).
