# Implementation Tasks — Part 30 Engine-managed display

## Overview

Tasks implementing Part 30: the workflows engine renders `status_map` cells and event-display templates at write time, writes per-app fields (`message`, `link`, `status_title`) at the top level of action docs, and computes navigation `link` per `(kind, stage, access verbs)` for built-in kinds. Display surfaces become dumb readers; event display strings reach `EventsTimeline` as plain Nunjucks-rendered strings.

## Tasks

| #   | File                                                | Summary                                                                                                | Depends On |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-move-parseNunjucks-add-renderTree.md`           | Move `parseNunjucks` to `src/utils/`, add `renderTree` recursive walker.                               | —          |
| 2   | `02-add-substituteActionIdSentinel.md`              | Add sentinel-swap helper for `kind: custom` author-written links.                                      | —          |
| 3   | `03-add-computeEngineLinks.md`                      | Add `(kind, stage, verbs) → link` table + helper for built-in kinds.                                   | —          |
| 4   | `04-add-renderStatusMap.md`                         | Add render orchestrator: clone cell, apply override, render Nunjucks, sentinel-swap.                   | 1, 2       |
| 5   | `05-add-buildActionStageUpdate.md`                  | Add single-stage `$set` aggregation pipeline builder.                                                  | —          |
| 6   | `06-extend-api-contract-metadata-action-display.md` | Add `metadata` + `action_display` to start/submit API payloads; refresh `app_name` manifest doc.       | —          |
| 7   | `07-wire-createAction-and-StartWorkflow.md`         | Wire `createAction` to render the initial cell; pass `metadata` through `StartWorkflow`.               | 3, 4, 6    |
| 8   | `08-wire-updateAction.md`                           | Replace `updateAction`'s `$set` + `$push` with the new aggregation pipeline.                           | 3, 4, 5    |
| 9   | `09-refactor-cancel-close-cascade.md`               | Switch Cancel/Close per-action sweeps to `bulkWrite` with per-action render + link computation.        | 3, 4, 5    |
| 10  | `10-strip-link-from-demo-configs.md`                | Remove authored `link:` from demo workflow configs; align `install-step` with the worked example.     | —          |
| 11  | `11-resolver-cell-shape-validation.md`              | Add per-cell shape validation in `makeWorkflowsConfig`; built-in kinds reject `link:`.                 | 10         |
| 12  | `12-switch-group-overview-to-top-level-fields.md`   | Update `pages/group-overview.yaml` to read `actions_list.$.message` / `.link` instead of `status_map`. | 7, 8, 9    |
| 13  | `13-add-renderEventDisplay.md`                      | Add `renderEventDisplay` helper using `renderTree` and the fixed event render context.                 | 1          |
| 14  | `14-wire-dispatchLogEvent-and-update-defaults.md`   | Render event display before `callApi('new-event')`; rewrite default templates to plain Nunjucks.       | 13         |
| 15  | `15-update-workflows-readme.md`                     | Document `metadata` and `action_display` in `modules/workflows/README.md`.                             | 6          |

## Ordering Rationale

Foundation helpers (1–5) are file-additions with unit tests; tasks 1, 2, 3, 5 are independent and can be implemented in parallel. Task 4 depends on 1 and 2.

Task 6 (extending the public payload contract for `metadata` / `action_display`) is independent of the helpers but must land before any engine wiring that reads those payload fields.

Engine writers (7, 8, 9) all depend on the helpers. They can be split because each touches a distinct call site (insert, single update, cascade sweep). The cascade refactor (9) is grouped into one task — Cancel and Close share the same shape.

Resolver validation (11) lands *after* the demo cleanup (10) so introducing the validator doesn't break the demo build.

Task 12 (page-side read change) lands after the engine writes the new top-level fields, otherwise the page reads `undefined`.

Event-display work (13, 14) only depends on `renderTree` (task 1) and runs as an independent track alongside the action-display work.

Task 15 (README) lands last to capture the final shape of the contract.

## Scope

**Source:** `designs/workflows-module/parts/30-status-map-rendering/design.md`
**Context files considered:** none (no supporting files alongside `design.md`)
**Review files skipped:** `designs/workflows-module/parts/30-status-map-rendering/review/` (entire folder, including `review-2.md`)
