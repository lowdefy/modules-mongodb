# Implementation Tasks — Single `entity:` block on the workflow

## Overview

These tasks implement `designs/workflows-module/parts/57-inline-entity-config/design.md`: consolidate a workflow's entity wiring into one nested `entity:` block (`connection_id`, `ref_key`, `page_id`, `id_query_key`, `title`) on each workflow definition, validated at build time, and remove the separate `entities` module var/connection param. The block is **materialized as authored — not lifted**: `makeWorkflowsConfig` carries the whole authored `entity` object into the materialized config unchanged (no flat `entity_collection`/`entity_ref_key` alias). The engine reads its routing fields off `wfConfig.entity`. The persistence/runtime layer (workflow/action documents, `StartWorkflow`, `planEventDispatch`, queries, indexes) still uses the flat `entity_collection`/`entity_id`/`entity_ref_key` names and **breaks** until Part 59 nests them — accepted, since the two parts ship in sequence and the modules are unreleased (see the design's "materialized nested" decision and Dependents).

## Tasks

| #   | File                                  | Summary                                                                                                                                             | Depends On |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-resolvers-entity-block.md`        | Validate the `entity:` block and carry it nested in `makeWorkflowsConfig`; update `makeActionPages` raw-YAML read; update both resolver test suites | —          |
| 2   | `02-engine-read-methods.md`           | Four read methods build `entity_link` from `wfConfig.entity` instead of `connection.entities`                                                       | 1          |
| 3   | `03-engine-test-suites.md`            | Update the four engine test suites to the `wfConfig.entity` fixture shape                                                                           | 1, 2       |
| 4   | `04-remove-entities-param-and-var.md` | Remove the `entities` connection param (schema + wiring) and module var; rewrite the `workflows_config` manifest description                        | 2          |
| 5   | `05-demo-entity-blocks.md`            | Convert demo workflow configs to `entity:` blocks, delete the `entities` map, verify the build                                                      | 1, 4       |
| 6   | `06-docs.md`                          | Update `index.md` and `authoring-grammar.md`; regenerate `vars.md`                                                                                  | 4          |

## Ordering Rationale

The change is small but tightly coupled across two packages (`modules/workflows` resolvers + `plugins/.../WorkflowAPI` engine). The dependency chains:

- **Task 1 is the foundation.** It introduces the new authoring shape and the materialized output the rest of the work consumes. It bundles **both** build-time resolvers that read the entity authoring fields — `makeWorkflowsConfig` (validates + carries the `entity` block nested) _and_ `makeActionPages` (reads `workflow.entity_collection` straight off raw YAML; see Notes below). They must move together or the new shape is half-honored and the demo's generated action pages break. Self-verifiable via the resolver unit tests.
- **Task 2** depends on Task 1: the read methods now source routing fields from the materialized `wfConfig.entity` block that Task 1 produces.
- **Task 3** depends on Tasks 1+2: the engine tests assert the new `entity_link` behavior against the `wfConfig.entity` fixture shape.
- **Task 4** depends on Task 2: the `entities` connection param can only be removed once no read method reads it. Removing the manifest var and connection wiring is the same coherent "drop the entities pathway" change, so they're grouped with the schema param removal.
- **Task 5** depends on Tasks 1+4: the demo configs need the new validator (Task 1) to accept the `entity:` block, and the `entities` var must be gone from the manifest (Task 4) for a clean build. This task carries the `pnpm ldf:b` build gate.
- **Task 6** depends on Task 4: `vars.md` is regenerated from the manifest, so the `entities` var must already be removed; the prose docs describe the new block.

Tasks 2 and 4-then-5 can be developed in parallel with Task 3 once Task 1 lands, but the table's `Depends On` column is the safe sequential order.

## Scope

**Source:** `designs/workflows-module/parts/57-inline-entity-config/design.md`
**Context files considered:** none (the design folder contains only `design.md` plus review files)
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md`

## `makeActionPages` read (now owned by the design)

The design's "Files changed" list includes **`modules/workflows/resolvers/makeActionPages.js`** (design.md:152). That resolver reads `workflow.entity_collection` directly off raw authoring YAML (`makeActionPages.js:86`, with an explicit comment at lines 73-76: "this resolver reads raw YAML, not the materialized config"). It is a build-time resolver _parallel to_ `makeWorkflowsConfig`, not downstream of it, so `makeWorkflowsConfig`'s materialization does not cover it. Under the new authoring shape its read must move to `workflow.entity.connection_id`. This is incorporated into Task 1. The njk templates (`view/edit/review/error.yaml.njk`) keep consuming the `entity_collection` var verbatim in this part — only its source in `makeActionPages.js` changes (Part 59 later renames that template var to `connection_id`).
