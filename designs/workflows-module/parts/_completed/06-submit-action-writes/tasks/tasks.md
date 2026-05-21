# Implementation Tasks — Part 06: `SubmitWorkflowAction` core writes

## Overview

Replace the `SubmitWorkflowAction` stub (shipped by part 3, still throws `WorkflowAPINotImplemented`) with a working handler. Lands the 11-step lifecycle skeleton, but only steps 1, 3, 4, 5, 6 execute — steps 2 + 7–11 are no-op stubs with TODO comments pointing at the parts that light them up (parts 7–11). Also lands the Jest unit-test harness for the repo per [top-level § Testing conventions](../../../design.md#testing-conventions), plus the priority-rule extension of [part 5's `shared/updateAction.js` scaffold](../../05-start-cancel-handlers/design.md#shared-internal-helpers-in-srcconnectionsshared). Derived from `designs/workflows-module/parts/06-submit-action-writes/design.md`.

## Tasks

| #   | File                                                        | Summary                                                                                                                                       | Depends On |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-jest-harness-setup.md`                                  | Land Jest at repo root (devDeps + config + `inMemoryMongo.js` helper + `test` scripts). Rewrite the one `node:test` file to Jest.            | —          |
| 2   | `02-utils-get-current-action.md`                            | `utils/getCurrentAction.js` — pure reader; fetches one action doc by id.                                                                       | 1          |
| 3   | `03-utils-should-update.md`                                 | `utils/shouldUpdate.js` — priority rule + `currentActionId` self-exception + per-entry `force` bypass; pure function (no Mongo).               | 1          |
| 4   | `04-utils-should-create.md`                                 | `utils/shouldCreate.js` — gate for pre-hook `upsert: true` entries; pure function (no Mongo).                                                  | 1          |
| 5   | `05-extend-update-action.md`                                | Extend `shared/updateAction.js` in place: drop the `force !== true` guard; add priority-rule branch via `actionsEnum` + `shouldUpdate`.        | 2, 3       |
| 6   | `06-compute-auto-unblocks.md`                               | `SubmitWorkflowAction/computeAutoUnblocks.js` — walk `blocked_by`, emit `{ type, status: 'action-required' }` entries for now-unblocked types. | 1          |
| 7   | `07-handler-entry-and-scaffold.md`                          | Replace the `SubmitWorkflowAction.js` stub; build the engine context; wire `handleSubmit.js` with the 11-step scaffold and the return shape.    | 1          |
| 8   | `08-step-1-validate-and-translate.md`                       | Step 1: payload schema, action lookup, role gate, terminal-workflow gate, interaction → status mapping, build internal `actions[]` shape.       | 5, 7       |
| 9   | `09-step-3-auto-unblocks-wiring.md`                         | Step 3: call `computeAutoUnblocks`, merge entries into the internal `actions[]` before the write loop.                                          | 6, 8       |
| 10  | `10-step-4-write-action-transitions.md`                     | Step 4: per-entry loop over `actions[]`, call extended `updateAction` per entry. Self-exception writes a fresh audit entry.                     | 5, 8, 9    |
| 11  | `11-step-5-recompute-summary.md`                            | Step 5: load workflow actions, recompute `{ done, not_required, total }` counts, `$set` on the workflow doc.                                    | 10         |
| 12  | `12-step-6-write-form-data.md`                              | Step 6: merge `form` + `form_review` into one flat bag, `$set` per-field at `form_data.{action_type}[.{key}].{field}` on the workflow doc.      | 10         |
| 13  | `13-mid-write-error-transition.md`                          | Wrap steps 4–6 in a try/catch; on throw, force-push an `error` status entry onto the action and return partial.                                 | 10, 11, 12 |

## Ordering Rationale

**Foundation first (1).** The Jest harness has to land before any `*.test.js` file in the part — without it, every subsequent task has no place to put unit-test coverage. The top-level Testing conventions decision committed this to part 6's first task; honouring that here.

**Pure utilities next (2, 3, 4).** `getCurrentAction.js`, `shouldUpdate.js`, `shouldCreate.js` are the building blocks the priority-rule extension consumes. Each is small (≤ 30 LOC), pure (no Mongo for the latter two), and unit-testable in isolation against the harness from task 1. They can ship in parallel — three independent PRs or one combined utility PR.

**The load-bearing extension (5).** Extending `shared/updateAction.js` in place is the most architecturally significant step in this part — it adds the priority-rule branch that all of part 6's writes use, while preserving the `force: true` branch that parts 5, 10, and 23 already depend on. Lands after tasks 2 + 3 (the utilities it imports). Its full priority-rule + idempotency contract gets exercised by task 10's per-entry write loop.

**`computeAutoUnblocks.js` parallel (6).** Independent of the utilities and the `updateAction.js` extension — only needs the harness from task 1. Lands before step 3 wiring (task 9).

**Handler skeleton before the steps (7).** Task 7 replaces the `SubmitWorkflowAction.js` stub and lands the 11-step scaffold in `handleSubmit.js` — all 11 step bullets present, only 1, 3, 4, 5, 6 with real bodies (filled in by tasks 8–12); steps 2, 7, 8, 9, 10, 11 as TODO-commented no-ops. Carries the return shape skeleton too (with `completed_groups: []` placeholder, `event_id: null`, etc.). Other lifecycle-step tasks then fill in their slots.

**Lifecycle steps in dependency order (8 → 9 → 10 → 11 + 12).** Step 1 (task 8) builds the internal payload shape every later step reads from — must land before step 3 wiring (which appends to `actions[]`) and step 4 (which iterates over `actions[]`). Step 3 (task 9) only needs `computeAutoUnblocks` (task 6) and step 1's shape (task 8). Step 4 (task 10) is the per-entry write loop — needs the extended `updateAction.js` (task 5), step 1's translation (task 8), and step 3's auto-unblock merge (task 9). Steps 5 and 6 (tasks 11, 12) can run in parallel after step 4 lands — both depend on the action transitions having been written, but they don't conflict with each other (summary on workflow doc; form_data on workflow doc — different fields, both `$set` operations).

**Error wrapper last (13).** The mid-write error transition wraps steps 4–6 in a try/catch and force-pushes an `error` status entry. Must land after steps 4, 5, 6 have working bodies, because the wrapper needs the call sites to exist to wrap them.

**Parallelism after task 1:**

- Tasks 2, 3, 4, 6, 7 can all run in parallel (foundational; no interdependencies once the harness lands).
- Task 5 needs 2 + 3; task 8 needs 5 + 7.
- After task 8 lands, tasks 9 + 11 + 12 can run in parallel with task 10's per-entry loop (though 9 should land just before 10 so the auto-unblock entries actually get written).

### Verification posture

Part 06 ships **unit tests per task** per the top-level § Testing conventions. Coverage floor:

- **Pure-function tasks** (2, 3, 4, 6) — table-driven `*.test.js` colocated next to source. No Mongo.
- **Handler-touching tasks** (5, 7–13) — `*.test.js` colocated next to source. Use the `inMemoryMongo.js` helper from task 1 to spin up `mongodb-memory-server` and exercise `handleSubmit` end-to-end (handler-level integration smoke).
- **End-to-end coverage** lands in [part 22 — workflows-e2e-suite](../../22-workflows-e2e-suite/design.md) (`submit-action.spec.js`) once part 20's demo wiring lands. The unit tests here cover everything the e2e can't see cheaply (priority-rule edge cases, validation rejections, error-transition force-push posture).

### What's not in scope (deferred per design)

- **Group recompute, `blocked_by` group-id resolution, `completed_groups` payload** → part 7. Step 5 in this part only computes counts; the `completed_groups: []` placeholder in the return shape stays literal.
- **Auto-complete check** (push workflow `completed` when every action is terminal) → part 7. Step 5 here recomputes `summary` only.
- **Pre/post hooks, three-layer status resolution, `event_overrides`, `form_overrides`, `hook_error`, action YAML `interactions:` overrides** → part 9.
- **Log event + notifications dispatch** → part 8. Step 7 + 8 are no-op stubs in this part.
- **Tracker subscription fire** → part 10. Step 10 is a no-op stub.
- **Group `on_complete` fan-out** → part 11. Step 9 is a no-op stub.
- **User-initiated `CloseWorkflow` handler + `close-workflow` operational API** → part 23.
- **End-to-end Playwright coverage** → part 22.

## Scope

**Source:** `designs/workflows-module/parts/06-submit-action-writes/design.md`

**Context files considered:**

- `designs/workflows-module-concept/engine/spec.md` — load-bearing contract (Capabilities, Priority rule, Idempotency, References write contract, Action `error` transition, Form data layout, Ordering inside one `SubmitWorkflowAction` invocation).
- `designs/workflows-module-concept/submit-pipeline/spec.md` — per-action endpoint payload shape, lifecycle Flow numbering, three-layer status resolution.
- `designs/workflows-module-concept/action-authoring/spec.md` — `required_after_close` field semantics.
- `designs/workflows-module/design.md` — top-level § Testing conventions.
- `designs/workflows-module/parts/05-start-cancel-handlers/design.md` — shared helper layout (`createMongoDBConnection`, `getActions`, `getActionFields`, `populateIds`, `createAction.js`, `updateAction.js` scaffold).
- `designs/workflows-module/parts/05-start-cancel-handlers/tasks/03-update-action-helper-scaffold.md` — the scaffold this part extends in place.
- `designs/workflows-module/parts/07-group-state-machine/design.md` — auto-complete + group recompute seams (so step 5's `groups[]` defer here lines up).
- `designs/workflows-module/parts/09-hook-invocation/design.md` — pre-hook return merge contract (so the per-entry loop here composes with part 9's additions).
- `designs/workflows-module/parts/21-entity-type-to-collection/design.md` — payload contract uses `entity_collection` only.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/*.js` — existing stubs + schema.
- `plugins/modules-mongodb-plugins/src/connections/shared/*.js` — `createMongoDBConnection`, `getActions`, `getActionFields`, `populateIds`, `createAction.js`, `updateAction.js` (the scaffold from part 5).
- v0 `WorkflowAPI` handlers — `UpdateWorkflowActions.{handleUpdateActions,updateAction,utils/{shouldUpdate,shouldCreate,getCurrentAction}}` — reference shape for the priority-rule branch, the per-entry loop, the `$concatArrays` status push, and the upsert gate.

**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` (the design.md already incorporates all resolved findings).
