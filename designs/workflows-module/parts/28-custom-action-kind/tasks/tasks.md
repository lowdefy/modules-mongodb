# Implementation Tasks — Custom action kind (Part 28)

## Overview

Adds a fourth action `kind: custom` to the workflows module — a `check`-clone whose
working surface lives on app-owned pages instead of the module's shared
`workflow-action-*` pages. These tasks derive from
`designs/workflows-module/parts/28-custom-action-kind/design.md`.

## Tasks

| #   | File                                     | Summary                                                                                       | Depends On |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-fsm-custom-alias.md`                 | Add `custom: form` object-identity alias to `FSM_TABLES` so submit signals resolve            | —          |
| 2   | `02-register-custom-kind.md`             | Add `"custom"` to `ACTION_KINDS`; update unknown-kind message; reject `form:`/`tracker:`      | —          |
| 3   | `03-cell-validation-shared-validator.md` | Extract shared link-shape validator; permit `view_link:` for custom; validate both cells      | 2          |
| 4   | `04-engine-link-routing.md`              | Route authored cell links in `computeEngineLinks`; shared sentinel helper; delete dead file   | —          |
| 5   | `05-resolver-no-change-tests.md`         | Add tests: custom emits no pages; custom is submittable (endpoints + render_config)           | 2          |
| 6   | `06-docs-concept-specs-readme.md`        | Document the kind in concept specs and the consumer docs                                      | —          |
| 7   | `07-workflows-test-fixture.md`           | New `custom-action` workflow config + app-owned page(s) + app wiring in `workflows-test`      | 2, 3, 4    |
| 8   | `08-e2e-custom-action-spec.md`           | Playwright spec: click-through (concrete `_id`) + observer fallback to `workflow-action-view` | 7          |

## Ordering Rationale

The work splits into two engine surfaces that can proceed in parallel:

- **Resolver / build-time** (`modules/workflows/resolvers/makeWorkflowsConfig.js`):
  task 2 registers the kind, then task 3 makes the (currently unreachable)
  `isCustom` cell branch live and adds `view_link:` validation via a shared
  validator extracted from the tracker arm. Task 3 depends on task 2 because its
  branch and tests only become reachable once `custom` is a valid kind.
- **Engine render** (`plugins/.../render/computeEngineLinks.js`): task 4 replaces
  the `return {}` short-circuit with per-verb link routing, extracts a shared
  sentinel-substitution helper, and deletes the orphaned
  `substituteActionIdSentinel.js`. It touches a different package and has no
  dependency on tasks 1–3.

Task 1 (the FSM alias) is independent and tiny but foundational — without it a
custom submit throws on an undefined table.

Tasks 5 (resolver no-change coverage) depends only on task 2. Task 6 (docs) has no
code dependency.

The app-side tasks come last: task 7 (the `workflows-test` fixture: config + app
page + wiring) needs the build to accept `kind: custom` (tasks 2, 3) and the
runtime to route links (task 4). Task 8 (the e2e spec) needs the fixture (task 7)
and the runtime (tasks 1, 4).

**Parallelizable:** tasks 1, 2, 4, and 6 can all start immediately. Task 3 follows
2; task 5 follows 2; task 7 follows 2+3+4; task 8 follows 7.

## Scope

**Source:** `designs/workflows-module/parts/28-custom-action-kind/design.md`
**Context files considered:** none beyond `design.md` (the design folder contains
only `design.md` and the skipped review file). Source files read for concrete
context: `makeWorkflowsConfig.js`, `fsm/tables.js`, `computeEngineLinks.js`,
`resolveActionAccess.js`, `substituteActionIdSentinel.js`, `renderStatusMap.js`,
`planActionTransition.js`, `makeActionPages.js`, `makeWorkflowApis.js`, the
`workflows-test` app fixtures, and the action-authoring concept spec.
**Review files skipped:** `review/review-1.md`
