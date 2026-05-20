# Implementation Tasks — Part 05: `StartWorkflow` + `CancelWorkflow` handlers

## Overview

Replace the two stub handlers (`StartWorkflow`, `CancelWorkflow`) shipped by part 03 with working implementations, plus the shared helpers (`createAction`, `updateAction` scaffold) and the connection-schema extension (`changeStamp`) they require. Derived from `designs/workflows-module/parts/05-start-cancel-handlers/design.md`.

## Tasks

| #   | File                                                         | Summary                                                                                                    | Depends On |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-add-change-stamp-to-connection-schema.md`                | Add `changeStamp` property to the `WorkflowAPI` connection schema.                                          | —          |
| 2   | `02-create-action-helper.md`                                 | Build `src/connections/shared/createAction.js` — pure builder that returns an action doc draft.             | —          |
| 3   | `03-update-action-helper-scaffold.md`                        | Build `src/connections/shared/updateAction.js` minimal scaffold — `force: true` status push only.           | —          |
| 4   | `04-start-workflow-happy-path.md`                            | Implement `StartWorkflow` for the no-parent case: validation, workflow + action docs writes, initial summary. | 1, 2       |
| 5   | `05-start-workflow-parent-linking.md`                        | Add `parent_action_id` validation block + parent-side writes to `StartWorkflow`.                            | 3, 4       |
| 6   | `06-cancel-workflow.md`                                      | Implement `CancelWorkflow`: cancelled status push, non-terminal action flips, summary recompute.            | 1, 3       |

## Ordering Rationale

**Foundation first (1, 2, 3).** Tasks 1–3 are pure additive infrastructure with no dependencies. They can ship in parallel — three independent PRs, or one combined "shared helpers + schema" PR if the reviewer prefers. None of them changes any handler behaviour; the handler stubs still throw `WorkflowAPINotImplemented` after these land.

**StartWorkflow splits along the parent-link seam (4, 5).** Task 4 ships the no-parent code path — payload validation (workflow-type + keyed-action check), workflow doc + action docs writes, initial summary, change stamps, and the basic happy-path return. It needs `createAction` (task 2) and the schema extension (task 1), but not `updateAction` (which is only used for the parent push). Task 5 adds the parent-link surface on top: the second validation rule set (`kind: tracker`, `child_workflow_id` null, `tracker.workflow_type` match) plus the three-field write + `force: true` `in-progress` push via `updateAction` (task 3). This split keeps each task small and testable in isolation.

**CancelWorkflow (6) is independent of StartWorkflow.** It only needs the schema extension (1) and `updateAction` (3) — flipping every non-terminal action to `not-required` is exactly what the scaffold's `force: true` path does. Can ship in parallel with tasks 4 and 5.

**Parallelism available after task 1.** Tasks 2, 3, 6 can run in parallel with the StartWorkflow tasks once schema landed. Realistically: a single contributor would do 1 → (2, 3 together) → 4 → 5 + 6 in parallel.

### Verification posture

Part 05 ships **no unit tests of its own**. The verification floor is:

- The integration smoke at `design.md` § Verification ("end-to-end through a fixture app with one trivial workflow definition") — manual or as part of a downstream task.
- End-to-end coverage in [part 22 — workflows-e2e-suite](../22-workflows-e2e-suite/design.md) (`start-cancel.spec.js`), which exercises both handlers against the worked-example onboarding workflow once part 20's demo wiring lands.

A dedicated unit-test task was considered and dropped: most assertions overlapped part 22's e2e coverage, and the dispatcher-mock fixture surface (mocking every `MongoDBInsertOne` / `MongoDBInsertMany` / `MongoDBUpdateOne` / `MongoDBUpdateMany` / `MongoDBFind` / `MongoDBFindOne` shape) carries non-trivial drift risk against the community-plugin handler contract. The validation-rejection cases that aren't well-covered by e2e (keyed-action check, parent-link `workflow_type` mismatch, etc.) are cheap enough to spec into part 22's `start-cancel.spec.js` directly. If a regression surfaces between part 05 landing and part 22 landing, revisit.

### What's not in scope (deferred per design)

- **Group recompute on cancel** → owned by part 7's `CancelWorkflow` integration.
- **Log event + notifications on cancel** → part 8. v1 cancel writes no event.
- **Tracker subscription fire on parent cancel** → part 10.
- **`updateAction` priority-rule logic** → part 6 extends task 3's scaffold in place; task 3 ships only the `force: true` shape needed by the cancel path.
- **`entity_type` field on docs** — part 21 owns the rename to `entity_collection`-only. Part 05 tasks write only `entity_collection` (no `entity_type`) per the design's current payload contract.
- **Unit-test suite for this part** — see "Verification posture" above; e2e in part 22 is the coverage floor.
- **End-to-end Playwright coverage** → part 22.

## Scope

**Source:** `designs/workflows-module/parts/05-start-cancel-handlers/design.md`

**Context files considered:**
- `designs/workflows-module-concept/engine/spec.md` — load-bearing contract (Capabilities, Client and transaction model, Idempotency, References write contract, Tracker subscription pseudo-code).
- `designs/workflows-module-concept/engine/design.md` — Decision 3 (parent ↔ child link shape).
- `designs/workflows-module-concept/action-authoring/spec.md` — `starting_actions` grammar, instanced-actions semantics.
- `designs/workflows-module/parts/03-engine-plugin-shell/design.md` — connection scaffold + `shared/` layout already on disk.
- `designs/workflows-module/parts/21-entity-type-to-collection/design.md` — payload contract (`entity_type` dropped).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/*.js` — existing stubs + schema.
- `plugins/modules-mongodb-plugins/src/connections/shared/{createMongoDBConnection,getActions,getActionFields,populateIds,types}.js` — existing helpers + dispatcher.
- v0 `WorkflowAPI` handlers — `StartWorkflow.createActions`, `CloseWorkflowActions.handleCloseActions`, `UpdateWorkflowActions.updateAction` — used as reference for the dispatcher call shape and the `$push: { $position: 0, $each: [...] }` newest-at-index-0 pattern.

**Review files skipped:** `review/review-1.md`, `review/consistency-2.md` (the design.md already incorporates all resolved findings).
