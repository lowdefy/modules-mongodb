# Implementation Tasks — Part 16: Form-action page templates

## Overview

Replace the four placeholder `.yaml.njk` templates at `modules/workflows/templates/` with full implementations. Ship the three module-shipped request YAML files that templates load on mount. Wire the universal-fields band (part 24 component), the form body (part 15's `makeActionsForm` resolver), the button vocabulary, button payload, outer-card suppression, and stale-URL redirect guards per the design. Derived from `designs/workflows-module/parts/16-page-templates/design.md`.

## Tasks

Status legend: `✅ done` · `🚧 in progress` · `⏸ blocked` · empty = not started.

| #   | File                                | Summary                                                                                                                                                                     | Depends On                       | Status |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------ |
| 1   | `01-module-shipped-requests.md`     | Ship the three module-shipped requests at `modules/workflows/requests/` (`get_action.yaml`, `get_workflow.yaml`, `get_entity.yaml`).                                        | —                                | ✅ done |
| 2   | `02-view-template.md`               | Replace `templates/view.yaml.njk` placeholder with the real read-only view: universal-fields band (display), DataView for form body, no write buttons.                     | 1                                | ✅ done |
| 3   | `03-edit-template.md`               | Replace `templates/edit.yaml.njk` placeholder. Full onMount sequence, universal-fields band (edit), form body via `makeActionsForm`, outer-card suppression, `submit_edit` + opt-in `not_required` buttons + confirm modals, button payload assembly. | 1                                | ✅ done |
| 4   | `04-review-template.md`             | Replace `templates/review.yaml.njk` placeholder. DataView for main form, `makeActionsForm` for form_review, `approve` / `request_changes` buttons + dedicated request-changes modal, `Edit` navigation button. | 1                                | ✅ done |
| 5   | `05-error-template.md`              | Replace `templates/error.yaml.njk` placeholder. Failure-context banner, `form_error` recovery form (defaults to `[]`), `resolve_error` button with overridable title + modal, outer-card suppression. | 1                                | ✅ done |

## Ordering Rationale

**Foundation first (task 1).** The three module-shipped requests are referenced by all four templates' `onMount` sequences. Authoring them once at the module level (instead of inline in each template) means task 1 is the prerequisite for every other task. The requests are simple `$match` aggregations with no inter-dependencies between the three.

**View template second (task 2).** `view.yaml.njk` has the smallest surface: read-only display, no write buttons, no interaction payload, no outer-card suppression, no confirm modals. Implementing it second produces the first end-to-end-renderable template against the new request set, validates the `_ref` paths and Nunjucks substitution patterns, and surfaces any layout-module composition issues early.

**Edit, review, error (tasks 3–5) are independent of each other** and can run in parallel after task 1 lands. Each touches one template file; none shares state with the others; the universal-fields component and the button-vocabulary contract are documented in the design so each template can compose them without coordination. Task 2 (view) is technically also parallel with 3/4/5, but its smaller scope makes it the natural validation point for the request foundation.

### Parallel-execution opportunity

After task 1 lands, tasks 2/3/4/5 can run concurrently. Each modifies a single template file; no shared edits.

### Why not split each template into "onMount" + "body" + "buttons" sub-tasks?

The page won't render meaningfully until all three layers exist (a template with `onMount` but no body produces an empty page). Splitting creates intermediate states that can't be verified in isolation. One template = one task is the right granularity.

### Cross-part dependencies (do not block this part's tasks)

- **[Part 24 — universal-fields](../../24-universal-fields/design.md)** ships the `_ref` target that templates compose for the universal-fields band. Per the implementation plan's Wave 6 ordering, part 24 lands first; templates that `_ref` it would otherwise fail the Lowdefy build. If part 24 isn't ready when these tasks start, the universal-fields `_ref` lines should be left in (the design's commitment) and the build noise tolerated until part 24 ships.
- **[Part 18 — entity-components](../../18-entity-components/design.md)** ships `action_role_check` which step 6 of the onMount sequence consumes. Same handling: leave the `_ref` in the templates per the design; if part 18 isn't ready, templates surface a missing-ref build error in the demo app until part 18 lands.
- **[Part 13 — resolver-apis](../../13-resolver-apis/design.md)** is shipped (tasks 1–2 done, task 3 blocked on part 2). The emitted `update-action-{action_type}` endpoints exist and accept the payload shape this part posts.
- **[Part 15 — resolver-form-builder](../../_completed/15-resolver-form-builder/design.md)** is `_completed`. `makeActionsForm` is callable via `_ref: { resolver: makeActionsForm.js, vars: { form, mode } }`.
- **[Part 12 — resolver-pages](../../12-resolver-pages/design.md)** emits the page shells that `_ref` these templates with the `action_config`, `page_config`, `page_ids`, `workflow_type`, `entity_collection` vars the templates consume.

## Scope

**Source:** `designs/workflows-module/parts/16-page-templates/design.md`

**Context files considered:**

- Parent `designs/workflows-module/parts/16-page-templates/design.md` (the source of truth — block ordering, button vocabulary, payload shape, onMount sequence, outer-card rule, layout-module composition).
- `designs/workflows-module/parts/12-resolver-pages/design.md` + `tasks/02-make-action-pages.md` — the resolver that emits the page shell vars (`action_config`, `page_config`, `page_ids`, `workflow_type`, `entity_collection`).
- `designs/workflows-module/parts/13-resolver-apis/design.md` — the resolver that emits `update-action-{action_type}` (button payload contract + Comment-mapping subsection).
- `designs/workflows-module/parts/_completed/15-resolver-form-builder/design.md` — `makeActionsForm` API (`mode: 'edit' | 'view' | 'review' | 'error'`, `form` var; resolver does not synthesize `form_error` from `form`).
- `designs/workflows-module/parts/_completed/14-form-components-library/design.md` — structural-component allowlist (`section`, `controlled_list`, `box`, `label`, `file_upload`) referenced by the outer-card suppression rule.
- `designs/workflows-module/parts/24-universal-fields/design.md` — component shape and `_ref` invocation pattern.
- `designs/workflows-module/parts/18-entity-components/design.md` — `action_role_check` primitive.
- `designs/workflows-module/parts/_completed/19-operational-apis/design.md` — `update-action-{action_type}` endpoint shape.
- `designs/workflows-module-concept/ui/spec.md` + `submit-pipeline/spec.md` — concept-level vocabulary and payload contracts.
- `modules/workflows/templates/{edit,view,review,error}.yaml.njk` — current placeholder bodies (to replace).
- `modules/workflows/module.lowdefy.yaml` — workflows module manifest (connection ids `workflows-collection`, `actions-collection`, `workflow-api`).
- `modules/layout/module.lowdefy.yaml` + `modules/shared/layout/{card,floating-actions}.yaml` — the layout-module components (`page`, `card`, `floating-actions`) templates compose.
- `modules/workflows/api/get-entity-workflows.yaml` + `get-workflow-overview.yaml` — reference shape for MongoDB request authoring patterns in this repo.
- `modules/workflows/resolvers/makeActionPages.js` + `makeActionPages.test.js` — the resolver that emits page shells with `action_config` / `page_config` / `page_ids` vars.
- `dist/workflows-module/ui/current_workflow_utils/templates/{edit,view,review,error}.yaml.njk` — v0 reference (parity comparison for outer-card suppression, modal shapes, button copy).
- `CLAUDE.md` — repo conventions (input block IDs match data paths; snake_case for block / request / action IDs; kebab-case for page / API IDs; YAML block sequences for operators).

**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` (their resolutions are already incorporated into design.md).
