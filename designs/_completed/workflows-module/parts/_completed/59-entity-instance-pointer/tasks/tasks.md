# Implementation Tasks — Part 59: Nested entity instance pointer

## Overview

These tasks collapse the workflows engine's flat entity identity (`entity_collection` + `entity_id` + `entity_ref_key`, plus `parent_*`/`child_*` denormalizations) into a single nested `entity` object — at the document, param, query, index, denormalization, and engine-read layers — so entity identity is represented one way end to end. Derived from `designs/workflows-module/parts/59-entity-instance-pointer/design.md`.

## Dependency on Part 57 (read first)

This part **depends on the updated Part 57** (`parts/57-inline-entity-config`), which puts `connection_id` + `ref_key` in the config `entity:` block (kept nested, not lifted to flat names) and owns:

- the config `entity:` block shape and its build-time validation in `makeWorkflowsConfig`,
- the `WORKFLOW_FIELDS` normalization,
- the `workflowsConfig` schema `required` list and the `entities` connection-param removal in `WorkflowAPI/schema.js`,
- `makeActionPages.js:86` (`workflow.entity_collection` → `workflow.entity.connection_id`, and the build-var **key** rename `entity_collection:` → `connection_id:`),
- folding the nine workflows-test `workflow_config` **definitions** (top-level `entity_collection`/`entity_ref_key`) and the app's `vars.entities` map into the nested `entity:` block,
- the `entities[...]`-lookup refactor in the overview/action read methods (so routing fields source from `wfConfig.entity`).

**Sequence: Part 57 → Part 59.** The repo may be in a broken state between them (unreleased modules, no consumers) — that is acceptable. Every Part 59 task that reads `workflowConfig.entity.connection_id` / `workflowConfig.entity.ref_key` assumes Part 57 has landed.

## Tasks

| #   | File                                            | Summary                                                                                  | Depends On |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-typedefs-and-comment-sweep.md`              | Nest entity in `types.js` typedefs; update stale flat-shape doc comments (no behaviour)  | —          |
| 2   | `02-planners-nested-entity.md`                  | `planActionTransition` action-doc seed + `planEventDispatch` ref_key/entity.id reads     | 1          |
| 3   | `03-start-workflow.md`                          | StartWorkflow: param, nested doc write + ref_key fold-in, parent/child denorm            | 2          |
| 4   | `04-get-entity-workflows.md`                    | GetEntityWorkflows: nested param, dotted query, `wfDoc.entity.id` link                   | 1          |
| 5   | `05-overview-and-action-reads.md`               | Overview/GroupOverview link value + GetWorkflowAction link value & nested response       | 1          |
| 6   | `06-cancel-close-reserved-keys.md`              | Cancel/Close `RESERVED_WORKFLOW_KEYS`: flat entity keys → `'entity'`                     | 1          |
| 7   | `07-compute-engine-links-sentinel.md`           | `computeEngineLinks` sentinel value source → `action.entity.id` (keyword stays flat)     | 1          |
| 8   | `08-engine-test-fixture-sweep.md`               | Nest entity fixtures in the remaining engine suites whose source is unchanged            | 2, 3       |
| 9   | `09-make-workflow-apis-start-endpoint.md`       | Generated start endpoint: drop `entity_collection`, map `entity: { id }`                 | 3          |
| 10  | `10-get-entity-workflows-api-and-components.md` | `get-entity-workflows.yaml` whole-object forward; entity-workflow components nest+rename | 4          |
| 11  | `11-action-page-templates-and-get-entity.md`    | Action page templates `connection_id` var; `get_entity` reads `entity.id`                | 5          |
| 12  | `12-demo-app-callers.md`                        | Demo: start payloads, get-entity-workflows callers, hook reads, var rename, e2e          | 9, 10      |
| 13  | `13-workflows-test-app-callers.md`              | workflows-test: runtime start callers, get-entity-workflows callers, e2e + fixture       | 9, 10      |
| 14  | `14-docs-sweep.md`                              | indexes.md, how-to + concept/reference pages: nested shape, dotted index                 | 3, 4, 5    |

## Ordering Rationale

**Foundation first (1).** The JSDoc typedefs and the comment-only sweep carry no behaviour and unblock readers of every later task. Done first so the canonical shape is documented before code references it.

**Planners before handlers (2 → 3, 2 → 8).** `planActionTransition` (action-doc seed reads `loadedWorkflow.entity.*`) and `planEventDispatch` (reads `workflow.entity.ref_key` / `workflow.entity.id`) are invoked by StartWorkflow and the submit path. Their unit tests use self-contained nested fixtures, so they convert independently — but StartWorkflow (3) and the broad engine-suite sweep (8) only go green once the planners emit/read the nested shape.

**Engine reads fan out in parallel (4, 5, 6, 7).** GetEntityWorkflows, the overview/action read methods, the Cancel/Close reserved-key lists, and the `computeEngineLinks` sentinel are independent engine edits, each with a colocated test. They depend only on the typedefs (1) and can be done concurrently.

**Test-fixture sweep gates the engine suite (8).** Suites whose source files don't change behaviourally still construct workflow/action docs with the old flat shape; once planners (2) and StartWorkflow (3) write nested entity, those fixtures and their doc assertions must be nested for the full engine suite to pass.

**Module layer after its engine contract (9 after 3; 10 after 4; 11 after 5).** `makeWorkflowApis` mirrors the StartWorkflow param contract; `get-entity-workflows.yaml` + components mirror the GetEntityWorkflows param; the `get_entity` request reads the GetWorkflowAction **response** shape. Each module task follows the engine task that defines the contract it consumes.

**Apps last (12, 13 after 9, 10).** App callers exercise the generated start endpoints and the entity-workflow components, and the components' `_var` token rename (`entity_collection` → `entity_connection_id`) must land together with the app `_ref` sites that supply it. Demo and workflows-test are independent of each other and can run concurrently.

**Docs (14)** depend only on the finalized shape decisions (3, 4, 5) and can run any time after those.

**Parallelizable groups:** {4, 5, 6, 7} after 1; {12, 13, 14} after {9, 10}.

## Scope

**Source:** `designs/workflows-module/parts/59-entity-instance-pointer/design.md`
**Context files considered:** none — the `59-entity-instance-pointer/` folder contains only `design.md` and `review/`. Cross-referenced `parts/57-inline-entity-config/design.md` for the dependency boundary.
**Review files skipped:** `parts/59-entity-instance-pointer/review/` (contents ignored per skill).
