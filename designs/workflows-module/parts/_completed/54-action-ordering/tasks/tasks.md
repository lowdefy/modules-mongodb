# Implementation Tasks — Workflow Action Ordering

## Overview

These tasks implement the declaration-order action-ordering model from
`designs/workflows-module/parts/54-action-ordering/design.md`. They introduce one
shared comparator (`makeWorkflowOrderComparator`), wire it into all four read
engines that order action documents, and retire the dead `sort_order` field from
config plumbing, docs, and demo configs.

## Tasks

| #   | File                                   | Summary                                                                                   | Depends On |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-create-comparator.md`              | New `compareActionOrder.js` (`makeWorkflowOrderComparator`) + unit tests                  | —          |
| 2   | `02-wire-get-workflow-overview.md`     | Replace `GetWorkflowOverview` bespoke sort with the comparator; sink `not-required` (D4)  | 1          |
| 3   | `03-wire-entity-and-group-overview.md` | Replace `GetEntityWorkflows` + `GetWorkflowActionGroupOverview` within-group sort         | 1          |
| 4   | `04-wire-get-events-timeline.md`       | Remove `$sortArray` stage; sort raw actions via comparator in JS; overhaul fixture        | 1          |
| 5   | `05-retire-sort-order-plumbing.md`     | Drop `sort_order` from `ACTION_FIELDS`, `makeActionPages`, README, `view.yaml.njk`        | —          |
| 6   | `06-cleanup-docs-and-demo.md`          | Strip `sort_order` from demo configs + concept spec/design; correct D1 prose; F12 pointer | —          |

## Ordering Rationale

**Task 1 is the foundation.** The comparator is the single ordering definition;
tasks 2–4 all import it, so it must exist and be unit-tested first.

**Tasks 2, 3, 4 are independent of one another** and can run in parallel once
task 1 lands — each touches a distinct engine file and its own test file, and
none import from another. They are split by engine because each has a distinct
existing sort to replace and distinct test rework:

- Task 2 (`GetWorkflowOverview`) removes a bespoke `groupIndex` helper and is a
  genuine **behavior change** — this surface does not sink `not-required` today.
- Task 3 groups `GetEntityWorkflows` + `GetWorkflowActionGroupOverview` because
  their change is byte-for-byte identical (replace the same
  `(not-required, sort_order, created.timestamp)` sort) and their tests share the
  same misleading `sort_order`-framed assertion to rework.
- Task 4 (`GetEventsTimeline`) is the most involved: it removes an aggregation
  stage, sorts **raw** action docs in JS before the enrichment loop trims them,
  drops `sort_order` from the emitted card shape, and needs a fixture overhaul
  (populated `workflowsConfig` + `type`/`action_group`/`workflow_type` on seeds)
  so the test genuinely exercises declaration order rather than passing by
  lexical `_id` accident.

**Tasks 5 and 6 have no hard dependency** on the comparator: the engines read
`sort_order` off **action documents**, never off config, so removing it from the
config plumbing (`ACTION_FIELDS`) and docs/demo changes nothing functionally and
could land at any time. They are sequenced last so the whole change reads as one
coherent unit — land them alongside or after the engine wiring. Task 5 is code
plumbing + module-level docs; task 6 is concept-doc prose corrections + cosmetic
demo/snippet stripping + the Part 51 F12 cross-reference.

## Scope

**Source:** `designs/workflows-module/parts/54-action-ordering/design.md`
**Context files considered:** none — the design folder contains only `design.md`
and a `review/` subfolder. Repo context read: the four engine source + test
files, `makeWorkflowsConfig.js`, `makeActionPages.js`, `resolveActionAccess.js`,
`planActionTransition.js`, `modules/workflows/README.md`, `view.yaml.njk`, and the
demo `workflow_config/**` YAML.
**Review files skipped:** `designs/workflows-module/parts/54-action-ordering/review/`
