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
| 11  | `11-workflow-planners.md`                   | `planWorkflowRecompute` + `planFormDataMerge` (Q6 merge rule resolved — deep-merge)  | 9              |
| 12  | `12-event-notification-changelog-planners.md` | `planEventDispatch` (two render contexts) + `planChangeLog` (no `planNotifications` — notifications dispatch post-commit) | 3, 9           |
| 13  | `13-commit-phase.md`                        | `commitPlan`: workflow-first ordering, transaction/standalone paths, CAS gate         | 1, 9           |
| 14  | `14-hook-phase-wrappers.md`                 | `invokePreHook` (signal return shape) + `invokePostHook` moved to `shared/phases/`    | 9              |
| 15  | `15-submit-handler-rewrite.md`              | Rewrite `SubmitWorkflowAction`/`handleSubmit` around phases; delete obsolete files    | 10,11,12,13,14 |
| 16  | `16-tracker-cascade.md`                     | `runTrackerCascade` loop + `planTrackerLevel` (per-fire chain-depth guard)            | 15             |
| 17  | `17-start-cancel-close-rewrite.md`          | Rewrite Start/Cancel/Close around phases; each emits a lifecycle log event            | 10,11,12,13,18,19 |
| 18  | `18-display-surface-renames.md`             | Rename fixed pages (`workflow-group-overview`, final `workflow-action-*`) + `_module.pageId` refs + link table | 4, 6           |
| 19  | `19-emitted-payload-surfaces.md`            | `makeWorkflowApis` payload mapping (drop `force`, add `signal`) + `start-workflow`    | 6              |
| 20  | `20-demo-migration.md`                      | **Superseded** → implement [Part 45 (demo rebuild)](../../45-demo-rebuild/design.md) instead, after Parts 43 + 44      | 1–19, Parts 43–45 |
| 21  | `21-entity-ref-key-catchup.md`              | Catch-up on implemented tasks (reviews 8–9): required `entity_ref_key` (schema + resolver + demo) + stale docstring | 4, 6           |
| 22  | `22-callapi-contract-fix.md`                | Catch-up: fix landed code to the shipped `callApi` contract (opaque pre-scoped endpoint ids, throws-on-failure, no `{ success }` envelope) | 4, 13          |
| 23  | `23-planner-contract-catchup.md`            | Catch-up (review-13): `planActionTransition` `seedStage` mode, `planWorkflowRecompute` `lifecyclePush`, tracker `none` row, cascade `fire.payload` passthrough | 2, 10, 11, (16) |
| 24  | `24-user-docs-pass.md`                      | **Stub** — consumer-facing docs pass (`modules/workflows/README.md`): deferrals collected from tasks 4/14/19; expand via `/r:design-docs` | 14, 17, 18, 19 |

## Implementation Bands

The 23 tasks group into five dependency bands. **A band is the unit of work** — point an agent at this file and a band number ("implement Band 3 of `38-engine-rebuild`"); it implements every task in the band, in the listed internal order, then runs the band's gate before stopping.

**Rules for an agent working a band:**

- Implement tasks in the **internal order** shown. Where tasks are marked **parallel-safe**, they touch disjoint files and may be done in any order (or concurrently) — but a single agent should still do them one at a time and commit between them.
- Do **not** start a band until its **Depends on bands** are committed and green. The cross-task dependencies inside `## Tasks` are the source of truth for finer-grained ordering.
- Each task's own file is authoritative for scope, file list, and acceptance criteria. This section only sequences them.
- **Gate** = run the new + existing unit tests for the touched files and ensure they pass before considering the band done. Commit per task.

### Band 1 — Foundations ✅ Done

- **Tasks:** 1, 2, 4 (parallel-safe) → 3 (after 4)
- **Depends on bands:** none
- **Notes:** Driver layer (1), FSM tables (2), and connection-schema wiring (4) share no state. Render layer (3) consumes the `entry_id` mechanic from (4) for link computation, so it follows 4.
- **Gate:** unit tests for the mongo helpers, FSM tables, and render walker pass.

### Band 2 — Access-model cluster ✅ Done

- **Tasks:** 5 → 6, 7, 8 (6/7/8 parallel-safe after 5)
- **Depends on bands:** none (runs concurrently with Band 1)
- **Notes:** Part 34's absorption. The role-gate oracle fixtures (5) are the single `(gate, roles)→bool` source of truth across the three runtimes that can't share code; the three engine-independent surfaces (6 `validateActionAccess`, 7 `visible_verbs_filter.yaml`, 8 `action_role_check`) all sit on it and are sequenced **alongside, not interleaved with**, the rebuild core (per design D16) so they don't gate on it.
- **Gate:** fixture table + validator/filter/client-check tests pass.

### Band 3 — Phases (load · plan · commit) ✅ Done

- **Tasks:** 9 ✅ → 10 ✅, 11 ✅, 21 ✅ → 12 ✅ → 13 ✅, 22 ✅ → 14 ✅
- **Depends on bands:** 1, 2
- **Task 21 ran first** — it was the reviews-8–13 deviation catch-up on already-implemented tasks (4, 6, 10), making the required `entity_ref_key` real (validated, in the resolver's pick whitelist, present in demo configs) before task 12's `planEventDispatch` was written against it.
- **Q6 (form_data merge rule) — RESOLVED:** uniform deep-merge (objects deep-merge; arrays/scalars/`null` replace whole) onto the loaded `form_data.{action}` sub-object. The resolved rule is baked into task 11; no decision remains before implementing `planFormDataMerge`.
- **Notes:** Phase types + load phase (9) anchor the contracts. Planners (10–12) are pure functions over FSM/render. Commit (13) and hook wrappers (14) close the cycle. The write-path-coupled Part 34 pieces — the submit-time access gate (in load, 9) and per-verb `computeEngineLinks` (in render, 3) — live here because they share the rebuild's surface.
- **Gate:** planner unit tests pass; commit phase tested on both transaction and standalone paths incl. the CAS-miss gate.

### Band 4 — Handler rewrites ✅ Done

- **Tasks:** 15 ✅ → 16 ✅; 23 ✅ → 17 ✅ (after Band 5's 18 ∥ 19 — see below)
- **Depends on bands:** 3, plus Band 5's tasks 18 + 19 for task 17
- **Progress:** All done. Task 17 (Start/Cancel/Close rewrite) landed last, including the deferred-deletion sweep below, the shared `throwIfDispatchFailed` extraction, and the `makeWorkflowsConfig` legal-seed restriction.
- **17 runs after 18 ∥ 19** (re-sequenced by the review-18 action review): 17 and 19 collide on `makeWorkflowsConfig.js` (17's legal-seed restriction vs 19's `validateHooks` re-key + `event:`-key validation — serialize, 19 first), and 17's new handler integration tests assert seeded drafts' `links`, which must be the final `workflow-action-*` ids from 18's link-table flip — written against the interim `workflow-simple-*` ids they'd recreate the rename drift review-18 #7 documented.
- **Notes:** Submit (15) is the reference handler. The tracker cascade (16) reuses 100% of the Submit planner machinery and so follows it. The planner-contract catch-up (23, from review-13) extends the landed Band 3 planners (`seedStage`, `lifecyclePush`), flips the tracker `none` row, and reconciles the cascade `fire.payload` passthrough (16 landed without it, so the reconciliation applies) — it must precede Start/Cancel/Close (17), which consume all four. 17 composes the same phases independently and can run parallel to 15/16.
- **Deferred deletions (lockstep with task 17):** tasks 15/16 deleted only files whose sole importer was the rewritten Submit path. Still imported by the un-rewritten Start/Cancel/Close (and therefore deferred to task 17): `shared/createAction.js`, `shared/updateAction.js`, `shared/recomputeWorkflowAfterActionWrite.js`, `shared/getActions.js`, `shared/getActionFields.js`, `SubmitWorkflowAction/reevaluateBlockedActions.js`, `SubmitWorkflowAction/utils/getCurrentAction.js`, `SubmitWorkflowAction/utils/shouldUpdate.js`, and `SubmitWorkflowAction/fireTrackerSubscription.js` (+ its remaining live unit tests). Task 17 deletes them once Start/Cancel/Close are rewired (compose context via `shared/phases/createEngineContext.js`, feed `trackerFires` into `shared/phases/runTrackerCascade.js`).
- **Gate:** handler-level tests pass; obsolete files deleted per task 15 (Submit-only importers done; remainder deferred per above).

### Band 5 — Surfaces ✅ Done

- **Tasks:** 18 ✅, 19 ✅ (parallel-safe, **run before Band 4's task 17**) → 24 ✅ (docs-pass stub, last — after 17/18/19)
- **Depends on bands:** 3 for tasks 18/19 (their task-level deps are 4 and 6 — Bands 1–2 — plus Band 3's landed test fixtures); task 24 additionally waits for Band 4's 17
- **Progress:** All done. Gate notes: 18/19's unit suites green; the renamed page `_ref`s resolve; the demo Lowdefy build stays red on its one pre-existing error (pre-Part-34 shorthand `access` in the demo config — accepted until Part 45's rebuild). `start-workflow.yaml`'s `:return` `event_id` maps `undefined` until task 17 mints the `workflow-started` event (expected pre-17 state). The shared simple pages still send the legacy `interaction: submit_edit` wire shape — the page-side payload rewrite is owned by Part 40, not task 18 (rename-only).
- **Notes:** Display renames (18) + payload mapping (19). Neither depends on task 17, and both should land first: 18/19 touch fully disjoint file sets (pages/components/render vs resolvers/api/`planSubmit`) and are safe to run concurrently, then 17 closes out Band 4 on the renamed, re-keyed base (see Band 4 notes for the collision rationale). The demo capstone formerly here (task 20) is superseded by [Part 45](../../45-demo-rebuild/design.md)'s from-scratch demo rebuild — task 20 is now a stub pointing there. The docs pass (24) is a stub collecting README deferrals from tasks 4/14/19 — expand via `/r:design-docs` once 17/18/19 land.
- **Gate:** module builds with the renamed pages; emitted payloads carry `signal` (no `force`). The end-to-end exercise of the rebuilt engine is Part 45's demo rebuild + happy-path e2e (after Parts 43 and 44).

**Cross-band parallelism:** Bands 1 and 2 are independent and can run concurrently. Bands 4 and 5 interleave at the tail: Band 5's 18 ∥ 19 run first, then Band 4's 17, then Band 5's 24. All other bands are sequential on the band(s) listed.

**Open questions:** Q1–Q6 are all resolved in the design and baked into the relevant tasks as decisions. Q6 (form_data merge rule) resolved to a uniform deep-merge (objects deep-merge; arrays/scalars/`null` replace whole) onto the loaded `form_data.{action}` sub-object — its analysis and edge cases are embedded in task 11.

## Scope

**Source:** `designs/workflows-module/parts/38-engine-rebuild/design.md`
**Context files considered:** none — `design.md` is the only non-review file in the design folder. (Prerequisite concept/part designs referenced but not re-tasked here: `workflows-module-concept/state-machine/design.md`, Part 34 `_completed/34-action-access-model`, Part 35 `_completed/35-rename-task-kind-to-simple`, Part 30 `_rejected/30-status-map-rendering`.)
**Review files skipped:** `review/review-1.md` – `review/review-11.md`, `review/consistency-4.md`, `review/consistency-5.md`, `review/consistency-8.md`, `review/consistency-14.md`, `review/consistency-15.md` — all their decisions are already folded into `design.md` and these task files (reviews 4–11 were actioned directly into the tasks after the initial tasking pass). **Reviews 12–15 are actioned**: review-13's landed-code contract changes live in task 23; review-15's resolutions are folded into the implemented task 22; review-14's final `workflow-action-*` renames live in tasks 18/3. **Review-16 is actioned** into tasks 17/19 (shared `hookSignals.js` constant + `makeWorkflowsConfig` re-key + `event:`-key validation; complete payload mapping with the `action_type`/`workflow_type` literals dropped; start `metadata` threaded to seed-mode `planActionTransition`; seed-grammar comment replacing the "`signal` is documented" AC) and the new docs-pass stub, task 24.
