# Implementation Tasks — Part 04: Workflow Config Schema + `makeWorkflowsConfig`

## Overview

Ship the build-time config layer for the workflows module: the two fixed status enums, the `makeWorkflowsConfig` resolver that produces the normalized workflows config, the `WorkflowAPI` connection schema extension that accepts both, and the partial module manifest exposing the merged enums as UI components.

These tasks derive from `designs/workflows-module/parts/04-workflow-config-schema/design.md`, with several scope decisions made during implementation:

- **Validators: 7 of 8 from the design ship inline.** Action `type` uniqueness, `kind` allowlist, kind/block matchup (form/task/tracker), `action_group` references a declared group, no group-id/action-type collision, `status_map` keys are canonical statuses, `starting_actions` entries resolve. The 8th — `blocked_by` resolution — is deferred to part 7 (group state machine) along with hook auth (part 13) and verb whitelist (runtime is lenient).
- **Display-override merge ships via `_build.object.assign`.** The manifest exposes `action_statuses` and `workflow_lifecycle_stages` as UI components that merge the shipped enum with `vars.{enum}_display`. The engine reads the canonical enum file directly (channel separation), so display overrides cannot affect engine priority logic. No bespoke merge resolver.
- **Resolver output is narrowed.** The resolver whitelists 10 action fields needed by the engine + UI status lookup (`type`, `kind`, `key`, `tracker`, `blocked_by`, `action_group`, `sort_order`, `required_after_close`, `access`, `status_map`). Build-time-only fields (`form`, `pages`, `hooks`, `interactions`, etc.) are read by parts 12/13/15 from the raw workflow YAML, not from `workflowsConfig`.
- **No worked-example fixture or tests in part 04.** Parts 5/6/7 will write their own fixtures scoped to what their handlers exercise.
- **No JSDoc `types.js` file.** Earlier draft included one; dropped because no existing module ships `.js` helpers, and a JSDoc-only file with no real consumers isn't worth the overhead. The normalized shape is documented in the resolver and pinned by the connection schema.
- **`changeStamp` connection property deferred to part 05.** It's a runtime engine property used by every insert/update handler. Part 05's scope.

## Tasks

| #   | File                               | Summary                                                                                           | Depends On |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-enum-yamls.md`                 | Ship `action_statuses.yaml` and `workflow_lifecycle_stages.yaml` under `modules/workflows/enums/` | —          |
| 2   | `02-make-workflows-config.md`      | Write the `makeWorkflowsConfig` resolver — narrowed shape transform with 7 inline validators      | —          |
| 3   | `03-workflow-api-schema-extend.md` | Extend `WorkflowAPI` connection schema to accept `workflowsConfig` and `actionsEnum`              | —          |

A partial `modules/workflows/module.lowdefy.yaml` ships alongside task 1 to expose the two merged-enum component exports. The full module manifest (connection wiring, secrets, pages, etc.) is part 20's scope.

## Ordering Rationale

Three tasks, fully independent. Any order works; they can land in parallel.

- **No internal dependencies.** None of the three tasks reads files produced by another. Task 1 is static YAML + a partial manifest. Task 2 is a pure JS function. Task 3 is a single-file schema edit.
- The normalized shape is documented in task 2 (in the resolver) and enforced at the connection boundary by task 3's schema. Two places, both load-bearing.

### Deferred to later parts

- Worked-example fixture from the concept doc. Add post-merge if useful for parts 5/6/7 testing.
- The 8th validator — `blocked_by` resolution — lands in part 7 with the group state machine.
- Hook auth gate validation → part 13.
- Full module manifest (connection, secrets, pages, fields-library exports) → part 20.

## Scope

**Source:** `designs/workflows-module/parts/04-workflow-config-schema/design.md`
**Context files considered:** the design.md only (part 04 folder contains no supporting context files). Concept docs at `designs/workflows-module-concept/action-authoring/design.md` + `spec.md`, `designs/workflows-module-concept/engine/spec.md`, and `designs/workflows-module-concept/action-groups/spec.md` were consulted to pin the enum shapes and field set, but those are the _concept_ layer, not part-04-specific context.
**Review files:** `review/review-1.md` (8 findings — 7 resolved, 1 accepted).
