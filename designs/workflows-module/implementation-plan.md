# Workflows Module — Implementation Plan

Parallel delivery waves derived from the [dependency graph in design.md](design.md#dependency-graph). Each **wave** can run fully in parallel; the next wave starts once its predecessors land. The Repo column tells you where the diff goes.

## Wave 0 — Upstream Lowdefy primitives

These ship before anything else in the workflows module proper. They live in **upstream Lowdefy packages**, so they need to be cut as PRs against `lowdefy/lowdefy` (not this repo).

| #   | Part                                                            | Size | Repo                                          |
| --- | --------------------------------------------------------------- | ---- | --------------------------------------------- |
| 1   | [call-api-primitive](parts/01-call-api-primitive/design.md)     | S    | upstream `@lowdefy/api`                       |
| 2   | [dynamic-module-pages](parts/02-dynamic-module-pages/design.md) | S    | upstream `@lowdefy/build` (or module loading) |

## Wave 1 — Foundations (parallel; no dependencies)

Engine shell and config schema unblock everything else. The form fields library has no deps either.

| #   | Part                                                                  | Size | Repo                                   |
| --- | --------------------------------------------------------------------- | ---- | -------------------------------------- |
| 3   | [engine-plugin-shell](parts/03-engine-plugin-shell/design.md)         | M    | `plugins/modules-mongodb-plugins/`     |
| 4   | [workflow-config-schema](parts/04-workflow-config-schema/design.md)   | M    | `modules/workflows/`                   |
| 14  | [form-components-library](parts/14-form-components-library/design.md) | M    | `modules/workflows/components/fields/` |

## Wave 2 — Engine core + early resolvers (parallel)

Part 5 unlocks the rest of the engine. Resolvers 12 and 15 only depend on parts 2/4/14, so they can stream alongside.

| #   | Part                                                              | Size | Repo                                                           |
| --- | ----------------------------------------------------------------- | ---- | -------------------------------------------------------------- |
| 5   | [start-cancel-handlers](parts/05-start-cancel-handlers/design.md) | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/` |
| 12  | [resolver-pages](parts/12-resolver-pages/design.md)               | M    | `modules/workflows/resolvers/`                                 |
| 15  | [resolver-form-builder](parts/15-resolver-form-builder/design.md) | M    | `modules/workflows/resolvers/`                                 |

## Wave 3 — The load-bearing write (solo)

Part 6 is the only **L**. Most of Wave 4 hangs off it, so it deserves its own bar.

| #   | Part                                                            | Size | Repo                                                                                |
| --- | --------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- |
| 6   | [submit-action-writes](parts/06-submit-action-writes/design.md) | L    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` |

## Wave 4 — Lifecycle extensions + resolver-apis (parallel)

Each extends part 6's lifecycle orthogonally. Part 13 (resolver-apis) only needs parts 2/4/6, so it streams here.

| #   | Part                                                            | Size | Repo                                                                                |
| --- | --------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- |
| 7   | [group-state-machine](parts/07-group-state-machine/design.md)   | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` |
| 8   | [side-effect-dispatch](parts/08-side-effect-dispatch/design.md) | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` |
| 10  | [tracker-subscription](parts/10-tracker-subscription/design.md) | S    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`                      |
| 13  | [resolver-apis](parts/13-resolver-apis/design.md)               | M    | `modules/workflows/resolvers/`                                                      |

## Wave 5 — Hooks, fan-out, operational APIs (parallel; need Wave 4)

Hook invocation needs parts 7 (groups) and 8 (side-effects). Fan-out needs 7 + 9. Part 19 only needs parts 5 and 7 — it could start earlier but pairs naturally here so the UI in Wave 6 has its dependency in hand.

| #   | Part                                                                    | Size | Repo                                                                                |
| --- | ----------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- |
| 9   | [hook-invocation](parts/09-hook-invocation/design.md)                   | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` |
| 11  | [group-on-complete-fanout](parts/11-group-on-complete-fanout/design.md) | S    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` |
| 19  | [operational-apis](parts/19-operational-apis/design.md)                 | M    | `modules/workflows/api/`                                                            |

## Wave 6 — UI delivery (parallel; need resolvers + ops APIs)

All three need the resolver outputs from Waves 2/4 and (for 17/18) the operational APIs from part 19.

| #   | Part                                                      | Size | Repo                            |
| --- | --------------------------------------------------------- | ---- | ------------------------------- |
| 16  | [page-templates](parts/16-page-templates/design.md)       | M    | `modules/workflows/templates/`  |
| 17  | [shared-pages](parts/17-shared-pages/design.md)           | M    | `modules/workflows/pages/`      |
| 18  | [entity-components](parts/18-entity-components/design.md) | M    | `modules/workflows/components/` |

## Wave 7 — Closeout

| #   | Part                                                  | Size | Repo                                |
| --- | ----------------------------------------------------- | ---- | ----------------------------------- |
| 20  | [module-manifest](parts/20-module-manifest/design.md) | S    | `modules/workflows/` + `apps/demo/` |

## Repo footprint at a glance

| Repo                                           | Parts                                 |
| ---------------------------------------------- | ------------------------------------- |
| upstream `@lowdefy/*`                          | 1, 2                                  |
| `plugins/modules-mongodb-plugins/` (this repo) | 3, 5, 6, 7, 8, 9, 10, 11              |
| `modules/workflows/` (this repo)               | 4, 12, 13, 14, 15, 16, 17, 18, 19, 20 |
| `apps/demo/` (this repo)                       | 20 (wiring only)                      |

Two clear streams once Wave 0 lands: an **engine stream** in the plugin package and a **module stream** under `modules/workflows/`. They only converge at part 20.
