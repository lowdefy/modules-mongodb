# Implementation Tasks — Extra Action Buttons in the Floating Button Bar

## Overview

These tasks implement Part 36: a `pages.{verb}.buttons.extra:` authoring slot that lets app authors add app-specific buttons into the workflows `floating-actions` bar alongside the template-shipped signal buttons. Derived from `designs/workflows-module/parts/36-extra-action-buttons/design.md`.

## Tasks

| #   | File                    | Summary                                                                                               | Depends On |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-validator.md`       | Add `RESERVED_BUTTON_IDS` + `buttons.extra` validation to `makeWorkflowsConfig.js` with unit tests    | —          |
| 2   | `02-template-wiring.md` | Wrap the `floating-actions` `actions:` array in `_build.array.concat` across all four verb templates  | —          |
| 3   | `03-demo-and-e2e.md`    | Add a `buttons.extra` Help button to a demo form action and assert it in the e2e spec                 | 1, 2       |
| 4   | `04-consumer-docs.md`   | Document `buttons.extra` + the button→modal pattern in `authoring-grammar.md` § Page overrides        | —          |
| 5   | `05-concept-docs.md`    | Update concept-design rationale (action-authoring D8, ui D4) and the workflows-module follow-on table | —          |

## Ordering Rationale

The two implementation primitives are independent and can run in parallel:

- **Task 1 (validator)** defines what config is legal — the reserved-id set and the form-only constraint. It touches only `makeWorkflowsConfig.js` and its test.
- **Task 2 (template wiring)** makes the slot actually render — it wraps each bar's `actions:` array so authored extras concatenate alongside the signal buttons. It touches only the four `.njk` templates (plus a `makeActionPages` round-trip test confirming the var reaches the template).

**Task 3 (demo + e2e)** exercises the slot end-to-end, so it depends on both: the validator must accept the demo's `buttons.extra` and the template must render it for the e2e assertion to pass.

**Tasks 4 and 5 (docs)** are documentation-only and depend on nothing code-wise — they can be done at any point, including in parallel with the implementation. They are split because `docs/` (consumer-observable behavior) and `designs/` (rationale) are distinct sources of truth with different conventions.

## Scope

**Source:** `designs/workflows-module/parts/36-extra-action-buttons/design.md`
**Context files considered:** none besides `design.md` (the design folder contains only `design.md` and review files)
**Review files skipped:** `review/consistency-1.md`, `review/review-1.md`, `review/review-2.md`, `review/review-3.md`
