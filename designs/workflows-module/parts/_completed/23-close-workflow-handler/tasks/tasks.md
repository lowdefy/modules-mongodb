# Implementation Tasks — Part 23 `CloseWorkflow` handler

## Overview

Implements [Part 23 — `CloseWorkflow` handler](../design.md): a user-initiated workflow termination that pushes `completed` (not `cancelled`), sweeps non-terminal actions to `not-required` while honouring `required_after_close: true` (with the blocked-action exception), and fires tracker subscription on parent close. Adds a `close-workflow.yaml` operational API routine alongside the existing handlers in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Tasks

| #   | File                                        | Summary                                                                                                  | Depends On |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-scaffold-handler.md`                    | Create `CloseWorkflow/` directory + `CloseWorkflow.js` skeleton; register it in `WorkflowAPI.js`         | —          |
| 2   | `02-validate-payload-and-stage.md`          | Validate payload, fetch workflow, gate by current stage (`active` proceeds; `completed` no-op; `cancelled` rejects) | 1          |
| 3   | `03-push-completed-and-defend-references.md` | `RESERVED_WORKFLOW_KEYS` defensive delete on `references`; push `completed` via an inline `MongoDBUpdateOne` (mirrors `CancelWorkflow.js:55–69`) | 2          |
| 4   | `04-conditional-action-sweep.md`            | Three-step bulk sweep: fetch candidates → in-memory filter against `workflowsConfig` → `MongoDBUpdateMany` | 3          |
| 5   | `05-recompute-summary-and-groups.md`        | Re-read actions, recompute `summary` + `groups[]` via `recomputeGroups`, one `MongoDBUpdateOne` writeback | 4          |
| 6   | `06-tracker-subscription-and-return.md`     | Call `fireTrackerSubscription` after writeback; populate `tracker_fired` in return shape                 | 5          |
| 7   | `07-close-workflow-yaml.md`                 | Create `modules/workflows/api/close-workflow.yaml` operational API routine                              | 1          |

## Ordering Rationale

Tasks 1–6 build the handler incrementally, each leaving the file in a runnable + testable state:

- **Task 1** ships the smallest verifiable unit: the handler exists, is wired into `WorkflowAPI.js`, and accepts the payload shape. Throws "not implemented" so the test surface is just "handler is reachable + accepts a `workflow_id`".
- **Task 2** layers the validation gate (workflow exists, stage check). Sets the structural shape — early-return on already-`completed`, throw on already-`cancelled`. From here on, the happy path is the `active` workflow.
- **Task 3** does the first write: status push + defensive `references` spread. Inline `MongoDBUpdateOne` mirroring `CancelWorkflow.js:55–69` — the shipped `pushWorkflowStatus.js` helper doesn't fit because it can't carry `reason` on the entry or a `$set` of defended `references`.
- **Task 4** is the interesting logic — the conditional sweep. Diverges from shipped `CancelWorkflow.js`'s blanket-flip by filtering against `required_after_close` and the blocked-exception in-memory. Standalone-testable: assert sweep filter behaviour without touching summary/groups/tracker.
- **Task 5** rounds out the writes — summary + groups recompute. Verifies the asymmetry from design.md:34 (groups containing `required_after_close: true` survivors land non-`done`).
- **Task 6** lights up the tracker subscription. Part 10 has shipped (`fireTrackerSubscription.js` exists in the repo); the handler calls it the same way `CancelWorkflow.js` does and returns the populated `tracker_fired` array. Closes the return-shape contract.

**Task 7** is the operational API yaml — separately verifiable. Depends only on Task 1 (the request must be registered to be invokable from the routine). Could run in parallel with Tasks 2–6 if the implementer wants the API surface wired before the body is complete, since the routine layer doesn't care about handler semantics.

End-to-end coverage (the `close-workflow.spec.js` Playwright file under `apps/demo/e2e/workflows/`) lands in [Part 22](../../22-workflows-e2e-suite/design.md), not in this part's tasks. Per the design's Verification section, this part's verification is unit-tests + handler-level integration smoke only.

## Scope

**Source:** `designs/workflows-module/parts/23-close-workflow-handler/design.md`
**Context files considered:** none beyond `design.md` — Part 23 has no separate supporting files (no `considerations.md`, `research.md`, or deep dives).
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md`.

**Verified against shipped code** (to ground task prompts):

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — reference implementation for the inline-shape pattern, `RESERVED_WORKFLOW_KEYS` list, `MongoDBUpdateMany` sweep, summary + groups recompute, and tracker subscription wiring.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.test.js` — test fixture pattern (`inMemoryMongo`, `makeLowdefyContext`, seed helpers).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js` — request registration shape.
- `plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.js` — helper signature (verified to justify NOT using it; see Task 3).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js` — groups helper signature.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` — tracker helper signature (Part 10 has shipped).
