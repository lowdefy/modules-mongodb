# Implementation Tasks — Part 26 Entity data contract

## Overview

These tasks implement Part 26: replacing the per-workflow `get_entity` request and the
shared overview pages' missing entity name with **one mechanism** — an inline `entity.data`
routine the module turns into an engine-only `InternalApi`, called server-side by the read
handlers and surfaced on the API response (`entity_link.name` + an `entity` object).
Derived from `designs/workflows-module/parts/26-entity-data-contract/design.md`.

## Tasks

| #   | File                                          | Summary                                                                                 | Depends On |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-config-validation-and-carry.md`           | `makeWorkflowsConfig`: validate `entity.data`, drop `name_field`, carry `data_endpoint` | —          |
| 2   | `02-emit-entity-data-endpoint.md`             | `makeWorkflowApis`: emit `{type}-entity-data` `InternalApi` from `entity.data`          | —          |
| 3   | `03-read-handlers-resolve-entity-data.md`     | Read handlers call the endpoint via `callApi`, lift `name`, return `entity` object      | 1, 2       |
| 4   | `04-templates-source-entity-from-response.md` | Templates + `makeActionPages`: drop `get_entity`, read entity off the action response   | 3          |
| 5   | `05-action-workspace-loading.md`              | `action-workspace`: drop whole-shell gate, add skeletons, narrow the entity-id gate     | —          |
| 6   | `06-demo-entity-data-routine.md`              | Demo: add `entity.data` routine, drop `name_field`, repoint the entity slot             | 1, 2, 3, 4 |
| 7   | `07-docs-and-manifest.md`                     | Manifest + regenerated `vars.md` + the two hand-authored docs pages                     | 1, 4       |

## Ordering Rationale

The work splits into a **build-side mechanism** (tasks 1–2), a **server-side read change**
(task 3) that consumes it, and **consumer surfaces** (tasks 4–7) that depend on the new
response shape.

- **Tasks 1 and 2 are independent** and can run in parallel — but they share a contract: the
  endpoint id `{type}-entity-data`. Task 1 carries `data_endpoint: { _module.endpointId:
"{type}-entity-data" }`; task 2 emits the `InternalApi` with that exact id. They must agree.
- **Task 3 depends on both**: the handlers read `wfConfig.entity.data_endpoint` (task 1's
  carried config) and call the endpoint task 2 emits.
- **Task 4 depends on task 3**: the templates' breadcrumb reads `entity_link.name` and the
  `DataDescriptions`/slot read `get_workflow_action.entity.<field>` — both produced by task 3.
  Deleting `get_entity.yaml.njk` breaks all five templates at once, so the resolver var removal
  (`makeActionPages`), the request deletion, and the five template edits are one coherent task.
- **Task 5 is independent** (it only touches `action-workspace.yaml`'s `visible`/loading gates)
  and can run in parallel with tasks 1–4. Ordered late only because it shares the action pages.
- **Task 6 (demo) depends on 1, 2, 3, 4**: the demo `entity.data` routine is validated by task 1,
  emitted by task 2, surfaced by task 3, and the demo build needs `get_entity` gone (task 4)
  before the slot can read the new response.
- **Task 7 (docs) depends on 1 and 4**: it documents the settled contract (task 1) and the
  consumer-observable behavior (task 4).

Parallelizable groups: {1, 2, 5} first; then 3; then {4}; then {6, 7}.

## Scope

**Source:** `designs/workflows-module/parts/26-entity-data-contract/design.md`
**Context files considered:** none (the design folder contains only `design.md` and `review/`)
**Review files skipped:** `review/consistency-1.md`, `review/review-2.md` (and the rest of `review/`)
