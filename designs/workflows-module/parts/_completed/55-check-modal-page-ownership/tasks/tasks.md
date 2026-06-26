# Implementation Tasks — Check-action modal: page ownership + graceful click fallback

## Overview

These tasks implement `designs/workflows-module/parts/55-check-modal-page-ownership/design.md`: move the check-action modal drop (and its post-submit `on_complete` refetch wiring) from the surface components up to the page, collapse the timeline's parallel `include_modal` mechanism, and make the shared click handler degrade gracefully (`try`/`catch`) when no modal is present so surfaces work standalone.

## Tasks

| #   | File                               | Summary                                                                                       | Depends On |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-click-handler-try-catch.md`    | Wrap `check-action-click` in `try`/`catch`; `messages.error:false` on open; navigate fallback | —          |
| 2   | `02-remove-surface-modal-drops.md` | Stop `actions-on-entity` and `workflows-events-timeline` from dropping the modal              | 1          |
| 3   | `03-wire-demo-page-modal-drops.md` | Drop the modal once per page on `lead-view` and `companies/view`, page-owned `on_complete`    | 2          |
| 4   | `04-update-docs.md`                | Update manifest `exports.components` docs and `README.md` for the page-drop contract          | 2, 3       |
| 5   | `05-reconcile-e2e-spec.md`         | Reconcile the four `check`-row steps in the onboarding e2e to drive the modal in place        | 3          |

## Ordering Rationale

The dependency chain follows the design's structure: mechanism → wiring → docs/tests.

- **Task 1** is the foundation. The `try`/`catch` fallback is what makes a surface safe on a page without the modal. It is independent of all other changes and must land first so that, once surfaces stop auto-dropping the modal (Task 2), a check-row click degrades to navigation instead of throwing.
- **Task 2** removes modal-dropping from both surface components in one coherent change — the design's "exactly one mechanism" rule requires both surfaces to stop dropping the modal together. It depends on Task 1 so that any page without a page-level drop degrades gracefully rather than erroring.
- **Task 3** wires the two demo multi-surface pages to drop the modal once each with a page-appropriate `on_complete`. It must come after Task 2: if a page dropped the modal while `actions-on-entity` still auto-dropped it, the fixed global blockId `check_action_modal` would collide (duplicate drop).
- **Task 4** updates documentation (manifest + README) to the page-drop contract. It depends on the final mechanism (Tasks 1–3) being settled so the prose matches the code.
- **Task 5** reconciles the onboarding e2e spec, whose four `check`-row steps currently assert full-page navigation. Because the demo pages keep the modal (Task 3), those clicks now open in place. It depends on Task 3 and must be confirmed with `/r:dev-test` against a live run.

Tasks 4 and 5 are independent of each other and can run in parallel once Task 3 is done. Task 1 can technically start in parallel with nothing blocking it.

## Scope

**Source:** `designs/workflows-module/parts/55-check-modal-page-ownership/design.md`
**Context files considered:** none (design.md is the only non-review file in the folder); cross-referenced the touched source files (`modules/workflows/components/check-action-click.yaml`, `actions-on-entity.yaml`, `workflows-events-timeline.yaml`, `check-action-modal.yaml`, `entity-workflows-refetch.yaml`, `modules/workflows/module.lowdefy.yaml`, `modules/workflows/README.md`, `apps/demo/pages/leads/lead-view.yaml`, `apps/demo/modules/companies/vars.yaml`, `apps/demo/e2e/workflows/onboarding-happy-path.spec.js`)
**Review files skipped:** `review/review-1.md`
