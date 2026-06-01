# Implementation Tasks — Part 38: Engine rebuild (FSM + load-plan-commit)

## Overview

These tasks implement Part 38, which rebuilds the workflow engine around two combined axes: a per-kind FSM signal model (replacing the priority-rule + `force: true` transition model) and a load → pre-hook → plan → commit → post-hook architecture (replacing the mutable-`context` interleaved handler flow). Part 38 also absorbs Part 34's access model (per-verb `access` map, `visible_verbs`, signal→verb submit gating, per-verb `links` map, emitted-id naming) and salvages Part 30's on-disk action-doc display contract. Derived from `designs/workflows-module/parts/38-engine-rebuild/design.md`.

## Tasks

| #   | File                                        | Summary                                                                              | Depends On      |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------ | --------------- |
| 1   | `01-mongo-driver-layer.md`                  | New `mongo/` native-driver helpers + owned/cached `MongoClient` + topology detection | —               |
| 2   | `02-fsm-tables-resolve-signal.md`           | `fsm/` per-kind FSM tables (`simple` aliased to `form`) + `resolveSignal`            | —               |
| 3   | `03-render-layer.md`                        | `render/` Nunjucks walker, status-map render, per-verb `computeEngineLinks`, event   | 4               |
| 4   | `04-connection-schema-wiring.md`            | `schema.js` `entry_id` + `changeLog`/`priority` desc rewrites; `workflow-api.yaml`   | —               |
| 5   | `05-role-gate-oracle-fixtures.md`           | Shared `(gate, roles)→bool` fixture table consumed by all three runtimes             | —               |
| 6   | `06-resolver-validation-id-naming.md`       | `validateActionAccess` + `validateStatusMapCells` + unprefixed emitted-id naming     | 5               |
| 7   | `07-visible-verbs-read-path.md`             | `visible_verbs_filter.yaml` replaces `access_filter.yaml` in 3 get-\* APIs           | 5               |
| 8   | `08-action-role-check-client.md`            | `action_role_check` populates per-verb `_state.action_allowed` (Part 18 amendment)   | 5               |
| 9   | `09-load-phase-and-types.md`                | Phase types (`LoadedState`/`PreHookResult`/`Plan`) + `loadWorkflowState` + access gate | 1, 2, 5       |
| 10  | `10-action-planners.md`                     | `planActionTransition` (generic field passthrough) + `planAutoUnblock` fixpoint       | 2, 3, 9        |
| 11  | `11-workflow-planners.md`                   | `planWorkflowRecompute` + `planFormDataMerge` (**Q6 merge rule must be settled**)     | 9              |
| 12  | `12-event-notification-changelog-planners.md` | `planEventDispatch` (two render contexts) + `planNotifications` + `planChangeLog`   | 3, 9           |
| 13  | `13-commit-phase.md`                        | `commitPlan`: workflow-first ordering, transaction/standalone paths, CAS gate         | 1, 9           |
| 14  | `14-hook-phase-wrappers.md`                 | `invokePreHook` (signal return shape) + `invokePostHook` moved to `shared/phases/`    | 9              |
| 15  | `15-submit-handler-rewrite.md`              | Rewrite `SubmitWorkflowAction`/`handleSubmit` around phases; delete obsolete files    | 10,11,12,13,14 |
| 16  | `16-tracker-cascade.md`                     | `runTrackerCascade` loop + `planTrackerLevel` (per-fire chain-depth guard)            | 15             |
| 17  | `17-start-cancel-close-rewrite.md`          | Rewrite Start/Cancel/Close around phases; each emits a lifecycle log event            | 10,11,12,13    |
| 18  | `18-display-surface-renames.md`             | Rename fixed pages `workflow-*`, update `_module.pageId` refs + `message`/`links`     | 4, 6           |
| 19  | `19-emitted-payload-surfaces.md`            | `makeWorkflowApis` payload mapping (drop `force`, add `signal`) + `start-workflow`    | 6              |
| 20  | `20-demo-migration.md`                      | Migrate demo `workflow_config` to signals/access map + notification config            | 7,8,15,17,18,19 |

## Ordering Rationale

The work decomposes into five bands:

1. **Foundations (1–4)** — the bottom of the dependency stack: the native Mongo driver layer, the FSM tables, the render helpers, and the connection-schema wiring (`entry_id`). These share no state and can be built in parallel, except the render layer (3) consumes the `entry_id` mechanic from (4) for link computation.

2. **Access-model cluster (5–8)** — Part 34's absorption. Per the design's D16 tasking note, the three engine-independent surfaces (`visible_verbs_filter.yaml`, `validateActionAccess`, `action_role_check`) are sequenced **alongside, not interleaved with** the rebuild core so they don't gate on it. They all sit on the shared role-gate oracle fixtures (5), which is the single source of `(gate, roles)→bool` truth across the three runtimes that can't share code.

3. **Phases (9–14)** — the load-plan-commit machinery. The phase types + load phase (9) anchor the contracts; planners (10–12) are pure functions consuming FSM/render; commit (13) and hook wrappers (14) round out the cycle. The write-path-coupled Part 34 pieces — the submit-time access gate (in load, 9) and per-verb `computeEngineLinks` (in render, 3) — live here with the rebuild because they share its surface.

4. **Handler rewrites (15–17)** — compose the phases. Submit (15) is the reference handler; the tracker cascade (16) reuses 100% of the Submit planner machinery and so follows it; Start/Cancel/Close (17) compose the same phases independently of Submit and can run parallel to 15/16.

5. **Surfaces + demo (18–20)** — the display renames + payload mapping, capped by the demo migration (20), which is the only in-tree end-to-end exercise of the rebuild and therefore depends on nearly everything.

**Parallelism:** bands 1 and 2 are largely independent of each other and can proceed concurrently. Within band 1, tasks 1/2/4 are independent. Task 17 can run parallel to 15/16.

**Open questions:** Q1–Q5 have firm "leans" in the design and are baked into the relevant tasks as decisions. **Q6 (form_data merge rule) is genuinely unresolved** — task 11 must settle it (merge-vs-replace granularity, removal-by-omission, per-channel shapes) before `planFormDataMerge` is implemented; the design's analysis is embedded in that task.

## Scope

**Source:** `designs/workflows-module/parts/38-engine-rebuild/design.md`
**Context files considered:** none — `design.md` is the only non-review file in the design folder. (Prerequisite concept/part designs referenced but not re-tasked here: `workflows-module-concept/state-machine/design.md`, Part 34 `_completed/34-action-access-model`, Part 35 `_completed/35-rename-task-kind-to-simple`, Part 30 `_rejected/30-status-map-rendering`.)
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`, `review/consistency-4.md`
