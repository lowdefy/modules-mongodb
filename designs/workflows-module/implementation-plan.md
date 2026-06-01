# Workflows Module — Implementation Plan

Parallel delivery waves derived from the [dependency graph in design.md](designs/workflows-module/design.md#dependency-graph). Each **wave** can run fully in parallel; the next wave starts once its predecessors land. The Repo column tells you where the diff goes; the Status column reflects what has shipped on `main` / been merged to the `workflows-module` branch.

**Shipped so far:** parts 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19, 21, 23, 25, 29, plus part 12 tasks 1–2 (resolver + placeholder templates) and part 13 tasks 1–2 (resolver + inline-routine hook/`on_complete` schema flip) — manifest wiring for both now unblocked by part 2 landing upstream. Engine can create, transition, and tear down workflows with full group state machine + tracker subscription; the always-on log-event + notifications side effects now fire on every submit. Part 16 lands the four form-action page templates (`view` / `edit` / `review` / `error` under `modules/workflows/templates/`) plus the three module-shipped requests (`get_action`, `get_workflow`, `get_entity`) — full `onMount` sequence with per-template stale-URL allowlists, the universal-fields band + `makeActionsForm` form body composition, the immutable five-button interaction vocabulary (`submit_edit`, `not_required`, `approve`, `request_changes`, `resolve_error`) plus the `Edit` navigation button, and v0-parity outer-card suppression on `form[0].form` (edit) / `form_error[0].form` (error). Part 17 adds the four shared static pages under `modules/workflows/pages/` (`simple-edit` / `simple-view` / `simple-review` / `workflow-overview`) plus the manifest `pages:` + `exports.pages` wiring. Part 18 lands the three entity-page components under `modules/workflows/components/` (`action_role_check`, `workflow-header`, `actions-on-entity`) and wires them into the manifest — this unblocks the seven shipped `_ref` sites in parts 16 + 17 that had been pointing at missing files. Part 25 adds the `group-overview` shared page + `get-action-group-overview` Api (sixth module-shipped operational Api), and extends `actions-on-entity`'s `actionGroupConfig` builder so every group title links into the new page. Runtime light-up for 16/17/18/25 still needs parts 20a (manifest deltas, connection ids, `vars.entities` / `vars.app_name`, demo wiring), 20b (dynamic `_build.array.map` manifest entries for per-action pages/APIs + form/simple demo flows), and 24 (universal-fields component). Part 27 (demo-workflows-wiring) was retired during 20a's design review — its scope is now split between 20a (tracker-only demo) and 20b (form/simple demo). Remaining lifecycle extensions (part 11) are next.

Status legend: `✅ shipped` · `🚧 in progress` · empty = not started.

## Wave 0 — Upstream Lowdefy primitives

These ship before anything else in the workflows module proper. They live in **upstream Lowdefy packages**, so they need to be cut as PRs against `lowdefy/lowdefy` (not this repo).

| #   | Part                                                            | Size | Repo                                          | Status |
| --- | --------------------------------------------------------------- | ---- | --------------------------------------------- | ------ |
| 1   | [call-api-primitive](parts/_completed/01-call-api-primitive/design.md) | S    | upstream `@lowdefy/api`                       | ✅ shipped |
| 2   | [dynamic-module-pages](parts/_completed/02-dynamic-module-pages/design.md) | S    | upstream `@lowdefy/build` (or module loading) | ✅ shipped (resolved by removing `exports:` entirely — see part 02's design.md) |

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
| 12  | [resolver-pages](parts/_completed/12-resolver-pages/design.md)               | M    | `modules/workflows/resolvers/`                                 | 🚧 tasks 1–2 done; task 3 (manifest wiring) unblocked — re-scope to `_build.array.map` over `_module.var: workflows_config` in `pages:` (no resolver channel needed) |
| 15  | [resolver-form-builder](parts/15-resolver-form-builder/design.md) | M    | `modules/workflows/resolvers/`                                 | ✅ shipped |

## Wave 3 — The load-bearing write (solo)

Part 6 is the only **L**. Most of Wave 4 hangs off it, so it deserves its own bar.

| #   | Part                                                            | Size | Repo                                                                                | Status |
| --- | --------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- | ------ |
| 6   | [submit-action-writes](parts/06-submit-action-writes/design.md) | L    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` | ✅ shipped |

## Wave 4 — Lifecycle extensions + resolver-apis (parallel)

Each extends part 6's lifecycle orthogonally. Part 13 (resolver-apis) only needs parts 2/4/6, so it streams here.

| #   | Part                                                            | Size | Repo                                                                                | Status    |
| --- | --------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- | --------- |
| 7   | [group-state-machine](parts/07-group-state-machine/design.md)   | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` | ✅ shipped |
| 8   | [side-effect-dispatch](parts/_completed/08-side-effect-dispatch/design.md) | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` | ✅ shipped |
| 10  | [tracker-subscription](parts/_completed/10-tracker-subscription/design.md) | S    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`                      | ✅ shipped |
| 13  | [resolver-apis](parts/_completed/13-resolver-apis/design.md)               | M    | `modules/workflows/resolvers/`                                                      | 🚧 tasks 1–2 done; task 3 (manifest wiring) unblocked — re-scope to `_build.array.map` over `_module.var: workflows_config` in `api:` (no resolver channel needed) |

## Wave 5 — Hooks, fan-out, operational APIs (parallel; need Wave 4)

Hook invocation needs parts 7 (groups) and 8 (side-effects). Fan-out needs 7 + 9. Part 19 only needs parts 5 and 7 — it could start earlier but pairs naturally here so the UI in Wave 6 has its dependency in hand.

| #   | Part                                                                    | Size | Repo                                                                                | Status |
| --- | ----------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- | ------ |
| 9   | [hook-invocation](parts/_completed/09-hook-invocation/design.md)                   | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` | ✅ shipped |
| 11  | [group-on-complete-fanout](parts/11-group-on-complete-fanout/design.md) | S    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` |        |
| 19  | [operational-apis](parts/_completed/19-operational-apis/design.md)       | M    | `modules/workflows/api/`                                                            | ✅ shipped |

## Wave 6 — UI delivery (parallel; need resolvers + ops APIs)

All four need the resolver outputs from Waves 2/4 and (for 17/18) the operational APIs from part 19. Part 24 is the universal-fields component that 16 and 17 consume (part 18 doesn't consume it in v1 — tracker rendering stays `status_map.message`-only) — land it first inside the wave so it's ready when the page templates compose it (`_ref` would otherwise fail the Lowdefy build).

| #   | Part                                                          | Size | Repo                                       | Status |
| --- | ------------------------------------------------------------- | ---- | ------------------------------------------ | ------ |
| 24  | [universal-fields](parts/24-universal-fields/design.md)       | M    | `modules/workflows/components/universal-fields/` |        |
| 16  | [page-templates](parts/_completed/16-page-templates/design.md) | M    | `modules/workflows/templates/`             | ✅ shipped |
| 17  | [shared-pages](parts/_completed/17-shared-pages/design.md)    | M    | `modules/workflows/pages/`                 | ✅ shipped |
| 18  | [entity-components](parts/_completed/18-entity-components/design.md) | M    | `modules/workflows/components/`            | ✅ shipped |

## Wave 7 — Closeout

| #   | Part                                                  | Size | Repo                                | Status |
| --- | ----------------------------------------------------- | ---- | ----------------------------------- | ------ |
| 20a | [module-manifest-static](modules-mongodb/designs/workflows-module/parts/_completed/20a-module-manifest-static/design.md) | S    | `modules/workflows/` + `apps/demo/` |        |
| 20b | [module-manifest-dynamic](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md) | S    | `modules/workflows/` + `apps/demo/` |        |

## Follow-ons (added after the original waves)

These didn't exist when the dependency graph was cut; they slot wherever their deps land.

| #   | Part                                                                  | Size | Repo                                                           | Status     |
| --- | --------------------------------------------------------------------- | ---- | -------------------------------------------------------------- | ---------- |
| 21  | [entity-type-to-collection](parts/21-entity-type-to-collection/design.md) | M    | `plugins/modules-mongodb-plugins/` + `modules/workflows/`      | ✅ shipped |
| 22  | [workflows-e2e-suite](parts/22-workflows-e2e-suite/design.md)         | M    | `apps/demo/` (e2e harness)                                     |            |
| 23  | [close-workflow-handler](parts/_completed/23-close-workflow-handler/design.md) | M    | `plugins/modules-mongodb-plugins/` + `modules/workflows/api/` | ✅ shipped |
| 25  | [group-overview-page](parts/_completed/25-group-overview-page/design.md) | S    | `modules/workflows/pages/` + `modules/workflows/api/`          | ✅ shipped |
| 29  | [error-model-cleanup](parts/_completed/29-error-model-cleanup/design.md)         | M    | `plugins/modules-mongodb-plugins/` + concept specs             | ✅ shipped |
| 32  | [drop-static-overrides](parts/_completed/32-drop-static-overrides/design.md)     | M    | `plugins/modules-mongodb-plugins/` + `modules/workflows/`      | ✅ shipped |

## Repo footprint at a glance

| Repo                                           | Parts                                             |
| ---------------------------------------------- | ------------------------------------------------- |
| upstream `@lowdefy/*`                          | 1, 2                                              |
| `plugins/modules-mongodb-plugins/` (this repo) | 3, 5, 6, 7, 8, 9, 10, 11, 21, 23, 29, 32          |
| `modules/workflows/` (this repo)               | 4, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 32 |
| `apps/demo/` (this repo)                       | 20a (tracker-only demo wiring), 20b (form/simple demo extension), 22 (e2e suite) |

Two clear streams once Wave 0 lands: an **engine stream** in the plugin package and a **module stream** under `modules/workflows/`. They only converge at parts 20a / 20b.

> **Note on part 2:** Resolved upstream by removing `exports:` from `module.lowdefy.yaml` entirely (rather than adding a resolver-emit channel as originally designed). This re-scopes parts 12, 13, and 20b: dynamic per-action pages and `update-action-{action_type}` endpoints are now emitted via `_build.array.map` over `_module.var: workflows_config` directly in the manifest's `pages:` / `api:` arrays — no resolver channel required. Existing `exports:` blocks in this repo's module manifests are silently ignored; they can stay as documentation until the upcoming component description/vars work supersedes them.
