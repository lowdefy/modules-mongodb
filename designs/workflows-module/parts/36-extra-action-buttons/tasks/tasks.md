# Implementation Tasks — Part 36: Extra Action Buttons in the Floating Button Bar

## Overview

These tasks implement the `pages.{verb}.buttons.extra` authoring slot: author-supplied buttons concatenated into the same `floating-actions` bar as the template-shipped signal buttons on form-action `edit` / `review` / `error` pages, plus the validator guard, demo exercise, and documentation. Derived from `designs/workflows-module/parts/36-extra-action-buttons/design.md`.

## Tasks

| #   | File                            | Summary                                                                                       | Depends On |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-validator-buttons-extra.md` | `RESERVED_BUTTON_IDS` + structural validation of `buttons.extra` in `makeWorkflowsConfig.js`   | —          |
| 2   | `02-template-concat-wiring.md`  | Wrap the three verb templates' `actions:` arrays in `_build.array.concat`; round-trip test     | —          |
| 3   | `03-demo-help-button.md`        | Demo exercise: "Help" extra button on the qualify action's edit page                           | 1, 2       |
| 4   | `04-readme-per-page-chrome.md`  | New `### Per-page chrome` README subsection documenting all chrome slots incl. `buttons.extra` | 1, 2       |
| 5   | `05-concept-docs-roadmap.md`    | Concept-doc reconciliation (action-authoring D8, ui D4) + Part 36 row in the roadmap           | —          |
| 6   | `06-e2e-help-button.md`         | E2E supplement: Help button visible in the bar, click navigates                                | 3          |

## Ordering Rationale

**Tasks 1 and 2 are independent and parallel.** The validator change (task 1) and the template wiring (task 2) touch disjoint files and neither needs the other to be testable — the validator's unit tests run against synthetic workflow YAML; the template wiring's round-trip test runs against `makeActionPages` fixtures. Both must land before the demo exercise (task 3), because the demo's `buttons.extra` block must both pass validation and actually render.

**Task 3 (demo)** is the build-level integration check: `pnpm build` runs `makeWorkflowsConfig` against the demo workflow_config and materialises the templates' `_build.array.concat`. It needs both code tasks.

**Task 4 (README)** documents behaviour shipped by tasks 1–2 (slot shape, reserved ids, modal pattern), so it nominally follows them, but it can be drafted in parallel since the shapes are locked in the design.

**Task 5 (concept docs + roadmap)** is markdown-only with no code dependency — it transcribes decisions already locked in the design into `action-authoring/design.md` Decision 8, `ui/design.md` Decision 4, and the parent roadmap. Can run any time.

**Task 6 (e2e)** asserts the demo's Help button in the live app, so it needs task 3. It is a one-assertion supplement to the Part 22 demo smoke coverage — coordinate ordering with Part 22 if its harness work is still in flight.

### Cross-part sequencing (read before starting)

This part is designed against the **post-Part-39** template state. At the time these tasks were written, Part 39 (form-submit buttons, signal model) had tasks defined but **not yet implemented** — the shipped templates still carry the pre-39 button ids (`button_submit_edit`, no `button_progress`, `interaction:` payloads). Two consequences:

- **Task 1's `RESERVED_BUTTON_IDS` uses the post-39 names** (`button_submit`, `button_progress`, `button_not_required`, `button_approve`, `button_request_changes`, `button_resolve_error`). If Part 39 has not landed when task 1 is implemented, the constant will name ids that don't yet exist in the templates — that's acceptable (the constant guards author config, not template state), but the rename in Part 39 task 02 must keep the constant in sync. Prefer landing Part 39 tasks 2–4 first.
- **Task 2's concat wiring is name-agnostic** — it wraps whatever button array the template carries, so it composes cleanly with Part 39's template rewrites in either order. If Part 36 task 2 lands first, Part 39's template tasks must preserve the `_build.array.concat` wrapper.
- **Task 5's concept-doc edits assume Part 39 task 8** (doc reconciliation) has already migrated `ui/design.md` Decision 4 to the signal model. If it hasn't, apply this part's edits to the current text and flag the overlap in the PR.

The demo config (`qualify.yaml`) is also due for reshaping by Parts 38/45 — task 3 adds only the `pages.edit.buttons.extra` block and doesn't depend on the file's surrounding shape.

## Scope

**Source:** `designs/workflows-module/parts/36-extra-action-buttons/design.md`
**Context files considered:** none in the part folder besides `design.md` (the part has no supporting files); cross-referenced live state of `modules/workflows/templates/{edit,review,error,view}.yaml.njk`, `modules/workflows/resolvers/makeWorkflowsConfig.js`, `makeActionPages.js`, `modules/shared/layout/floating-actions.yaml`, `modules/workflows/README.md`, `designs/workflows-module-concept/{action-authoring,ui}/design.md`, `designs/workflows-module/parts/39-form-submit-buttons/tasks/tasks.md`, and the demo workflow_config.
**Review files skipped:** `review/` folder contents.
