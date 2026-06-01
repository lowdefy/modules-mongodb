# Implementation Tasks — Part 42: Timeline action cards

## Overview

Restores the live "action status card" that the events timeline used to render
inline on the most-recent event referencing each workflow action. Implements the
design via one shared lookup/de-dup aggregation fragment plus two shared compute
stages (`visible_verbs`, `resolve_action_link`), wired unconditionally into the
events module's timeline and re-exported from the workflows module. Derived from
`designs/workflows-module/parts/42-timeline-action-cards/design.md`.

## Tasks

| #   | File                                   | Summary                                                                                          | Depends On |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-move-action-statuses-enum.md`      | Move `action_statuses.yaml` to `modules/shared/enums/`; repoint all 6 referencing files (D3).    | —          |
| 2   | `02-parameterize-visible-verbs.md`     | Convert shared `visible_verbs.yaml` from `_module.var` to `_var: app_name`; pass it from 3 APIs. | —          |
| 3   | `03-resolve-action-link-stage.md`      | Create `modules/shared/workflow/resolve_action_link.yaml` access-aware link pick (D5).           | —          |
| 4   | `04-apis-adopt-resolve-link.md`        | Adopt `resolve_action_link.yaml` in the 3 read APIs, replacing singular `link` projection (D5).  | 2, 3       |
| 5   | `05-timeline-action-lookup-fragment.md`| Create the shared lookup/de-dup fragment + re-export it from the workflows manifest (D1, D4, D5). | 2, 3       |
| 6   | `06-reconcile-eventaction-colours.md`  | Reconcile `EventsTimeline.js` `EventAction` colour keys to the enum shape (D3).                  | —          |
| 7   | `07-wire-events-timeline.md`           | Splice fragment + D6 self-card filter into `events-timeline.yaml`; pass `actionStatusConfig`; add events manifest var (D2, D3, D6). | 1, 5, 6 |
| 8   | `08-reconcile-part38-design.md`        | Drop the superseded "UI applies the per-verb selection rule" prose from Part 38 design + tasks.  | —          |
| 9   | `09-docs.md`                           | Document the always-on lookup convention and the exported fragment (events README + idioms).     | 5, 7       |

## Ordering Rationale

**Three independent foundations start immediately (1, 2, 3, 6, 8):**

- **Task 1** (enum move) is a self-contained mechanical relocation + ref repoint. Nothing else depends on the *location*, but Task 7 reads the moved file via `../shared/enums/...`.
- **Task 2** (parameterize `visible_verbs.yaml`) is a pure refactor that keeps the build green — it converts the shared compute stage to take a passable `_var: app_name` and updates the 3 existing API callers to pass it. Required because Part 38 shipped `visible_verbs.yaml` using `_module.var: app_name`, which cannot resolve inside the dependency-free events module (it has no `app_name` var). Both the fragment (Task 5) and the link-adoption (Task 4) build on the parameterized form.
- **Task 3** (`resolve_action_link.yaml`) is a new standalone file; it depends only on `visible_verbs` *output* (which already ships), so it has no task dependency.
- **Task 6** (block colour reconcile) is a pure plugin/JS change, independent of all aggregation work.
- **Task 8** (Part 38 design-doc prose) is documentation reconciliation, independent of code.

**Dependency chains:**

- `2, 3 → 4` — the APIs need both the parameterized `visible_verbs` ref and the new link stage.
- `2, 3 → 5` — the fragment composes both shared stages.
- `1, 5, 6 → 7` — wiring the events timeline needs the moved enum (1), the fragment to splice (5), and the reconciled block to render the new colour keys (6).
- `5, 7 → 9` — docs describe the shipped fragment + always-on behaviour.

**Parallelism:** Tasks 1, 2, 3, 6, 8 can all run in parallel. Then 4 and 5 (after 2+3). Then 7. Then 9 last. Tasks 4 and 5 both depend on 2+3 but are independent of each other.

## Scope

**Source:** `designs/workflows-module/parts/42-timeline-action-cards/design.md`
**Context files considered:** none beyond `design.md` — the design folder contains only `design.md` and a `review/` subfolder.
**Review files skipped:** `designs/workflows-module/parts/42-timeline-action-cards/review/` (entire folder).

## Deviations from the design's "Files changed" table (flagged for the implementer)

These were discovered against the live codebase and are **not** captured in the design's Files table. Each is handled in the relevant task:

1. **Enum-move blast radius (Task 1).** The design names only `modules/workflows/components/action_statuses.yaml` as needing a repoint. In fact `enums/action_statuses.yaml` is `_ref`'d directly in **six** files: `connections/workflow-api.yaml`, `components/action_statuses.yaml`, `pages/simple-view.yaml` (×6), `pages/simple-review.yaml` (×2), `pages/simple-edit.yaml`, and `templates/edit.yaml.njk`. All must be repointed or the build breaks. (`_ref` paths within a module resolve relative to the module root, so the new path is `../shared/enums/action_statuses.yaml` from every workflows-module file.)

2. **`visible_verbs.yaml` already exists from Part 38 (Task 2).** The design's Files table lists it as **New**, but Part 38 task 7 already created it at `modules/shared/workflow/visible_verbs.yaml` using `_module.var: app_name`. Part 42 must *convert* it (not create it) to `_var: app_name` and update its 3 existing API callers, because `_module.var: app_name` cannot resolve inside the events module.

3. **Multi-stage fragment splicing needs `_build.array.concat` (Tasks 5, 7, 9).** Lowdefy `_ref` substitutes a node in place and does **not** flatten a list spliced as a single array item — it nests it (this is exactly why Part 38 kept `visible_verbs` compute + drop as two separate single-stage `_ref`s). The design's proposed-shape sketches (single `- _ref:` for the multi-stage fragment, and the app-developer example) would nest. Consumers must splice the fragment via `_build.array.concat`, the same pattern the workflows manifest uses for its `api:`/`pages:` arrays.
