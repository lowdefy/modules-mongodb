# Implementation Tasks — Part 56 Addendum: action-page layout revision

## Overview

These tasks implement the layout revision in
`designs/workflows-module/parts/56-three-tier-action-pages/design-addendum-layout.md`,
which **amends** the already-implemented Part 56. They are **additive on top of the
shipped code** (tasks 01–12) — the original tasks are not re-opened. The engine /
envelope / resolver / config work (tasks 02/03/04/10) and the breadcrumb fragment
(07) are unchanged; this is UI delivery only.

What changes, from the addendum:

- Universal fields **leave the RHS** — assignees + due → title-bar chips
  (`page_actions`), description → a middle-column callout, edit → a modal (DA1/DA2).
- The action bar moves from a **full-content-width page sibling** into a **floating
  card inside the middle column**, with a left slot for workflow-defined buttons (DA3).
- The RHS **drops its `Tabs`** — entity Details stacks above History (DA4).
- Status pill stays left; left panel unchanged (DA5, no work).

**Visual source of truth:** `mockups/option-c-converged.html`.

## Tasks

| #   | File                                         | Summary                                                                                                                                                                                                                                       | Depends On |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A1  | `A1-shell-revise-rhs-and-actions.md`         | Revise `action-workspace.yaml`: drop `universal_fields` slot + RHS `Tabs`; stack Details/History; add one flat `actions` slot (relocated `floating-actions` bar in the middle column). `floating-actions.yaml` unchanged (Part 36 precedent). | —          |
| A2  | `A2-universal-fields-chips-callout-modal.md` | Universal-fields display fragments (chips + callout) and an edit-modal wrapper reusing the existing `mode: edit` body (Part 24 reconciliation).                                                                                               | —          |
| A3  | `A3-form-templates-relayout.md`              | Reshape `view/edit/review/error.yaml.njk`: chips + `✎` → `page_actions`; callout → middle top; buttons → `actions` slot; mount edit modal; stop passing `universal_fields`.                                                                   | A1, A2     |
| A4  | `A4-check-template-relayout.md`              | Reshape `check.yaml.njk` with the same wiring sourced from `current_action.*`; RHS = History only.                                                                                                                                            | A1, A2     |

## Ordering

A1 (shell) and A2 (universal-fields fragments + modal) are independent and
parallelizable. A3 (form templates) and A4 (check template) each compose A1's
revised shell and A2's fragments, so both follow A1 + A2. There are **no engine,
resolver, or unit-test changes** — the build check (`pnpm ldf:b`) plus a `/r:dev-test`
of the workspace pages stand in (e2e cannot run in the sandbox, same as the primary).

## Scope

**Source:** `design-addendum-layout.md` (amends `design.md`).
**As-built grounding:** `modules/workflows/templates/view.yaml.njk` (the shipped form
template — note it already uses `layout/floating-actions` as a full-width sibling and
composes `universal-fields` in `mode: display`), `modules/workflows/components/action-workspace.yaml`,
`modules/shared/layout/floating-actions.yaml`, `modules/shared/layout/title-block.yaml`.
