# Task 3: Move task CRUD to activities (with entity-link + event seams)

## Context

Workstream B2. Deals has its own task implementation — `components/detail/task_modal.yaml`, `api/create-task.yaml`, `api/update-task.yaml` — writing into an `actions-collection`. The **activities** module already owns that collection (deals' and activities' `actions-collection` connections both resolve to the same physical `actions` collection) but exports no task CRUD. Consolidate into activities so there's one task implementation.

Deals' `create-task` is deal-specific in two ways that must not be lost (host-compatibility obligation): it links the task to a deal, and it emits an event `type: deal-task-created` with deal-flavoured display markup (`api/create-task.yaml:38-50`).

## Task

Add to the **activities** module:
- exported `create-task` / `update-task` APIs writing into activities' `actions-collection`, with two seams:
  - **arbitrary entity link** — `entity_type` / `entity_id` payload inputs (not a hardcoded deal reference), so a task can hang off a deal, a meeting, or any entity.
  - **configurable emitted event** — event `type` + display template supplied by the consumer, so deals keeps `deal-task-created` + its markup while activities keeps its own meeting-task semantics.
- an exported `task-modal` component (generalized from deals' `task_modal.yaml`), parameterised by entity link + assignee options source.

Then rewire **deals** to consume the activities task APIs + `task-modal`, passing `entity_type: deal`, the deal id, and its `deal-task-created` event config; delete deals' `task_modal.yaml`, `api/create-task.yaml`, `api/update-task.yaml`.

## Acceptance Criteria

- activities exports `create-task`, `update-task`, `task-modal` (manifest + docs updated).
- Creating a task on a deal in the demo still writes to `actions`, links to the deal, and emits a `deal-task-created` event with the same display.
- deals no longer defines its own task modal/APIs; it `_ref`s activities'.
- `CI=true pnpm ldf:b` green; changesets for activities (minor) + deals (patch/minor); `docs:check` green.

## Files

- `modules/activities/api/create-task.yaml` — create — with entity-link + event seams.
- `modules/activities/api/update-task.yaml` — create.
- `modules/activities/components/task-modal.yaml` — create — from deals' task_modal.
- `modules/activities/module.lowdefy.yaml` — modify — export the three; note vars.
- `modules/deals/pages/view.yaml` / `components/detail/*` — modify — consume activities task-modal/APIs.
- `modules/deals/api/create-task.yaml`, `api/update-task.yaml`, `components/detail/task_modal.yaml` — delete.
- `.changeset/*.md` — create.

## Notes

Deals' `actions-collection` connection may still be read by `get_selected_deal_open_actions` — leave that connection in place until task 5 removes the last reader. This task removes the task *write* path only.
