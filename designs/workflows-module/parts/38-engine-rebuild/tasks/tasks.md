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
| 17  | `17-start-cancel-close-rewrite.md`          | Rewrite Start/Cancel/Close around phases; each emits a lifecycle log event            | 10,11,12,13    |
| 18  | `18-display-surface-renames.md`             | Rename fixed pages `workflow-*`, update `_module.pageId` refs + `message`/`links`     | 4, 6           |
| 19  | `19-emitted-payload-surfaces.md`            | `makeWorkflowApis` payload mapping (drop `force`, add `signal`) + `start-workflow`    | 6              |
| 20  | `20-demo-migration.md`                      | Migrate demo `workflow_config` to signals/access map + notification config            | 7,8,15,17,18,19 |

## Implementation Bands

The 20 tasks group into five dependency bands. **A band is the unit of work** — point an agent at this file and a band number ("implement Band 3 of `38-engine-rebuild`"); it implements every task in the band, in the listed internal order, then runs the band's gate before stopping.

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

### Band 3 — Phases (load · plan · commit)

- **Tasks:** 9 → 10, 11, 12 (parallel-safe after 9) → 13, 14
- **Depends on bands:** 1, 2
- **Q6 (form_data merge rule) — RESOLVED:** uniform deep-merge (objects deep-merge; arrays/scalars/`null` replace whole) onto the loaded `form_data.{action}` sub-object. The resolved rule is baked into task 11; no decision remains before implementing `planFormDataMerge`.
- **Notes:** Phase types + load phase (9) anchor the contracts. Planners (10–12) are pure functions over FSM/render. Commit (13) and hook wrappers (14) close the cycle. The write-path-coupled Part 34 pieces — the submit-time access gate (in load, 9) and per-verb `computeEngineLinks` (in render, 3) — live here because they share the rebuild's surface.
- **Gate:** planner unit tests pass; commit phase tested on both transaction and standalone paths incl. the CAS-miss gate.

### Band 4 — Handler rewrites

- **Tasks:** 15 → 16; 17 (parallel-safe with 15/16)
- **Depends on bands:** 3
- **Notes:** Submit (15) is the reference handler. The tracker cascade (16) reuses 100% of the Submit planner machinery and so follows it. Start/Cancel/Close (17) compose the same phases independently and can run parallel to 15/16.
- **Gate:** handler-level tests pass; obsolete files deleted per task 15.

### Band 5 — Surfaces + demo

- **Tasks:** 18, 19 (parallel-safe) → 20
- **Depends on bands:** 4 (and 1–3 transitively)
- **Notes:** Display renames (18) + payload mapping (19), capped by the demo migration (20) — the only in-tree end-to-end exercise of the rebuild, which is why it depends on nearly everything.
- **Gate:** demo `workflow_config` migrated; end-to-end run exercises the rebuilt engine.

**Cross-band parallelism:** Bands 1 and 2 are independent and can run concurrently. All other bands are sequential on the band(s) listed.

**Open questions:** Q1–Q6 are all resolved in the design and baked into the relevant tasks as decisions. Q6 (form_data merge rule) resolved to a uniform deep-merge (objects deep-merge; arrays/scalars/`null` replace whole) onto the loaded `form_data.{action}` sub-object — its analysis and edge cases are embedded in task 11.

## Scope

**Source:** `designs/workflows-module/parts/38-engine-rebuild/design.md`
**Context files considered:** none — `design.md` is the only non-review file in the design folder. (Prerequisite concept/part designs referenced but not re-tasked here: `workflows-module-concept/state-machine/design.md`, Part 34 `_completed/34-action-access-model`, Part 35 `_completed/35-rename-task-kind-to-simple`, Part 30 `_rejected/30-status-map-rendering`.)
**Review files skipped:** `review/review-1.md` – `review/review-7.md`, `review/consistency-4.md`, `review/consistency-5.md` — all review decisions are already folded into `design.md` and these task files (reviews 4–7 were actioned directly into the tasks after the initial tasking pass).
