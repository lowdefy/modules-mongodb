# Workflows Module — Implementation Plan

Parallel delivery waves derived from the [dependency graph in design.md](design.md#dependency-graph). Each **wave** can run fully in parallel; the next wave starts once its predecessors land. The Repo column tells you where the diff goes; the Status column reflects what has shipped on `main` / been merged to the `workflows-module` branch.

**Shipped so far:** parts 3, 4, 5, 6, 14, 21, plus part 12 tasks 1–2 (resolver + placeholder templates; manifest wiring blocked on part 2). Engine can create, transition, and tear down workflows; group state machine + lifecycle extensions (part 7 onward) are next.

Status legend: `✅ shipped` · `🚧 in progress` · empty = not started.

## Wave 0 — Upstream Lowdefy primitives

These ship before anything else in the workflows module proper. They live in **upstream Lowdefy packages**, so they need to be cut as PRs against `lowdefy/lowdefy` (not this repo).

| #   | Part                                                            | Size | Repo                                          | Status |
| --- | --------------------------------------------------------------- | ---- | --------------------------------------------- | ------ |
| 1   | [call-api-primitive](parts/01-call-api-primitive/design.md)     | S    | upstream `@lowdefy/api`                       |        |
| 2   | [dynamic-module-pages](parts/02-dynamic-module-pages/design.md) | S    | upstream `@lowdefy/build` (or module loading) |        |

## Wave 1 — Foundations (parallel; no dependencies)

Engine shell and config schema unblock everything else. The form fields library has no deps either.

| #   | Part                                                                  | Size | Repo                                   | Status     |
| --- | --------------------------------------------------------------------- | ---- | -------------------------------------- | ---------- |
| 3   | [engine-plugin-shell](parts/03-engine-plugin-shell/design.md)         | M    | `plugins/modules-mongodb-plugins/`     | ✅ shipped |
| 4   | [workflow-config-schema](parts/04-workflow-config-schema/design.md)   | M    | `modules/workflows/`                   | ✅ shipped |
| 14  | [form-components-library](parts/14-form-components-library/design.md) | M    | `modules/workflows/components/fields/` | ✅ shipped |

## Wave 2 — Engine core + early resolvers (parallel)

Part 5 unlocks the rest of the engine. Resolver 12 depends on parts 2/4; resolver 15 depends on parts 4/12/14 (per the option-B template-`_ref` contract committed in part 15's review-1). Both can still stream in this wave since part 12's contract stabilizes early (tasks 1–2 already done).

| #   | Part                                                              | Size | Repo                                                           | Status     |
| --- | ----------------------------------------------------------------- | ---- | -------------------------------------------------------------- | ---------- |
| 5   | [start-cancel-handlers](parts/05-start-cancel-handlers/design.md) | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/` | ✅ shipped |
| 12  | [resolver-pages](parts/12-resolver-pages/design.md)               | M    | `modules/workflows/resolvers/`                                 | 🚧 tasks 1–2 done; task 3 (manifest wiring) held until part 2 lands |
| 15  | [resolver-form-builder](parts/15-resolver-form-builder/design.md) | M    | `modules/workflows/resolvers/`                                 |            |

## Wave 3 — The load-bearing write (solo)

Part 6 is the only **L**. Most of Wave 4 hangs off it, so it deserves its own bar.

| #   | Part                                                            | Size | Repo                                                                                | Status |
| --- | --------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- | ------ |
| 6   | [submit-action-writes](parts/06-submit-action-writes/design.md) | L    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` | ✅ shipped |

## Wave 4 — Lifecycle extensions + resolver-apis (parallel)

Each extends part 6's lifecycle orthogonally. Part 13 (resolver-apis) only needs parts 2/4/6, so it streams here.

| #   | Part                                                            | Size | Repo                                                                                | Status |
| --- | --------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- | ------ |
| 7   | [group-state-machine](parts/07-group-state-machine/design.md)   | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` |        |
| 8   | [side-effect-dispatch](parts/08-side-effect-dispatch/design.md) | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` |        |
| 10  | [tracker-subscription](parts/10-tracker-subscription/design.md) | S    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`                      |        |
| 13  | [resolver-apis](parts/13-resolver-apis/design.md)               | M    | `modules/workflows/resolvers/`                                                      |        |

## Wave 5 — Hooks, fan-out, operational APIs (parallel; need Wave 4)

Hook invocation needs parts 7 (groups) and 8 (side-effects). Fan-out needs 7 + 9. Part 19 only needs parts 5 and 7 — it could start earlier but pairs naturally here so the UI in Wave 6 has its dependency in hand.

| #   | Part                                                                    | Size | Repo                                                                                | Status |
| --- | ----------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- | ------ |
| 9   | [hook-invocation](parts/09-hook-invocation/design.md)                   | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` |        |
| 11  | [group-on-complete-fanout](parts/11-group-on-complete-fanout/design.md) | S    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` |        |
| 19  | [operational-apis](parts/19-operational-apis/design.md)                 | M    | `modules/workflows/api/`                                                            |        |

## Wave 6 — UI delivery (parallel; need resolvers + ops APIs)

All three need the resolver outputs from Waves 2/4 and (for 17/18) the operational APIs from part 19.

| #   | Part                                                      | Size | Repo                            | Status |
| --- | --------------------------------------------------------- | ---- | ------------------------------- | ------ |
| 16  | [page-templates](parts/16-page-templates/design.md)       | M    | `modules/workflows/templates/`  |        |
| 17  | [shared-pages](parts/17-shared-pages/design.md)           | M    | `modules/workflows/pages/`      |        |
| 18  | [entity-components](parts/18-entity-components/design.md) | M    | `modules/workflows/components/` |        |

## Wave 7 — Closeout

| #   | Part                                                  | Size | Repo                                | Status |
| --- | ----------------------------------------------------- | ---- | ----------------------------------- | ------ |
| 20  | [module-manifest](parts/20-module-manifest/design.md) | S    | `modules/workflows/` + `apps/demo/` |        |

## Follow-ons (added after the original waves)

These didn't exist when the dependency graph was cut; they slot wherever their deps land.

| #   | Part                                                                  | Size | Repo                                                           | Status     |
| --- | --------------------------------------------------------------------- | ---- | -------------------------------------------------------------- | ---------- |
| 21  | [entity-type-to-collection](parts/21-entity-type-to-collection/design.md) | M    | `plugins/modules-mongodb-plugins/` + `modules/workflows/`      | ✅ shipped |
| 22  | [workflows-e2e-suite](parts/22-workflows-e2e-suite/design.md)         | M    | `apps/demo/` (e2e harness)                                     |            |
| 23  | [close-workflow-handler](parts/23-close-workflow-handler/design.md)   | M    | `plugins/modules-mongodb-plugins/` + `modules/workflows/api/` |            |

## Repo footprint at a glance

| Repo                                           | Parts                                 |
| ---------------------------------------------- | ------------------------------------- |
| upstream `@lowdefy/*`                          | 1, 2                                  |
| `plugins/modules-mongodb-plugins/` (this repo) | 3, 5, 6, 7, 8, 9, 10, 11, 21, 23      |
| `modules/workflows/` (this repo)               | 4, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23 |
| `apps/demo/` (this repo)                       | 20 (wiring only), 22 (e2e suite)      |

Two clear streams once Wave 0 lands: an **engine stream** in the plugin package and a **module stream** under `modules/workflows/`. They only converge at part 20.
