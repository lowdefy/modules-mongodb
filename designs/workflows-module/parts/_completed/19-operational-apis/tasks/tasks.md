# Implementation Tasks — Part 19: Operational APIs

## Overview

Ship the five module-shipped Lowdefy APIs that consuming apps call to manage workflows from the outside: three handler-wrappers (`start-workflow`, `cancel-workflow`, `close-workflow`) that proxy to the `WorkflowAPI` plugin connection's request types, plus two read aggregations (`get-entity-workflows`, `get-workflow-overview`) that query the `workflows-collection` and `actions-collection` connections with access filtering. Derived from `designs/workflows-module/parts/19-operational-apis/design.md`.

## Tasks

| #   | File                                  | Summary                                                                                                                  | Depends On |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-cancel-workflow-api.md`           | Create `modules/workflows/api/` directory and ship `cancel-workflow.yaml` — the smallest handler-wrapper routine.        | —          |
| 2   | `02-start-workflow-api.md`            | Ship `start-workflow.yaml` — handler-wrapper with optional `parent_action_id`, `actions`, `references` payload fields.    | 1          |
| 3   | `03-close-workflow-api.md`            | Ship `close-workflow.yaml` — handler-wrapper for the part-23 `CloseWorkflow` request type.                               | 1          |
| 4   | `04-access-filter-stage.md`           | Extract `api/stages/access_filter.yaml` — reusable MongoDB `$match` stage implementing verb-union + role-gate filtering. | —          |
| 5   | `05-get-entity-workflows-api.md`      | Ship `get-entity-workflows.yaml` — aggregation: find workflows for entity, lookup + filter actions, sort + group.        | 4          |
| 6   | `06-get-workflow-overview-api.md`     | Ship `get-workflow-overview.yaml` — aggregation: find one workflow, lookup + order + filter actions, null short-circuit. | 4          |
| 7   | `07-register-apis-in-manifest.md`     | Wire all five APIs into `modules/workflows/module.lowdefy.yaml` (`api:` array + `exports.api`).                          | 1, 2, 3, 5, 6 |

## Ordering Rationale

**Handler-wrappers first because they're the simplest shape (tasks 1–3).** All three are single-step routines that invoke a `WorkflowAPI` plugin connection request type and return its result. Task 1 ships `cancel-workflow` first because it has the smallest payload (just `workflow_id`, `reason?`, `references?`) and establishes the `modules/workflows/api/` directory plus the canonical request-step → `:return:` pattern that tasks 2 and 3 mirror. Tasks 2 and 3 can run in parallel after task 1 lands.

**The access filter is a foundational seam for both reads (task 4).** Per CLAUDE.md's "Extract request pipeline stages" rule and "Snake_case request IDs", the verb-union + role-gate `$match` stage lives in its own file at `api/stages/access_filter.yaml` and gets `_ref`'d into both read APIs. Building it first means tasks 5 and 6 don't duplicate the logic (and don't drift).

**Read aggregations are the meat (tasks 5–6).** Both consume the access filter from task 4 but have different shapes:

- Task 5 (`get-entity-workflows`) fans out: one entity → N workflows → actions filtered + grouped positionally by each workflow's persisted `groups[]`.
- Task 6 (`get-workflow-overview`) fans in: one workflow_id → one workflow + ordered actions, with the null-workflow short-circuit when all actions are inaccessible.

Tasks 5 and 6 can run in parallel after task 4.

**Registration last (task 7).** Per CLAUDE.md's "Register new APIs in lowdefy.yaml" rule, every new API file needs an `_ref` entry in the module manifest's `api:` array and a corresponding `exports.api` entry. Doing this last (rather than per-task) keeps the manifest edits batched and avoids merge churn if tasks 1–6 ship in different PRs.

**Parallelism available.** A single contributor would do 1 → (2, 3, 4 in parallel) → (5, 6 in parallel) → 7. Or 1 → 4 → (2, 3, 5, 6 in parallel) → 7.

## Verification posture

Part 19 ships **no unit tests of its own** — same posture as part 5. Lowdefy routines don't have a robust unit-test harness, and the design pins coverage to part 22's `operational-apis.spec.js` for end-to-end assertions against the worked-example onboarding workflow seeded by part 20.

What each task verifies:

- Tasks 1–3: routine builds without YAML errors; manifest registers the API; smoke-call from a fixture page returns the handler's shape.
- Task 4: aggregation stage parses and applies cleanly when `_ref`'d into a fixture aggregation.
- Tasks 5–6: aggregation pipelines build and return the expected shape for a seeded workflow.
- Task 7: `pnpm ldf:b` succeeds with all five APIs registered; build-time access to `_module.endpointId: { id: <api>, module: workflows }` resolves from a consumer page.

End-to-end coverage lands in [part 22 — workflows-e2e-suite](../../22-workflows-e2e-suite/design.md) (`operational-apis.spec.js`). A regression that part 22 doesn't catch is grounds to revisit this posture.

## What's not in scope (deferred per design)

- **Per-action `update-action-{action_type}` APIs** → part 13 (resolver-emitted via `makeWorkflowApis`).
- **References-collision validation** — handlers defend via `RESERVED_WORKFLOW_KEYS` deletion; the routine layer passes `references` through unchanged.
- **403-vs-null-object response** — committed: return `{ workflow: null, actions: [] }`; page-side redirects.
- **End-to-end Playwright coverage** → part 22.
- **Demo wiring** → part 20 (adds the workflows module entry to `apps/demo/modules.yaml` with the worked-example onboarding workflow).

## Scope

**Source:** `designs/workflows-module/parts/19-operational-apis/design.md`

**Context files considered:**

- `designs/workflows-module-concept/module-surface/spec.md` — load-bearing API surface contract (start/cancel/close payload shapes, get-entity-workflows and get-workflow-overview return shapes, access filter rule).
- `designs/workflows-module-concept/engine/spec.md` — references write contract, reserved-keys list, idempotency posture.
- `designs/workflows-module-concept/action-authoring/spec.md` — access verb-implication table (`edit`/`review` imply `view`), role-gate semantics.
- `designs/workflows-module/parts/_completed/05-start-cancel-handlers/design.md` — `StartWorkflow` / `CancelWorkflow` payload + return shapes.
- `designs/workflows-module/parts/23-close-workflow-handler/design.md` — `CloseWorkflow` payload + return shape.
- `designs/workflows-module/parts/_completed/07-group-state-machine/design.md` — persisted `groups[]` shape on the workflow doc.
- `apps/demo/.claude/guides/api-routines.md` — Lowdefy API routine patterns (step types, control flow, `_payload` / `_step` / `:return:`, `_module.connectionId`, `_ref` composition).
- `CLAUDE.md` — repo conventions (kebab-case API IDs, snake_case request IDs, snake_case stage file names, "Extract request pipeline stages", "Register new APIs in lowdefy.yaml", "Payload, not state").
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js` — connection exports the three request types (`StartWorkflow`, `CancelWorkflow`, `SubmitWorkflowAction`); part 23 adds `CloseWorkflow`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/{StartWorkflow,CancelWorkflow}/*.js` — handler payload and return contracts.
- `modules/workflows/resolvers/makeWorkflowApis.js` — reference example of a Lowdefy routine invoking a `WorkflowAPI` request type via `_module.connectionId: workflow-api`.
- `modules/files/api/{save-file,delete-file}.yaml`, `modules/activities/api/create-activity.yaml`, `modules/contacts/api/{create,update}-contact.yaml` — reference API yaml shapes.

**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` (the design.md already incorporates all resolved findings).
