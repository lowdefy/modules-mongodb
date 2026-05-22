# Implementation Tasks — Part 20a Module Manifest (Static Surface)

## Overview

Eight ordered tasks that close the static-surface gap on `modules/workflows/module.lowdefy.yaml`, add the README, and wire a tracker-only onboarding workflow into `apps/demo/` so the closed surface runs end-to-end. Derived from `designs/workflows-module/parts/20a-module-manifest-static/design.md`.

## Tasks

| #   | File                                             | Summary                                                                                                                              | Depends On |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-add-connection-files.md`                     | Author the three connection YAMLs under a new `modules/workflows/connections/` directory.                                            | —          |
| 2   | `02-manifest-deltas.md`                          | Add `app_name` / `user_schema` / `entities` vars, `dependencies:`, `secrets:`, top-level `connections:`, and `exports.connections:`. | 1          |
| 3   | `03-author-readme.md`                            | Author `modules/workflows/README.md` from the fixed-template scaffold with `vars.entities` worked example.                           | 2          |
| 4   | `04-demo-workflow-config.md`                     | Author the tracker-only onboarding workflow + the one-action installation child under `apps/demo/workflow_config/`.                  | —          |
| 5   | `05-demo-leads-pages.md`                         | Add the `leads` connection inline to `apps/demo/lowdefy.yaml` and four lead pages under `apps/demo/pages/leads/`.                    | —          |
| 6   | `06-wire-workflows-module-entry.md`              | Add the `workflows` module entry to `apps/demo/modules.yaml` with all four vars populated.                                           | 2, 4, 5    |
| 7   | `07-lead-view-workflow-buttons.md`               | Add "Start onboarding" + admin-style "Close / Cancel installation child" buttons to `lead-view`.                                     | 6          |
| 8   | `08-e2e-spec.md`                                 | Author `apps/demo/e2e/workflows/tracker-only-onboarding.spec.js` automating the six-step walk-through.                               | 7          |

## Ordering rationale

The manifest must `_ref` connection files that exist — task 1 before task 2. The README restates the final manifest narratively, so task 3 follows task 2.

The demo wiring has two independent legs (task 4 = workflow config, task 5 = leads entity + pages) that can run in parallel; both must land before task 6 wires the module entry, because the build-time validator (part 4) requires `vars.workflows_config` to be valid AND every `entity_collection` it references to have a matching key in `vars.entities`. Task 6 is the convergence point.

Task 7 (lead-view buttons) is small enough to fold into task 5, but it's separated because it needs the module entry from task 6 to be wired (the buttons call module-shipped APIs whose ids resolve via `_module.endpointId`). Keeping it as its own task also keeps task 5 free of workflows-module coupling.

Task 8 (e2e spec) is last because the spec automates the manual walk-through, which is only meaningful once everything ahead of it ships.

**Cleanup folded into task 2.** The design's "Closed during review" section commits to removing the part 27 row from `implementation-plan.md` (line 95, footprint at line 104) and rewriting the "Shipped so far" sentence. That cleanup was already applied during the consistency review pass; no further action needed here. The Part 27 directory was already deleted.

**Parallelism.** Tasks 1 + 4 + 5 can run in parallel (independent). Task 2 depends only on task 1; task 3 depends on task 2; tasks 6 → 7 → 8 are a serial tail.

## Scope

**Source:** `designs/workflows-module/parts/20a-module-manifest-static/design.md`
**Context files considered:** `CLAUDE.md` (project conventions), `docs/idioms.md`, `designs/workflows-module/parts/20a-module-manifest-static/design.md`, the existing `modules/workflows/module.lowdefy.yaml` and sample patterns from `modules/contacts/` (connection file shape, exports.connections, secrets block).
**Review files skipped:** `review/review-1.md`, `review/consistency-2.md` (per skill convention — already incorporated into design.md).
