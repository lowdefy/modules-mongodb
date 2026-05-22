# Implementation Tasks — Part 18 Entity-page components

## Overview

These tasks implement the three entity-page components from [Part 18 design.md](../design.md): `action_role_check` (role-gate action sequence), `workflow-header` (per-workflow strip with slot), and `actions-on-entity` (the workflow widget that feeds `ActionSteps`). The first two are urgently needed — Part 16's shipped templates and Part 17's shipped pages already `_ref` `action_role_check.yaml` and `workflow-header.yaml` from `modules/workflows/components/`, but the files don't exist yet, so the workflows module doesn't currently build cleanly. Task 1 unblocks the build; tasks 2–4 build the rest of the widget surface.

## Tasks

| #   | File                                | Summary                                                                                          | Depends On |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-ship-action-role-check.md`      | Ship `components/action_role_check.yaml` — roles-only action sequence writing `_state.action_allowed`. | —          |
| 2   | `02-ship-workflow-header.md`        | Ship `components/workflow-header.yaml` — strip + slot, with workflow-overview link and `is_overview_page` toggle. | —          |
| 3   | `03-ship-actions-on-entity.md`      | Ship `components/actions-on-entity.yaml` — multi-workflow widget; per workflow `_ref`s workflow-header with one `ActionSteps` block in the slot. | 2          |
| 4   | `04-wire-module-manifest.md`        | Add the three components to `module.lowdefy.yaml`'s `exports.components` and top-level `components:` block. | 1, 2, 3    |

## Ordering Rationale

**Why task 1 (`action_role_check`) comes first** — the file is already `_ref`'d by seven shipped templates and pages (Part 16's four form-action templates + Part 17's three task pages). Until the file exists, those pages fail to build / fail at runtime. This is the most urgent unblock; it also has no internal dependencies on this part's other components.

**Why task 2 (`workflow-header`) comes second** — also already `_ref`'d by a shipped consumer (Part 17's `workflow-overview` page at line 58). Shipping it independently of `actions-on-entity` (task 3) means the workflow-overview page becomes functional sooner. Task 3 depends on task 2 because `actions-on-entity` `_ref`s `workflow-header`.

**Why task 3 (`actions-on-entity`) comes after task 2** — direct `_ref` dependency on `workflow-header`. Also consumes the `ActionSteps` block from `plugins/modules-mongodb-plugins` (shipped per commit `13895bf`).

**Why task 4 (manifest wiring) comes last** — the manifest's `exports.components` is what makes the components consumable by host apps via `_ref: { module: workflows, component: actions-on-entity }`. Until all three components exist, the export entries would point at nothing. Doing the manifest in one shot (rather than three sequential touches to the same file) reduces conflict risk and keeps the export surface coherent.

**Parallelism** — tasks 1 and 2 can run in parallel (no shared file, no dependency between them). Task 3 is gated on task 2; task 4 is gated on all three.

## Scope

**Source:** [designs/workflows-module/parts/18-entity-components/design.md](../design.md)
**Context files considered:** none (no supporting files exist for this part)
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/consistency-1.md`

## Out of scope (handled elsewhere)

- **Demo lead page that exercises `actions-on-entity`** — design.md verification references "Lead page renders `actions-on-entity`," but the lead page wiring is owned by Part 27 (per the commit message on `95d23f1`). Part 18 ships the components; Part 27 wires them onto a demo entity page.
- **Part 17's `workflow-overview` call site update** — currently passes only `workflow: _state: overview.workflow` to `workflow-header`. Once task 2 ships, that call site needs amending to pass `is_overview_page: true` and the action cards as the `blocks:` slot. Out of scope for Part 18; tracked as a Part 17 follow-up (cross-design follow-up logged in this part's `review/consistency-1.md`).
- **Part 17 design.md:182 tracker-linking open question** — contradicts both part 17:53 and Part 18 review-1 #9's resolution (links allowed via `status_map`). Should be closed in Part 17's next consistency pass in the same direction Part 18 already committed to. Cross-design follow-up; not a Part 18 task.
- **E2E coverage** — lands in Part 22's e2e suite per `design.md`'s Verification section.
- **DataView → DataDescriptions swap on Parts 17 and 25** — logged in `review-2.md` as cross-design follow-ups; not Part 18's surface.
