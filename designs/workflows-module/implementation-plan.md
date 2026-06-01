# Workflows Module — Implementation Plan

Parallel delivery waves derived from the [dependency graph in design.md](designs/workflows-module/design.md#dependency-graph). Each **wave** can run fully in parallel; the next wave starts once its predecessors land. The Repo column tells you where the diff goes; the Status column reflects what has shipped on `main` / been merged to the `workflows-module` branch.

The original Waves 0–7 are now **history** — everything in them has shipped except the universal-fields component (part 24), which moved into the active follow-on roadmap below. Live work is tracked in **[Current status & roadmap](#current-status--roadmap)**; the wave tables are kept as the record of how the foundation was delivered.

Status legend: `✅ shipped` · `🚧 in progress` · `📐 design only` · `💤 deferred (_next)` · `❌ rejected (_rejected)` · empty = not started.

## Current status & roadmap

**In progress**

| #   | Part                                                          | Size | Status |
| --- | ------------------------------------------------------------- | ---- | ------ |
| 38  | [engine-rebuild](parts/38-engine-rebuild/design.md) — FSM + load→plan→commit | XL | 🚧 tasks 1–6 of 20 shipped |

Part 38 rebuilds every engine write entry point into load → pre-hook → plan → commit → post-hook, replaces the priority-rule + `force` model with signals + per-kind FSM tables, and is the **implementation vehicle for the design-only [part 34](parts/_completed/34-action-access-model/design.md)** (per-app per-verb `access`, per-verb `links` map, `visible_verbs` query response). It supersedes the rejected [part 30](parts/_rejected/30-status-map-rendering/design.md) while keeping part 30's on-disk display contract.

**Next — after 38 (all depend on its new structure)**

| #   | Part                                                          | Size | Depends on | Status |
| --- | ------------------------------------------------------------- | ---- | ---------- | ------ |
| 39  | [form-submit-buttons](parts/39-form-submit-buttons/design.md) | M    | 38 (signal contract), 35; 24 (hygiene only) | |
| 33  | [comment-rendering](parts/33-comment-rendering/design.md)     | M    | 38 (lands on load→plan→commit); 24 (`UpdateActionFields` 2nd write site) | |
| 42  | [timeline-action-cards](parts/42-timeline-action-cards/design.md) | M | 38 (per-verb `links` map + `visible_verbs`/`resolve_action_link` stages) | |

**Then — UI surface polish**

| #   | Part                                                          | Size | Depends on | Status |
| --- | ------------------------------------------------------------- | ---- | ---------- | ------ |
| 24  | [universal-fields](parts/24-universal-fields/design.md)       | M    | 38 (render helpers, `UpdateActionFields`) | |
| 40  | [simple-action-surfaces](parts/40-simple-action-surfaces/design.md) | M | 34, 35, 38, **24**, 39 | |
| 36  | [extra-action-buttons](parts/36-extra-action-buttons/design.md) | S–M | 16/17 templates; **needs signal-model reconciliation** | |
| 41  | [notification-roles-model](parts/41-notification-roles-model/design.md) | TBD | rethink; supersedes part 34 D9 | ⚠️ STUB — not yet designed |

**Deferred — `_next/` (slot in once their deps land)**

| #   | Part                                                          | Size | Status |
| --- | ------------------------------------------------------------- | ---- | ------ |
| 11  | [group-on-complete-fanout](parts/_next/11-group-on-complete-fanout/design.md) | S | 💤 |
| 22  | [workflows-e2e-suite](parts/_next/22-workflows-e2e-suite/design.md) | M | 💤 |
| 26  | [entity-data-contract](parts/_next/26-entity-data-contract/design.md) | M | 💤 |
| 28  | [custom-action-kind](parts/_next/28-custom-action-kind/design.md) | M | 💤 |
| 31  | [keyed-auto-unblock-fanout](parts/_next/31-keyed-auto-unblock-fanout/design.md) | S–M | 💤 draft / open for discussion |


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
| 3   | [engine-plugin-shell](parts/_completed/03-engine-plugin-shell/design.md)         | M    | `plugins/modules-mongodb-plugins/`     | ✅ shipped |
| 4   | [workflow-config-schema](parts/_completed/04-workflow-config-schema/design.md)   | M    | `modules/workflows/`                   | ✅ shipped |
| 14  | [form-components-library](parts/_completed/14-form-components-library/design.md) | M    | `modules/workflows/components/fields/` | ✅ shipped |

## Wave 2 — Engine core + early resolvers (parallel)

Part 5 unlocks the rest of the engine. Resolver 12 depends on parts 2/4; resolver 15 depends on parts 4/12/14.

| #   | Part                                                              | Size | Repo                                                           | Status     |
| --- | ----------------------------------------------------------------- | ---- | -------------------------------------------------------------- | ---------- |
| 5   | [start-cancel-handlers](parts/_completed/05-start-cancel-handlers/design.md) | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/` | ✅ shipped |
| 12  | [resolver-pages](parts/_completed/12-resolver-pages/design.md)               | M    | `modules/workflows/resolvers/`                                 | ✅ shipped |
| 15  | [resolver-form-builder](parts/_completed/15-resolver-form-builder/design.md) | M    | `modules/workflows/resolvers/`                                 | ✅ shipped |

## Wave 3 — The load-bearing write (solo)

Part 6 is the only **L**. Most of Wave 4 hangs off it, so it deserves its own bar.

| #   | Part                                                            | Size | Repo                                                                                | Status |
| --- | --------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- | ------ |
| 6   | [submit-action-writes](parts/_completed/06-submit-action-writes/design.md) | L    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` | ✅ shipped |

## Wave 4 — Lifecycle extensions + resolver-apis (parallel)

Each extends part 6's lifecycle orthogonally. Part 13 (resolver-apis) only needs parts 2/4/6, so it streams here.

| #   | Part                                                            | Size | Repo                                                                                | Status    |
| --- | --------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- | --------- |
| 7   | [group-state-machine](parts/_completed/07-group-state-machine/design.md)   | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` | ✅ shipped |
| 8   | [side-effect-dispatch](parts/_completed/08-side-effect-dispatch/design.md) | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` | ✅ shipped |
| 10  | [tracker-subscription](parts/_completed/10-tracker-subscription/design.md) | S    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`                      | ✅ shipped |
| 13  | [resolver-apis](parts/_completed/13-resolver-apis/design.md)               | M    | `modules/workflows/resolvers/`                                                      | ✅ shipped |

## Wave 5 — Hooks, fan-out, operational APIs (parallel; need Wave 4)

Hook invocation needs parts 7 (groups) and 8 (side-effects). Fan-out needs 7 + 9. Part 19 only needs parts 5 and 7.

| #   | Part                                                                    | Size | Repo                                                                                | Status |
| --- | ----------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- | ------ |
| 9   | [hook-invocation](parts/_completed/09-hook-invocation/design.md)                   | M    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` | ✅ shipped |
| 11  | [group-on-complete-fanout](parts/_next/11-group-on-complete-fanout/design.md) | S    | `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/` | 💤 deferred to `_next/` |
| 19  | [operational-apis](parts/_completed/19-operational-apis/design.md)       | M    | `modules/workflows/api/`                                                            | ✅ shipped |

## Wave 6 — UI delivery (parallel; need resolvers + ops APIs)

All four need the resolver outputs from Waves 2/4 and (for 17/18) the operational APIs from part 19. Part 24 (universal-fields) was originally landed here; it has since been re-scoped onto the Part 38 engine rebuild and moved into the active roadmap above.

| #   | Part                                                          | Size | Repo                                       | Status |
| --- | ------------------------------------------------------------- | ---- | ------------------------------------------ | ------ |
| 24  | [universal-fields](parts/24-universal-fields/design.md)       | M    | `modules/workflows/components/universal-fields/` | re-scoped — see roadmap |
| 16  | [page-templates](parts/_completed/16-page-templates/design.md) | M    | `modules/workflows/templates/`             | ✅ shipped |
| 17  | [shared-pages](parts/_completed/17-shared-pages/design.md)    | M    | `modules/workflows/pages/`                 | ✅ shipped |
| 18  | [entity-components](parts/_completed/18-entity-components/design.md) | M    | `modules/workflows/components/`            | ✅ shipped |

## Wave 7 — Closeout

| #   | Part                                                  | Size | Repo                                | Status |
| --- | ----------------------------------------------------- | ---- | ----------------------------------- | ------ |
| 20a | [module-manifest-static](parts/_completed/20a-module-manifest-static/design.md) | S    | `modules/workflows/` + `apps/demo/` | ✅ shipped |
| 20b | [module-manifest-dynamic](parts/_completed/20b-module-manifest-dynamic/design.md) | S    | `modules/workflows/` + `apps/demo/` | ✅ shipped |

## Follow-ons (added after the original waves)

These didn't exist when the dependency graph was cut; they slot wherever their deps land. Active/pending follow-ons are sequenced in [Current status & roadmap](#current-status--roadmap) above.

| #   | Part                                                                  | Size | Repo                                                           | Status     |
| --- | --------------------------------------------------------------------- | ---- | -------------------------------------------------------------- | ---------- |
| 21  | [entity-type-to-collection](parts/_completed/21-entity-type-to-collection/design.md) | M | `plugins/modules-mongodb-plugins/` + `modules/workflows/`      | ✅ shipped |
| 22  | [workflows-e2e-suite](parts/_next/22-workflows-e2e-suite/design.md)         | M    | `apps/demo/` (e2e harness)                                     | 💤 deferred to `_next/` |
| 23  | [close-workflow-handler](parts/_completed/23-close-workflow-handler/design.md) | M    | `plugins/modules-mongodb-plugins/` + `modules/workflows/api/` | ✅ shipped |
| 24a | [user-account-selector-avatar](parts/_completed/24a-user-account-selector-avatar/design.md) | S | `modules/user-account/` + `modules/user-admin/` | ✅ shipped |
| 25  | [group-overview-page](parts/_completed/25-group-overview-page/design.md) | S    | `modules/workflows/pages/` + `modules/workflows/api/`          | ✅ shipped |
| 26  | [entity-data-contract](parts/_next/26-entity-data-contract/design.md) | M    | `modules/workflows/` + host apps' `api/`                       | 💤 deferred to `_next/` |
| 28  | [custom-action-kind](parts/_next/28-custom-action-kind/design.md)     | M    | `modules/workflows/` + `plugins/modules-mongodb-plugins/`      | 💤 deferred to `_next/` |
| 29  | [error-model-cleanup](parts/_completed/29-error-model-cleanup/design.md)         | M    | `plugins/modules-mongodb-plugins/` + concept specs             | ✅ shipped |
| 30  | [status-map-rendering](parts/_rejected/30-status-map-rendering/design.md) | M | `plugins/modules-mongodb-plugins/` + `modules/workflows/`      | ❌ rejected — superseded by part 38 |
| 31  | [keyed-auto-unblock-fanout](parts/_next/31-keyed-auto-unblock-fanout/design.md) | S–M | `plugins/.../SubmitWorkflowAction/`                        | 💤 deferred to `_next/` |
| 32  | [drop-static-overrides](parts/_completed/32-drop-static-overrides/design.md)     | M    | `plugins/modules-mongodb-plugins/` + `modules/workflows/`      | ✅ shipped |
| 33  | [comment-rendering](parts/33-comment-rendering/design.md)             | M    | `plugins/modules-mongodb-plugins/` + `modules/workflows/`      | next (after 38) |
| 34  | [action-access-model](parts/_completed/34-action-access-model/design.md) | L | `modules/workflows/` + `plugins/modules-mongodb-plugins/`      | 📐 design only — implemented via part 38 |
| 35  | [rename-task-kind-to-simple](parts/_completed/35-rename-task-kind-to-simple/design.md) | S | `modules/workflows/` + `apps/demo/` + templates           | ✅ shipped |
| 36  | [extra-action-buttons](parts/36-extra-action-buttons/design.md)       | S–M  | `modules/workflows/templates/` + `makeWorkflowsConfig` + concept | needs signal-model reconciliation |
| 37  | [actions-collection-indexes](parts/_completed/37-actions-collection-indexes/design.md) | S | `modules/workflows/` (docs + index verification)         | ✅ shipped |
| 38  | [engine-rebuild](parts/38-engine-rebuild/design.md)                   | XL   | `plugins/modules-mongodb-plugins/src/connections/` + `modules/workflows/` | 🚧 tasks 1–6 of 20 shipped |
| 39  | [form-submit-buttons](parts/39-form-submit-buttons/design.md)         | M    | `modules/workflows/templates/` + `modules/workflows/enums/` + concept | next (after 38) |
| 40  | [simple-action-surfaces](parts/40-simple-action-surfaces/design.md)   | M    | `modules/workflows/pages/` + `components/` + `ActionSteps` block + resolver | depends on 24 |
| 41  | [notification-roles-model](parts/41-notification-roles-model/design.md) | TBD | `modules/workflows/` + `modules/notifications/` + engine        | ⚠️ STUB — not yet designed |
| 42  | [timeline-action-cards](parts/42-timeline-action-cards/design.md)     | M    | `modules/shared/workflow/` + `modules/events/` + `modules/workflows/` | next (after 38) |

## Repo footprint at a glance

| Repo                                           | Parts                                             |
| ---------------------------------------------- | ------------------------------------------------- |
| upstream `@lowdefy/*`                          | 1, 2                                              |
| `plugins/modules-mongodb-plugins/` (this repo) | 3, 5, 6, 7, 8, 9, 10, 11, 21, 23, 28, 29, 30, 31, 32, 33, 34, 36, 38, 41 |
| `modules/workflows/` (this repo)               | 4, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 32, 33, 34, 35, 36, 38, 39, 40, 41, 42 |
| `modules/events/` + `modules/shared/`          | 42                                                |
| `modules/user-account/` + `modules/user-admin/`| 24a                                               |
| `modules/notifications/` (this repo)           | 41                                                |
| `apps/demo/` (this repo)                       | 20a (tracker-only demo wiring), 20b (form/simple demo extension), 22 (e2e suite), 35, 36 (demo exercise) |

Two clear streams once Wave 0 landed: an **engine stream** in the plugin package and a **module stream** under `modules/workflows/`. They converged at parts 20a / 20b; the Part 38 engine rebuild now re-converges them (engine FSM + module display/template/resolver surfaces in one part).

> **Note on part 2:** Resolved upstream by removing `exports:` from `module.lowdefy.yaml` entirely (rather than adding a resolver-emit channel as originally designed). This re-scoped parts 12, 13, and 20b: dynamic per-action pages and `update-action-{action_type}` endpoints are emitted via `_build.array.map` over `_module.var: workflows_config` directly in the manifest's `pages:` / `api:` arrays — no resolver channel required.

> **Note on part 30 → 38:** Part 30 (engine-managed display) is rejected and superseded by part 38, which keeps part 30's on-disk display contract (top-level per-app keys on action docs, sticky display, engine-computed links, engine-rendered event display) but rebuilds the API beneath it on the load→plan→commit architecture so renders happen against planned state — collapsing the render-against-stale-doc bug class part 30 kept hitting.

> **Note on part 34 → 38:** Part 34 (action access model) is a design-only contract with no standalone implementation. Its engine/resolver/display decisions — per-app per-verb `access`, the per-verb `links` map (superseding part 30's single link), signal→verb submit gating, the `visible_verbs` query response, and emitted-id naming — all land inside part 38.
