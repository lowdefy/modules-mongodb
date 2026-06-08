# Implementation Tasks — Part 40: Simple-action surfaces

## Overview

These tasks rewrite the three shared simple-action pages (`workflow-action-edit` / `workflow-action-view` / `workflow-action-review`) from the v0 interaction/selector model to the signals + FSM model, extract their body into one shared `simple-action-surface` component, add a standalone `simple-action-modal` (a `Modal`) so live working surfaces can open a simple action in place, give the `ActionSteps` block a generic `onActionClick` event, implement the doc-borne `allow_not_required` policy (config validate → engine persist → engine enforce → form-template alignment), resolve simple-action error recovery (`resolve_error` on `workflow-action-view`), and reconcile the concept docs. Derived from `designs/workflows-module/parts/40-simple-action-surfaces/design.md`.

## Tasks

| #   | File                                   | Summary                                                                                          | Depends On |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-allow-not-required-policy.md`      | `allow_not_required`: validate (`makeWorkflowsConfig`) + persist (`planActionTransition`) + enforce (`loadWorkflowState`) + form alignment (`edit.yaml.njk`); engine unit tests (D3) | —          |
| 2   | `02-actionsteps-onactionclick.md`      | Generic `onActionClick` event on the `ActionSteps` block (fire when wired, navigate otherwise) + tests (D5) | —          |
| 3   | `03-simple-action-surface.md`          | New shared `simple-action-surface` component — body + mode-keyed signal button bar (D1/D2/D3)    | —          |
| 4   | `04-rewrite-simple-pages.md`           | Rewrite the three `workflow-action-*` pages onto the surface; delete selector; `interaction:`→`signal:`; `resolve_error`; page-level events timeline (D1/D2/D4/D6) | 3          |
| 5   | `05-simple-action-modal.md`            | New standalone `simple-action-modal` (`Modal`) + open contract (D5)                              | 3          |
| 6   | `06-actions-on-entity-wiring.md`       | Bundle the modal in `actions-on-entity`; wire `ActionSteps.onActionClick` → open it (D5)         | 2, 5       |
| 7   | `07-concept-doc-reconciliation.md`     | Reconcile `ui`, `state-machine`, and parent design docs                                          | —          |
| 8   | `08-e2e-supplements.md`                | E2E coverage on the demo `schedule-followup` simple action (a–f, incl. `allow_not_required`)     | 1, 4, 5, 6 |

## Ordering Rationale

Four independent foundations open the graph and can run in parallel: **{1, 2, 3, 7}**.

- **Task 1** (the `allow_not_required` policy) is a self-contained backend/config feature — resolver validation, engine persist, engine enforce, and the form-template alignment, with engine unit tests. Nothing in the UI tasks depends on its *code*: the surface (Task 3) only *reads* the resulting doc field `surface.action.allow_not_required`, which defaults safely to hidden until the engine stamp lands. Task 8 (E2E) needs it for scenario (f).
- **Task 2** (the `ActionSteps` event) is a self-contained plugin change + test. Nothing in the module depends on it until the `actions-on-entity` wiring (Task 6).
- **Task 3** (the surface) is the keystone — both the pages (Task 4) and the modal (Task 5) `_ref` it. It consumes the **shipped** `enums/button_signal_sources.yaml` enum (Part 39) and the **shipped** per-verb `action_role_check` map; it has no in-part code dependency, so it can start immediately.
- **Task 7** (concept docs) has no code dependency — the resolutions it records (D3, D4, D5) are fixed by the design.

After Task 3, **{4, 5}** are independent of each other and run in parallel. **Task 6** needs both the event (Task 2) and the modal (Task 5). **Task 8** (E2E) verifies the whole stack and comes last, after the policy (1), pages (4), modal (5), and wiring (6).

Parallelizable: {1, 2, 3, 7} at the start; {4, 5} after 3.

## Bands

The part lands in two bands (sequencing owned by the implementation plan). Band 1 is on the **demo-testing critical path**: the rebuilt engine accepts only `signal:` payloads (Part 38 dropped `interaction`/`current_status` from the wire), so until the three shared pages are rewritten, `kind: simple` actions cannot be driven from the UI at all.

### Band 1 — Signal rewrite + policy (demo-blocking)

- **Tasks:** 1, 3 → 4
- **Runs after:** Part 39 (the surface consumes its `enums/button_signal_sources.yaml`) and Part 24 (the real `universal-fields` renderer + its `state_path` var; the surface passes `state_path: surface.fields`).

### Band 2 — In-context modal + verification (post-demo)

- **Tasks:** 2 ∥ 5 ∥ 7 → 6 → 8
- **Runs after:** Part 33 (the events-timeline swap on the view page — rendered page-level below the surface) and the demo rebuild (Part 45) for Task 8's E2E.

## Cross-wave dependencies (now shipped)

This part **builds on Part 34's per-verb access model**, which has **shipped**: the surface's role gates read `_state.surface.action_allowed.{view|edit|review|error}` (Part 34 D8) and navigation uses the server-resolved `action.link` (Part 34 D7/D9 + Part 42 D5). The shipped `components/action_role_check.yaml` already emits the per-verb `action_allowed` map (Part 38 task 8 + `evaluateVerbGate.js`), and the read APIs already collapse the engine's per-verb `links` map to the singular `action.link` (Part 42 D5, shipped). **No cross-wave migration is pending.** The surface copies `action_role_check`'s root `action_allowed` into `surface.action_allowed` via a following `SetState` (Tasks 4/5, review-2 #3).

## Known open items (carried from the design, not yet resolved)

- **`kind` branch in the `actions-on-entity` wiring** (open-questions §4) — D5's host wiring opens the modal for every clicked action, but a form action can't render in the simple surface. Task 6 implements the design as written and **flags** the likely `kind: simple` branch pending design amendment + response-projection verification.
- **`EventsTimeline.onActionClick` payload** (open-questions §5) — the shipped timeline event fires `{ pageId, urlQuery }`, not the action object; a timeline host driving the modal must reconcile the payload. The `ActionSteps` path (Task 6) is unaffected — its event carries the action object. Noted in Task 5.

## Scope

**Source:** `designs/workflows-module/parts/40-simple-action-surfaces/design.md`
**Context files considered:** project `CLAUDE.md`; `open-questions.md`; current `modules/workflows/pages/workflow-action-{edit,view,review}.yaml`; `modules/workflows/components/{actions-on-entity,action_role_check,universal-fields/universal-fields}.yaml`; `modules/workflows/enums/button_signal_sources.yaml`; `modules/workflows/resolvers/makeWorkflowsConfig.js`; `modules/workflows/templates/edit.yaml.njk`; `plugins/.../blocks/ActionSteps/{ActionSteps.js,meta.js}`; `plugins/.../connections/shared/phases/{loadWorkflowState.js,planners/planActionTransition.js}`; Part 39 design (consumed dependency); commit history for the affected files.
**Review files skipped (per skill):** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`, `review/consistency-1.md`. The `consistency-1.md` pointer in the invocation confirmed design.md is the up-to-date source of truth and the prior task files were stale (which this regeneration replaces).
