# Task 1: Move `action_statuses.yaml` to the shared enums directory

## Context

The action status display enum currently lives at
`modules/workflows/enums/action_statuses.yaml`. It is the single source of status
display metadata (`color` / `borderColor` / `titleColor` / `title` / `priority`
per status key — `not-required`, `blocked`, `action-required`, `in-progress`,
`in-review`, `done`, `changes-required`, `error`).

Part 42 needs both the workflows pages **and** the events-module timeline to read
one base enum. The events module is dependency-free and must not `_ref` into the
workflows module, so the enum moves to the neutral shared location
`modules/shared/enums/` (the same place `event_types.yaml` already lives), and
every workflows-module reference is repointed.

**`_ref` paths within a module resolve relative to the module root** (e.g.
`modules/workflows/components/action_statuses.yaml` uses `enums/action_statuses.yaml`
to reach `modules/workflows/enums/...`; `modules/events/components/events-timeline.yaml`
uses `../shared/enums/event_types.yaml` to reach `modules/shared/enums/...`). So
from any workflows-module file the new path is `../shared/enums/action_statuses.yaml`.

> **Deviation from the design's Files table:** the design names only
> `components/action_statuses.yaml` as needing a repoint. In reality the enum is
> `_ref`'d directly in **six** files (listed below). All must be updated or the
> build breaks.

## Task

1. **Move the file** (preserve content verbatim):
   - `modules/workflows/enums/action_statuses.yaml` → `modules/shared/enums/action_statuses.yaml`
   - Use `git mv` so history follows.

2. **Repoint every direct `_ref` to the enum** from `enums/action_statuses.yaml`
   to `../shared/enums/action_statuses.yaml` in these files:
   - `modules/workflows/connections/workflow-api.yaml` (the `actionsEnum: { _ref: enums/action_statuses.yaml }` line — the engine reads the canonical enum here, so its priorities must keep resolving)
   - `modules/workflows/components/action_statuses.yaml`
   - `modules/workflows/pages/simple-view.yaml` (6 occurrences)
   - `modules/workflows/pages/simple-review.yaml` (2 occurrences)
   - `modules/workflows/pages/simple-edit.yaml` (1 occurrence)
   - `modules/workflows/templates/edit.yaml.njk` (1 occurrence)

3. **Update the manifest header comment** in
   `modules/workflows/module.lowdefy.yaml` (line ~15) that documents the
   workflow-api connection `_ref`ing `../enums/action_statuses.yaml` — change the
   path it cites to `../shared/enums/action_statuses.yaml`.

4. **Update the `actionsEnum` docstring** in
   `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`
   (line ~124): "Typically loaded from enums/action_statuses.yaml" → the new
   canonical path `modules/shared/enums/action_statuses.yaml`.

Do **not** touch references to the *component* `components/action_statuses.yaml`
(used by `pages/group-overview.yaml` and `pages/workflow-overview.yaml`) — the
component file's own path is unchanged; only the enum it points to moved.

## Acceptance Criteria

- `modules/workflows/enums/action_statuses.yaml` no longer exists; the file is at
  `modules/shared/enums/action_statuses.yaml` with identical content.
- `grep -rn "enums/action_statuses.yaml" modules/workflows` returns no matches
  pointing at the old in-module path (only `../shared/enums/action_statuses.yaml`).
- The Lowdefy build succeeds (`pnpm ldf:b` or the repo's build command) with no
  unresolved-`_ref` errors.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` still passes (it
  validates status-map keys against this enum via the workflow-api connection).

## Files

- `modules/workflows/enums/action_statuses.yaml` — **delete (moved)**.
- `modules/shared/enums/action_statuses.yaml` — **create (moved)** — verbatim copy.
- `modules/workflows/connections/workflow-api.yaml` — modify — repoint `actionsEnum` ref.
- `modules/workflows/components/action_statuses.yaml` — modify — repoint enum ref.
- `modules/workflows/pages/simple-view.yaml` — modify — repoint 6 enum refs.
- `modules/workflows/pages/simple-review.yaml` — modify — repoint 2 enum refs.
- `modules/workflows/pages/simple-edit.yaml` — modify — repoint 1 enum ref.
- `modules/workflows/templates/edit.yaml.njk` — modify — repoint 1 enum ref.
- `modules/workflows/module.lowdefy.yaml` — modify — update header comment path.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify — update `actionsEnum` docstring path.

## Notes

- The enum's content (keys + display values) does not change in this task; the
  block-side reconcile to those keys is Task 6.
- The workflow-api connection ref is load-bearing for engine priority logic — get
  it right; a broken ref there fails the engine config validation, not just the UI.
