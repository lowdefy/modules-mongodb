# Implementation Tasks — Part 32: Drop static action-YAML overrides

## Overview

Drops the action YAML `interactions:` and `event:` blocks (Layer 2) so the pre-hook return is the only override channel for per-interaction target status and log-event payload. Implements the design in [`design.md`](../design.md).

## Tasks

| #   | File                                            | Summary                                                                                  | Depends On |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-update-concept-specs.md`                    | Strip Layer 2 from `submit-pipeline/spec.md` and `action-authoring/spec.md`              | —          |
| 2   | `02-update-neighbour-part-designs.md`           | Reconcile parts 4, 9, 13 design docs with the collapse                                   | —          |
| 3   | `03-drop-bake-in-makeWorkflowApis.md`           | Stop emitting `event_overrides:` / `interactions:` literals; remove emit helpers + tests | —          |
| 4   | `04-drop-layer2-resolveTargetStatus.md`         | Drop `yamlInteractions` branch; add pre-hook `status` enum-membership runtime check      | —          |
| 5   | `05-drop-layer2-mergeEventOverrides.md`         | Drop `yamlOverride` param; 4-layer merge becomes 3-layer                                 | —          |
| 6   | `06-rewire-handleSubmit.md`                     | Stop passing `params.interactions` / `params.event_overrides` through handleSubmit       | 4, 5       |
| 7   | `07-cleanup-demo-and-config-comment.md`         | Delete `interactions:` blocks from demo YAML; update `makeWorkflowsConfig` field comment | 3, 6       |

## Ordering Rationale

- **Tasks 1 + 2 (docs) are independent** of every code change and of each other — they can land in any order, before or after the code tasks. They go first by convention so the design surfaces stay consistent with the in-flight code.
- **Tasks 3, 4, 5 are independent code units** touching three different files (`makeWorkflowApis.js`, `resolveTargetStatus.js`, `mergeEventOverrides.js`). Each can be reviewed and tested in isolation. They can run in parallel.
- **Task 6 (handleSubmit rewire) depends on 4 + 5** because it removes the call-site arguments those helpers no longer accept. Landing 6 before 4/5 would leave handleSubmit passing args to helpers that still type-check them. Landing 4/5 before 6 leaves handleSubmit passing `undefined`-resolving values that the helpers safely treat as "no override" — a benign intermediate state.
- **Task 7 (demo cleanup + comment) depends on 3 + 6** so the demo isn't left writing YAML whose runtime effect has been silently neutralised. With task 3 done the demo's `interactions:` blocks become inert at build time anyway, but landing 7 last keeps the demo internally consistent.

Tasks 3, 4, 5 are also independent of tasks 1 + 2 — code changes don't read the design docs at runtime.

## Scope

**Source:** [`designs/workflows-module/parts/32-drop-static-overrides/design.md`](../design.md)
**Context files considered:** `design.md` only — this part has no other supporting files.
**Review files skipped:** `review/review-1.md`, `review/review-2.md` (per design-task convention; review findings were applied to the design and tasks before task break-out).
