# Implementation Tasks — Part 56: Three-tier action pages (entity workspace)

## Overview

These tasks implement Part 56, which wraps every workflow action page (form and
check) in a shared three-tier "entity workspace" shell: left = the entity's
workflows/actions, middle = the action being worked, right = universal-fields +
History (with a Details tab on form pages). Derived from
`designs/workflows-module/parts/56-three-tier-action-pages/design.md`.

## Tasks

| #   | File                                   | Summary                                                                         | Depends On |
| --- | -------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| 1   | `01-title-block-description-var.md`     | Add optional `description` var to shared `title-block` + forward via `page`     | —          |
| 2   | `02-engine-link-check-retarget.md`      | Retarget the check engine-link branch to `{workflow_type}-check`; fix unit tests | —          |
| 3   | `03-getworkflowaction-envelope.md`      | Add `workflow_id` + optional `entity_link.name` (from `entity.name_field`)      | —          |
| 4   | `04-config-validation.md`               | Validate `entity_view.slot` + optional `entity.name_field` in makeWorkflowsConfig | —        |
| 5   | `05-split-check-action-surface.md`      | Extract check-surface leaves into shared files; modal body unchanged            | —          |
| 6   | `06-action-workspace-shell.md`          | New shared three-tier shell component (`action-workspace.yaml`)                 | —          |
| 7   | `07-action-breadcrumbs-fragment.md`     | New four-segment `action-breadcrumbs.yaml` config fragment                      | 3          |
| 8   | `08-check-page-template.md`             | New per-workflow `check.yaml.njk` page recomposing the check surface in the shell | 5, 6, 7  |
| 9   | `09-form-templates-adopt-shell.md`      | Reshape `view/edit/review/error.yaml.njk` to use the shell                      | 1, 6, 7    |
| 10  | `10-makeactionpages-emit-and-vars.md`   | makeActionPages: pass new template vars + emit `{workflow_type}-check` page     | 2, 8, 9    |
| 11  | `11-retire-shared-pages-and-docs.md`    | Retire shared `workflow-action-*` pages; update manifest/README/docs/comments   | 2, 10      |
| 12  | `12-e2e-retarget-check-links.md`        | Retarget e2e specs/fixtures from `workflow-action-*` to `{workflow_type}-check` | 10, 11     |

## Ordering Rationale

The work splits into three layers with clean dependency chains:

**Foundations (1–6) — independent, parallelizable.** Each touches one concern
and can be built and tested in isolation:

- Task 1 (layout `description` var) is a pure additive layout change.
- Task 2 (engine-link retarget) is the source of truth for the new
  `{workflow_type}-check` page id; it is server-side and independent of any UI,
  but its retarget cascades into many handler unit-test expectations, so those
  edits ride with it.
- Tasks 3 and 4 are server/resolver changes (envelope + validation). Both assume
  **Part 57** (the per-workflow `entity:` block) has landed, since they read
  `wfConfig.entity.*`.
- Task 5 (surface split) is a refactor that leaves the modal byte-for-byte
  behaviourally unchanged while extracting shared leaves.
- Task 6 (shell) only consumes already-shipped components.

**Composition (7–10).** The shell + breadcrumbs feed the page templates:

- Task 7 (breadcrumbs fragment) is layout-only but its Workflow/Entity links
  only fully resolve once Task 3 ships `workflow_id` / `entity_link.name`.
- Task 8 (check template) needs the split leaves (5), the shell (6), and the
  breadcrumbs (7). It must exist before Task 10 wires makeActionPages to emit it.
- Task 9 (form templates) needs the shell (6), breadcrumbs (7), and the
  `description` var (1).
- Task 10 (makeActionPages) ties it together: it passes the new vars the
  templates consume and emits the check page (so it depends on both template
  tasks), and it must agree with Task 2 on the `{workflow_type}-check` page id.

**Cleanup (11–12).** Only after the replacement pages exist:

- Task 11 retires the three shared `workflow-action-*` pages and updates the
  manifest, README, docs, and the now-stale "canonical page" comments.
- Task 12 retargets the e2e specs/fixtures that navigate to the retired ids.

Tasks 1–6 can run in parallel. 7 follows 3. 8 follows 5/6/7. 9 follows 1/6/7.
10 follows 8/9 (and 2). 11 follows 10. 12 follows 11.

## Scope

**Source:** `designs/workflows-module/parts/56-three-tier-action-pages/design.md`
**Context files considered:** none beyond `design.md` (this design folder has only `design.md` + review files). Cross-referenced the dependency design `designs/workflows-module/parts/57-inline-entity-config/design.md` for the `entity:` block contract.
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/consistency-1.md`
