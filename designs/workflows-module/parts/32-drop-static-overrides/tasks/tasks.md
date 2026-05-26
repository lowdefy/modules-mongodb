# Implementation Tasks — Part 32: Drop static `interactions.status` override

## Overview

Drops the action YAML `interactions:` block (Layer 2 of status resolution) so the pre-hook return is the only override channel for per-interaction target status. Implements the design in [`design.md`](../design.md).

The static action-YAML `event:` block stays — see the design's § Scope note and [Part 33 — Comment rendering on the events timeline](../../33-comment-rendering/design.md) for the question that pulled the event channel out of scope. `mergeEventOverrides` keeps its 4-layer shape; the `event_overrides:` literal in the per-action endpoint payload stays; `handleSubmit` still passes `yamlOverride: params.event_overrides?.[params.interaction]` through to the event merge.

## Tasks

| #   | File                                          | Summary                                                                                  | Depends On |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-update-concept-specs.md`                  | Strip `interactions:` status-override from `submit-pipeline/spec.md` and `action-authoring/spec.md` | —          |
| 2   | `02-update-neighbour-part-designs.md`         | Reconcile parts 4, 9, 13 design docs with the `interactions:` collapse                   | —          |
| 3   | `03-drop-bake-in-makeWorkflowApis.md`         | Stop emitting `interactions:` literal; remove `emitInteractions` helper + tests          | —          |
| 4   | `04-drop-layer2-resolveTargetStatus.md`       | Drop `yamlInteractions` branch; add pre-hook `status` enum-membership runtime check      | —          |
| 5   | `05-rewire-handleSubmit.md`                   | Stop passing `params.interactions` through `handleSubmit`; add bad-status-throws-pre-write test | 4          |
| 6   | `06-cleanup-demo-and-config-comment.md`       | Delete `interactions:` blocks from demo YAML; update `makeWorkflowsConfig` field comment | 3, 5       |

## Ordering Rationale

- **Tasks 1 + 2 (docs) are independent** of every code change and of each other — they can land in any order, before or after the code tasks. They go first by convention so the design surfaces stay consistent with the in-flight code.
- **Tasks 3 + 4 are independent code units** touching two different files (`makeWorkflowApis.js`, `resolveTargetStatus.js`). Each can be reviewed and tested in isolation. They can run in parallel.
- **Task 5 (handleSubmit rewire) depends on 4** because it removes the `yamlInteractions` call-site argument that the helper no longer accepts. Landing 5 before 4 would leave `handleSubmit` passing an arg the helper rejects. Landing 4 before 5 leaves `handleSubmit` passing an `undefined`-resolving value that the helper safely treats as "no override" — a benign intermediate state.
- **Task 6 (demo cleanup + comment) depends on 3 + 5** so the demo isn't left writing YAML whose runtime effect has been silently neutralised. With task 3 done the demo's `interactions:` blocks become inert at build time anyway, but landing 6 last keeps the demo internally consistent.

Tasks 3 + 4 are also independent of tasks 1 + 2 — code changes don't read the design docs at runtime.

## Scope

**Source:** [`designs/workflows-module/parts/32-drop-static-overrides/design.md`](../design.md)
**Context files considered:** `design.md` only — this part has no other supporting files.
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/consistency-3.md` (per design-task convention; review findings were applied to the design and tasks before task break-out — the design has since been rescoped to status-only, so the reviews' event-channel sections are superseded).
