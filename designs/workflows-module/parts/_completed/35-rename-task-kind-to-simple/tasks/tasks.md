# Implementation Tasks — Rename `kind: task` → `kind: simple`

## Overview

These tasks implement Part 35: a pure vocabulary swap renaming the workflow-action kind currently spelled `task` to `simple` across shipped code, shipped templates, the demo `workflow_config`, and the active follow-on parts that key off the name. No behavioural change, no data migration. Derived from `designs/workflows-module/parts/35-rename-task-kind-to-simple/design.md`.

## Tasks

| #   | File                                    | Summary                                                                                  | Depends On |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-rename-kind-in-shipped-code.md`     | Flip `kind: "task"` → `"simple"` in resolvers, plugin types, and their unit tests        | —          |
| 2   | `02-rename-shared-pages-and-manifest.md` | Rename the three shared page files, flip inner page IDs, update manifest + README + universal-fields header | —          |
| 3   | `03-update-demo-workflow-config.md`     | Flip `kind: task` → `simple` and `task-edit` → `simple-edit` references in the two demo workflow_config files | 1, 2       |
| 4   | `04-update-active-follow-on-parts.md`   | Flip `kind: task` and `task-*` page IDs across active follow-on parts 22, 24, 28, 33, 34 design.md (Part 30 excluded — superseded by Part 38) | —          |

## Ordering Rationale

The shipped-code rename (Task 1) and the shared-pages rename (Task 2) are independent and can run in parallel: Task 1 touches `.js` files in `modules/workflows/resolvers/` and `plugins/.../shared/types.js` plus their `*.test.js`; Task 2 touches `.yaml` files in `modules/workflows/pages/`, `module.lowdefy.yaml`, `universal-fields.yaml`, and `README.md`. They don't overlap.

Task 3 (demo `workflow_config`) depends on both: the demo's `kind: simple` only validates after Task 1 ships, and the demo's `_module.pageId: { id: simple-edit }` only resolves after Task 2 renames the page files and updates the manifest. Landing Task 3 before 1 or 2 would break `pnpm build` for `apps/demo`.

Task 4 (active follow-on parts) is pure docs work in the design.md files under `designs/workflows-module/parts/{22,24,28,33,34}/` (Part 30 is excluded — Part 38 supersedes it and moves it to `_rejected/`). It has no code dependency and can run in parallel with Tasks 1–3. Recommended to land alongside the code tasks so the design surface stays consistent.

Tasks 1+2+3 must all land in the same PR (or at least within the same build cycle) for `pnpm build` to pass. Task 4 can ship in a separate commit if desired but is cheap to bundle.

## Scope

**Source:** `designs/workflows-module/parts/35-rename-task-kind-to-simple/design.md`
**Context files considered:** `design.md` only (no other supporting files in the design folder).
**Review files skipped:** `designs/workflows-module/parts/35-rename-task-kind-to-simple/review/` — frozen historical record.
