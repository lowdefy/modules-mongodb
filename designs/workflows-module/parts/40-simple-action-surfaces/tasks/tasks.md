# Implementation Tasks — Part 40: Simple-action surfaces

## Overview

These tasks rewrite the three shared simple-action pages (`simple-edit` / `simple-view` / `simple-review`) from the v0 interaction/selector model to the signals + FSM model, extract their body into one shared `simple-action-surface` component, add a standalone `simple-action-modal` so live working surfaces can open a simple action in place, give the `ActionSteps` block a generic `onActionClick` event, resolve simple-action error recovery (`resolve_error` on `simple-view`), and reconcile the concept docs. Derived from `designs/workflows-module/parts/40-simple-action-surfaces/design.md`.

## Tasks

| #   | File                                   | Summary                                                                                  | Depends On |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-resolver-simple-action-buttons.md` | Emit `global.simple_action_buttons.{type}.{signal}.visible` from `makeWorkflowsConfig` (D3) + unit tests | —          |
| 2   | `02-actionsteps-onactionclick.md`      | Add generic `onActionClick` event to the `ActionSteps` block (fire when wired, navigate otherwise) + tests (D5) | —          |
| 3   | `03-simple-action-surface.md`          | New shared `simple-action-surface` component — body + mode-keyed signal button bar (D1/D2/D3) | 1          |
| 4   | `04-rewrite-simple-pages.md`           | Rewrite the three `simple-*` pages onto the surface; delete selector; `interaction:`→`signal:`; add `resolve_error` (D1/D2/D4/D6) | 3          |
| 5   | `05-simple-action-modal.md`            | New standalone `simple-action-modal` Drawer component + open contract (D5)               | 3          |
| 6   | `06-actions-on-entity-wiring.md`       | Bundle the modal in `actions-on-entity`; wire `ActionSteps.onActionClick` → open it (D5) | 2, 5       |
| 7   | `07-concept-doc-reconciliation.md`     | Reconcile `ui`, `state-machine`, and parent design docs                                  | —          |
| 8   | `08-e2e-supplements.md`                | E2E coverage on the demo `schedule-followup` simple action (a–e)                         | 4, 5, 6    |

## Ordering Rationale

Two independent foundations open the graph and can run in parallel:

- **Task 1** (resolver global) produces `global.simple_action_buttons`, which the surface's author-opt-out AND-term reads. It touches only the resolver + its test — no UI dependency.
- **Task 2** (ActionSteps event) is a self-contained plugin change + test. Nothing in the module depends on it until the `actions-on-entity` wiring (Task 6).

**Task 3** (the surface) is the keystone: it consumes Task 1's global and Part 39's `button_signal_sources.yaml` enum. Both the pages (Task 4) and the modal (Task 5) `_ref` it, so it must land first — hence the split. Tasks 4 and 5 are independent of each other and can run in parallel once the surface exists.

**Task 6** needs both the event (Task 2) and the modal (Task 5) before it can wire them together.

**Task 7** (concept docs) has no code dependency — the resolutions it records (D4 error recovery, D3 opt-out defaults, D5 modal) are fixed by the design itself, so it can be done at any point.

**Task 8** (E2E) verifies the whole stack end-to-end and therefore comes last, after the pages, modal, and `actions-on-entity` wiring are all in place.

Parallelizable: {1, 2, 7} at the start; {4, 5} after 3.

## Cross-wave dependency to watch (from the design)

This part **builds on Part 34's per-verb access model**: the surface's role gates read `_state.surface.action_allowed.{view|edit|review|error}` (Part 34 D8) and navigation uses `action.links.{verb}` (Part 34 D7/D9). The shipped `components/action_role_check.yaml` still emits a **single boolean** `action_allowed`, and `ActionSteps.js` still reads a single `action.link`. Producing the per-verb `action_allowed` map and the per-verb `action.links` selection is **Part 34's** scope, not this part's. Where a task depends on the per-verb shape, it is flagged in that task's Notes. If Part 34 has not yet migrated those, that migration must land before (or with) this part.

## Scope

**Source:** `designs/workflows-module/parts/40-simple-action-surfaces/design.md`
**Context files considered:** project `CLAUDE.md`; `docs/idioms.md`; current `modules/workflows/pages/simple-{edit,view,review}.yaml`; `modules/workflows/components/{actions-on-entity,action_role_check,universal-fields/universal-fields}.yaml`; `modules/workflows/resolvers/makeWorkflowsConfig.js`; `modules/workflows/module.lowdefy.yaml`; `plugins/.../blocks/ActionSteps/{ActionSteps.js,meta.js}`; `plugins/.../blocks/EventsTimeline/EventsTimeline.js` (event-firing pattern reference); Part 39 design + its `button_signal_sources.yaml` enum spec (consumed dependency).
**Review files skipped:** `designs/workflows-module/parts/40-simple-action-surfaces/review/` (entire folder).
