# Implementation Tasks — Companies Grouping

## Overview

Implements the companies-grouping design: a DAG model (`parent_ids: string[]`) over the companies collection, gated by a single `hierarchy.enabled` var. Adds parent-picker UI, a combined parents/children sidebar tile, an opt-in list filter, and a `$graphLookup`-based cycle-prevention guard. Source: `designs/companies-grouping/design.md`.

## Tasks

| #   | File                                          | Summary                                                                                  | Depends On |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-module-manifest.md`                       | Add `hierarchy` var to `module.lowdefy.yaml`; bump version                               | —          |
| 2   | `02-descendants-request.md`                   | Add shared `get_descendant_company_ids` request                                          | 1          |
| 3   | `03-create-company-parent-ids.md`             | Build-gate `parent_ids` in `create-company`                                              | 1          |
| 4   | `04-update-company-cycle-check.md`            | Cycle check + `parent_ids` write in `update-company`                                     | 1          |
| 5   | `05-company-selector-cycle-check-ids.md`      | Extend `company-selector` + `get_companies_for_selector` to support `cycle_check_ids`    | 1          |
| 6   | `06-parent-selector-wrapper.md`               | Create `parent_selector` wrapper component (no own `onMount`)                            | 5          |
| 7   | `07-edit-form-wiring.md`                      | Append parent selector to `form_company`; three-step `onMount` on `edit.yaml`            | 1, 2, 6    |
| 8   | `08-get-company-parents-lookup.md`            | Extend `get_company` with parents `$lookup` (filtered to non-removed)                    | 1          |
| 9   | `09-view-page-hierarchy-tile.md`              | Add `get_company_children`, create `tile_hierarchy`, wire into `pages/view.yaml`         | 1, 8       |
| 10  | `10-list-filter.md`                           | Parent-scope filter on `filter_companies`; Atlas Search `must` clause on `get_all_companies` (lowest priority) | 1, 2       |
| 11  | `11-demo-and-readme.md`                       | Enable hierarchy in `apps/demo/modules/companies/vars.yaml`; update `modules/companies/README.md` | 1          |

## Ordering Rationale

**Foundation first.** Task 1 (manifest var) is the gate every other task references. Without it, build-time `_build.if` injections have no flag to read.

**Read/write infrastructure (2–4) before UI.** The descendants request (2) is shared by edit form and list filter; it's the most-reused piece. The write-side changes (3, 4) come next so writing parent_ids is possible before the form even exists. The cycle check (4) is the load-bearing invariant — if it lands wrong, every other write surface is suspect.

**Edit form chain (5 → 6 → 7).** The selector primitives (5) get extended first (backward compatible — `cycle_check_ids: []` default means existing consumers see no behavioural change). The wrapper (6) is then a thin `parent_selector` that overrides `onMount`. The form/page wiring (7) ties it all together with the three-step `onMount` sequence (`fetch_doc_data → set_state → fetch_selector_options`), producing the first end-to-end testable surface.

**View page chain (8 → 9).** `get_company` parents `$lookup` (8) is independent of the edit form work and can start in parallel with tasks 2–7. The combined `tile_hierarchy` + children request + page wiring (9) follows.

**List filter last (10).** Per the design, this is the lowest-priority piece — apps without it still get hierarchy editing and display. It depends on the descendants request (2) and the var (1) but nothing else, so it could in principle slot in earlier — keeping it last reflects the design's stated priority and lets the rest land first.

**Demo + docs (11) last.** Enables the feature in the demo app and documents the var in `README.md`. No code changes, just configuration and prose.

**Parallelism.** After task 1, tasks 2, 3, 4, 5, 8 can all proceed independently. Task 6 waits on 5; 7 waits on 2 + 6; 9 waits on 8; 10 waits on 2; 11 ideally lands after the surfaces it documents (so after at least 7 + 9).

**Testable milestones.** End-of-task-7 = working edit form with cycle prevention. End-of-task-9 = working view page with hierarchy tile. End-of-task-10 = working list filter. Each is independently demoable.

## Scope

**Source:** `designs/companies-grouping/design.md`
**Context files considered:** `docs/idioms.md` (sidebar slots, `removed` idiom), `modules/companies/` source files referenced throughout the design.
**Review files skipped:** `designs/companies-grouping/review/review-1.md`, `designs/companies-grouping/review/consistency-2.md` — both fully resolved and folded into the design body.
