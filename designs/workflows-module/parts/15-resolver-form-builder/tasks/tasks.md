# Implementation Tasks — Part 15: `makeActionsForm` + `makeActionFormConfigs`

## Overview

Ship two build-time resolvers in `modules/workflows/resolvers/` that consume authored action YAML and the field-components library from part 14. `makeActionsForm` substitutes library components by name into a Lowdefy block tree (called per-page from inside Nunjucks templates via `_ref: { resolver }`). `makeActionFormConfigs` walks the same authored YAML once at build time and emits per-action **metadata** (not substituted block trees) onto `global.action_form_configs` so part 17's `workflow-overview` can render read-only summary views.

Derived from `designs/workflows-module/parts/15-resolver-form-builder/design.md`.

## Tasks

Status legend: `✅ done` · `🚧 in progress` · `⏸ blocked` · empty = not started.

| #   | File                              | Summary                                                                                                                                                                                                                                          | Depends On | Status |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| 1   | `01-make-actions-form.md`         | Write `resolvers/makeActionsForm.js` — JS walker, library-file loader, var merge, `form:` → `blocks:` rename on the structural allowlist, build-time validation (bare-vs-namespaced component names, required vars, block-id collisions), plus a Jest spec. | —          |        |
| 2   | `02-make-action-form-configs.md`  | Write `resolvers/makeActionFormConfigs.js` — emits the per-action metadata tree (`component`, `key`, `required`, `title`, `validate`, nested `form:` on structural components) keyed by `{action_type}`, plus a Jest spec.                       | —          |        |
| 3   | `03-manifest-wiring.md`           | Register `makeActionFormConfigs` in `modules/workflows/module.lowdefy.yaml` under `global.action_form_configs`. Verify against a demo-app build.                                                                                                  | 2          |        |
| 4   | `04-resolvers-readme.md`          | Write `modules/workflows/resolvers/README.md` documenting both resolvers, the metadata-tree shape, the sub-form `form:` → `blocks:` rename, and the patterns shared across the resolvers directory.                                            | 1, 2       |        |

## Ordering Rationale

Four tasks. Tasks 1 and 2 are independent and can ship in parallel — they're sibling resolvers with no shared code, no shared fixtures, and no dependency on each other's output shapes (`makeActionsForm` emits a Lowdefy block tree consumed by templates at render time; `makeActionFormConfigs` emits a metadata tree consumed by overview pages from `global`).

- **Tasks 1 + 2 in parallel.** Both read the raw authored action YAML and walk the same shape. Resolver 1 (`makeActionsForm`) is the bigger of the two — it loads library files at build time, merges vars, runs validations, and recurses on structural components. Resolver 2 (`makeActionFormConfigs`) is a pure transform: walk and emit metadata; no library-file I/O. Each ships with its own `.test.js` spec following the part 12 pattern.

- **Task 3 (manifest wiring) depends on task 2.** It registers `makeActionFormConfigs` on `global.action_form_configs` via `_ref: { resolver }` at manifest scope (verified working — see [part 04 review-1 finding 5](../../04-workflow-config-schema/review/review-1.md)). `makeActionsForm` is **not** registered in the manifest — it's invoked from inside Nunjucks templates at render time by part 16. Task 3 also adds the `workflows_config` var declaration if part 4 / part 12's manifest tasks haven't already.

- **Task 4 (README) depends on 1, 2.** It documents both resolvers and the patterns shared across the directory. Could be split per-resolver but doesn't gain anything — the README is the single home for the resolver-package reference and reads better as one coherent document.

### Deferred to later parts

- **Template `_ref: { resolver: makeActionsForm.js }` invocation.** Part 16's `.yaml.njk` template bodies wire the resolver into per-page rendering. Part 15 ships the resolver; part 16 invokes it.
- **Workflow-overview consumption of metadata.** Part 17 reads `global.action_form_configs` to render read-only summary cards. Part 15 ships the emission shape; part 17 consumes it.
- **End-to-end coverage.** Part 22 (workflows-e2e-suite) drives the full demo flow. Part 15's tests are unit-level against each resolver's output shape.

## Scope

**Source:** `designs/workflows-module/parts/15-resolver-form-builder/design.md`
**Context files considered:** parts/04-workflow-config-schema/design.md (input contract — raw `vars.workflows` shape, no narrowing applied), parts/04-workflow-config-schema/tasks/02-make-workflows-config.md (resolver pattern reference), parts/12-resolver-pages/design.md (sibling resolver; `action_config.{form|form_review|form_error}` contract), parts/12-resolver-pages/tasks/02-make-action-pages.md (resolver-task structure reference), parts/14-form-components-library/design.md (library file shape — `vars:` + `config:`), parts/16-page-templates/design.md (downstream consumer), parts/17-shared-pages/design.md (overview card consumption of metadata trees), workflows-module-concept/action-authoring/spec.md (§ "Form components library", § "Resolver pipeline"), implementation-plan.md.
**Review files skipped:** review/review-1.md, review/consistency-1.md.
