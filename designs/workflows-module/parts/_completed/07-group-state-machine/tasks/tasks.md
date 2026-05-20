# Implementation Tasks — Part 07: Group state machine

## Overview

Promote `action_group` from UI label to engine concept. Lands one pure derivation helper (`deriveGroupStatus`), one build-time validator extension (`makeWorkflowsConfig`), three new engine helpers (`recomputeGroups`, `pushWorkflowStatus`, `reevaluateBlockedActions`), and in-place extensions of three shipped handlers (`StartWorkflow`, `CancelWorkflow`, `handleSubmit` + `computeAutoUnblocks`). Derived from `designs/workflows-module/parts/07-group-state-machine/design.md`.

## Tasks

| #   | File                                                | Summary                                                                                                                                          | Depends On |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-derive-group-status.md`                         | `deriveGroupStatus.js` — pure 3-value enum derivation over a group's actions.                                                                    | —          |
| 2   | `02-validator-blocked-by-resolution.md`             | Extend `makeWorkflowsConfig.js` with the build-time `blocked_by` resolution check; fail the build on unresolved entries.                         | —          |
| 3   | `03-recompute-groups.md`                            | `recomputeGroups.js` — pure helper that builds the full `groups[]` array (one entry per declared group) from actions + config.                   | 1          |
| 4   | `04-push-workflow-status.md`                        | `shared/pushWorkflowStatus.js` — workflow-status push helper with the same-stage no-op guard; consumed by auto-complete (and future callers).    | —          |
| 5   | `05-extend-start-workflow.md`                       | Extend shipped `StartWorkflow.js` to pre-populate `groups[]` at workflow creation (replacing the `groups: []` placeholder).                      | 1, 3       |
| 6   | `06-extend-compute-auto-unblocks.md`                | Extend shipped `computeAutoUnblocks.js` with the group-id resolution branch (reads group status from the workflow's in-memory `groups[]`).       | 1          |
| 7   | `07-reevaluate-blocked-actions.md`                  | `reevaluateBlockedActions.js` — post-write walk (sub-step 4b) that pushes `action-required` on every blocked action whose deps are now satisfied.| 1          |
| 8   | `08-wire-substeps-into-handle-submit.md`            | Wire sub-steps 4a (group recompute), 4b (walk), 4c (auto-complete stage) into `handleSubmit.js`; extend step 5's `$set`; populate `completed_groups`. | 3, 6, 7    |
| 9   | `09-extend-cancel-workflow.md`                      | Extend shipped `CancelWorkflow.js`: fold `groups[]` into the existing summary recompute (extend projection + same `$set`).                       | 1, 3       |

## Ordering Rationale

**Foundation first (1, 2).** `deriveGroupStatus` is the pure derivation rule every later task reads — every handler that touches groups computes status through it. Task 2 (the build-time validator extension) is independent of every engine task — it only touches `makeWorkflowsConfig.js` and its test file, no shared helpers. Both can ship in parallel.

**Pure helpers next (3, 4).** `recomputeGroups` builds the full `groups[]` array — needed by both `StartWorkflow` (initial population) and `handleSubmit` step 4a (incremental recompute). `pushWorkflowStatus` is the shared workflow-status helper consumed by auto-complete in task 8. Both depend only on task 1 (or are independent). Can ship in parallel after task 1.

**Handler extensions in two parallel branches (5, 6, 7).** Once tasks 1, 3, 4 land:
- Task 5 extends `StartWorkflow.js` — depends on 1 + 3 (uses `deriveGroupStatus` + `recomputeGroups`). Independent of the submit / cancel paths.
- Task 6 extends `computeAutoUnblocks.js` — depends only on task 1; consumed by step 3 of the submit lifecycle (already wired in part 6's handleSubmit).
- Task 7 ships `reevaluateBlockedActions.js` — depends only on task 1 (also uses shipped `shared/updateAction.js` from part 6). It's a new file; the wiring lands in task 8.

These three are independent of each other and can run in parallel.

**The big wire-up (8).** Task 8 is the load-bearing handler extension. It edits `handleSubmit.js` to call `recomputeGroups` (4a), `reevaluateBlockedActions` (4b), and inline the auto-complete same-stage check (4c) between step 4 and step 5, then extends step 5's existing `$set` to include `groups[]` and the optional `status` push. Also swaps `completed_groups: []` (the part-6 placeholder) for the real `[{ workflow_id, id, on_complete? }]` entries computed from the recompute deltas. Needs tasks 3, 6, 7. Task 4 ships in parallel as a shared helper for future callers (parts 10, 23) but isn't imported here — the bundled-`$set` approach inlines the same-stage check.

**Cancel last (9).** `CancelWorkflow` extension is the most isolated handler change — it doesn't touch the submit path. Lands last because it's independent of task 8 and the smallest risk of conflict; an implementer can pick it up after the submit-side is reviewed.

**Parallelism:**

- Tasks 1, 2, 4 can run in parallel from the start (no interdependencies).
- Task 3 lands after 1.
- Tasks 5, 6, 7 can all run in parallel after 1 + 3 land (5 also needs 3).
- Task 8 lands after 3, 6, 7. (Task 4 is independent — ships in parallel as a shared helper for future callers; not imported by task 8.)
- Task 9 can run any time after 1 + 3.

### Verification posture

Per the top-level [§ Testing conventions](../../../design.md#testing-conventions): every task ships a colocated `*.test.js`.

- **Pure-function tasks** (1, 3) — table-driven Jest tests, no Mongo.
- **Validator extension** (2) — extend `modules/workflows/resolvers/makeWorkflowsConfig.test.js` (already exists from part 4).
- **Shared engine helper** (4) — colocated Jest test using `inMemoryMongo.js` (shipped by part 6 task 1).
- **Handler extensions** (5, 6, 7, 8, 9) — colocated `*.test.js`, use `inMemoryMongo.js`, exercise the handler end-to-end at the unit level.
- **End-to-end coverage** lands in [part 22 — workflows-e2e-suite](../../22-workflows-e2e-suite/design.md) via `submit-action.spec.js`. The unit tests here cover everything e2e can't see cheaply (empty-group edge cases, single-pass-walk invariants, same-stage-guard rejections, validator error paths).

### What's not in scope (deferred per design)

- **`on_complete` hook invocation** — part 7 surfaces `completed_groups` metadata; firing the Apis is [part 11](../../11-group-on-complete-fanout/design.md). Task 8 produces the entries; nothing in this part calls them.
- **End-to-end Playwright coverage** — [part 22](../../22-workflows-e2e-suite/design.md) owns `submit-action.spec.js`.

## Scope

**Source:** `designs/workflows-module/parts/07-group-state-machine/design.md`

**Context files considered:**

- `designs/workflows-module-concept/action-groups/spec.md` — load-bearing contract (3-value enum, persistence shape, lifecycle flow, on_complete invocation rules, cancellation rule).
- `designs/workflows-module-concept/engine/spec.md` — `pushWorkflowStatus` signature + same-stage guard, ordering inside one `SubmitWorkflowAction` invocation, priority rule (for the walk's action pushes).
- `designs/workflows-module/design.md` — top-level § Testing conventions.
- `designs/workflows-module/parts/04-workflow-config-schema/design.md` — the existing collision check + the `blocked_by` resolution deferral.
- `designs/workflows-module/parts/05-start-cancel-handlers/design.md` — shipped `StartWorkflow`, `CancelWorkflow`, `shared/updateAction.js` scaffold.
- `designs/workflows-module/parts/06-submit-action-writes/design.md` — shipped `handleSubmit.js` lifecycle (the part-7 seam markers are already in place), extended `updateAction.js`, `computeAutoUnblocks.js`.
- `designs/workflows-module/parts/11-group-on-complete-fanout/design.md` — consumer contract for `completed_groups`.
- `modules/workflows/resolvers/makeWorkflowsConfig.js` + `.test.js` — the resolver being extended.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — the shipped initial-write path being extended.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — the shipped cancel path; lines 86–108 hold the projection + summary write being extended.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/{handleSubmit.js,computeAutoUnblocks.js}` — shipped submit path; part-7 seam comments already in place.
- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js` — extended by part 6; consumed by sub-step 4b's walk.

**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` (the design.md already incorporates all resolved findings).
