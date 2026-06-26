# Implementation Tasks — Part 21: Replace `entity_type` with `entity_collection`

## Overview

Tasks implement the schema simplification in [design.md](../design.md): drop `entity_type` from the workflow YAML grammar, the workflow/action doc shapes, the engine handler payloads, the JSON schema for `workflowsConfig`, and every mention in `designs/workflows-module-concept/`. The collection name (`entity_collection`) is the sole entity-identity scalar going forward.

## Tasks

| #   | File                                        | Summary                                                                                                                           | Depends On |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-concept-doc-updates.md`                 | Strip `entity_type` from every non-review file under `designs/workflows-module-concept/`; update index recs + reserved-keys list. | —          |
| 2   | `02-plugin-schema.md`                       | Update `workflowsConfig` JSON schema in the plugin: required + description swap.                                                  | —          |
| 3   | `03-plugin-typedefs-and-projection.md`      | Drop `entity_type` from `WorkflowDoc` / `ActionDoc` JSDoc and `getActionFields.js` projection.                                    | —          |
| 4   | `04-resolver-rename-and-rejection-check.md` | `makeWorkflowsConfig`: swap `WORKFLOW_FIELDS`, add the legacy-key rejection check, add unit tests.                                | 2          |
| 5   | `05-sibling-part-design-audit.md`           | Audit parts 5, 12, 19 designs for stragglers; confirm part 18 unaffected and parts 3/4/14 untouched.                              | 1          |

## Ordering Rationale

The concept docs (task 1) are the source of truth and have no code dependencies, so they go first — anyone reading the spec while later tasks land sees the new shape. Tasks 2–4 are the shipped-code edits in three coherent chunks: the JSON schema (declarative contract), the JSDoc/projection (pure typing + read shape), and the resolver (validation logic + unit tests). Task 4 depends on task 2 because the resolver's `required` list and the schema's `required` array describe the same contract — keeping them in lockstep avoids a momentary disagreement where one rejects and the other doesn't.

Task 5 depends on task 1 only as a sanity check — the action-review pass already edited parts 5 and 19, but a fresh pass against the now-updated concept docs catches anything that slipped.

Tasks 1, 2, 3 can run in parallel. Task 5 can also start once 1 is complete.

## Scope

**Source:** `designs/workflows-module/parts/21-entity-type-to-collection/design.md`
**Context files considered:** none — part 21's design folder has no supporting files beyond `design.md` and the `review/` and `tasks/` subdirectories. `docs/idioms.md` and the project `CLAUDE.md` provide cross-cutting conventions referenced inline below.
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md`.
