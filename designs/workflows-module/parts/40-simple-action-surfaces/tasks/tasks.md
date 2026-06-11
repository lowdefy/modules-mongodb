# Implementation Tasks — Part 40: Check-action surfaces

## Overview

These tasks implement Part 40 (`designs/workflows-module/parts/40-simple-action-surfaces/design.md`):
rewrite the three shared check-action pages to the signal model (delete the
status selector and `interaction:`/`current_status` payloads), extract one
shared `check-action-surface` component, ship a standalone `check-action-modal`
plus a generic `onActionClick(action)` block event on `ActionSteps`, converge
`EventsTimeline` onto the same contract, and bundle the modal into
`actions-on-entity`.

## Tasks

| #   | File                                 | Summary                                                                                                   | Depends On    |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | `01-actionsteps-onactionclick.md`    | `ActionSteps`: generic `onActionClick(action)` event, navigate-by-default, linkless suppression + tests   | —             |
| 2   | `02-eventstimeline-converge.md`      | `EventsTimeline`: converge `onActionClick` onto the `ActionSteps` contract (action object + navigate default) | 1             |
| 3   | `03-check-action-surface.md`         | New shared `check-action-surface` component — one body, signal button bar, `current_action` state contract | —             |
| 4   | `04-edit-page-rewrite.md`            | `workflow-action-edit`: delete the selector, `_ref` the surface (`mode: edit`)                            | 3             |
| 5   | `05-review-page-rewrite.md`          | `workflow-action-review`: `_ref` the surface (`mode: review`), guard → `[in-review]`                      | 3             |
| 6   | `06-view-page-rewrite.md`            | `workflow-action-view`: `_ref` the surface (`mode: view`), `resolve_error` lands via the surface          | 3             |
| 7   | `07-check-action-modal.md`           | New standalone `check-action-modal` component + manifest export                                            | 3             |
| 8   | `08-actions-on-entity-wiring.md`     | `actions-on-entity`: bundle the modal, wire `ActionSteps.onActionClick` with the kind-branch              | 1, 7          |
| 9   | `09-docs-and-parent-design.md`       | Module README, parent-design row, implementation-plan status, full build + test verification              | 4, 5, 6, 7, 8 |
| 10  | `10-e2e-supplements.md`              | Part 22 e2e supplements: signal buttons, error recovery, modal open/submit, `allow_not_required`          | 2, 9          |

## Ordering Rationale

Two independent foundations start the work:

- **Tasks 1–2 (plugin blocks)** are self-contained JS changes. Task 1 also
  bootstraps block-component test infrastructure (JSX in the jest transform +
  jsdom), which task 2's tests reuse — hence 2 depends on 1.
- **Task 3 (the shared surface)** is the centrepiece every YAML consumer
  `_ref`s. It depends only on the already-shipped `GetWorkflowAction` contract
  (Part 46 tasks 1–10, committed).

The three page rewrites (**4, 5, 6**) and the modal (**7**) all consume the
surface and are independent of each other — they can run in parallel after 3.
Each page rewrite is kept as its own task because each carries distinct
deletions and guards (edit: selector + payload; review: guard allowlist change
+ `request_changes_modal` migration; view: status-history absorption +
`resolve_error`).

**Task 8** composes the two plugin/component pieces (ActionSteps event + modal)
inside `actions-on-entity`. **Task 9** is the docs/verification wrap-up once
every file is in its final shape. **Task 10** is the e2e pass over the
finished feature (it exercises the timeline convergence from task 2 and the
demo wiring from task 8).

## Cross-cutting state notes (read before implementing any task)

These reflect the repo as of branch `workflows-module` (post Part 46 task 10)
and are referenced from individual tasks:

1. **Part 46 tasks 11–12 are in flight** in the `part-46-tasks-11-12` worktree
   (events-timeline surface migration + shared-stage cleanup). Land those
   first, or rebase over them — task 2 touches `EventsTimeline.js` and task 10
   touches `apps/demo/e2e/workflows/`, both of which that worktree also edits.
2. **Part 24 (universal-fields) is not implemented** — the renderer is the
   invisible stub at
   `modules/workflows/components/universal-fields/universal-fields.yaml`. The
   surface passes the Part 24 contract vars (`mode`, `kind`, `state_path`,
   `action_data`) per the design; the stub ignores them until Part 24 lands.
   Field-level behaviour (editable inputs, scoped `Validate` actually matching
   inputs) only becomes observable then.
3. **Part 33 (comment rendering) is not implemented** — `workflow-action-view`
   still carries its Comments card. The design assumes Part 33's
   events-timeline swap happened first; it hasn't, so task 6 keeps the
   Comments card page-level below the surface, untouched. Part 33 owns the
   swap.
4. **Endpoint resolution deviation (flagged, design vs reality).** The design
   says the surface's endpoint "resolves to `_module.endpointId:
   { _build.string.concat: [update-action-, <action type>] }`, aligning with
   the form templates". On the generated form templates the action type is a
   build-time njk var, so `_build.string.concat` works. On the shared check
   surface the action type is only known at **runtime** (from the
   `GetWorkflowAction` response), so a `_build.*` concat cannot produce it.
   The tasks keep the shipped runtime pattern (`_string.concat` of
   `{ _module.id: true }` + `/update-action-` + the runtime type), which
   produces the identical scoped endpoint id. If the design should be
   amended to record this, do it as a one-line follow-up note in the design.
5. **No `onProgress` author hook on the check surface (flagged).** D1 says
   `progress` "fires its own author hook — `onProgress` — before the engine
   call" by analogy to the form template's `page_config.events.onProgress`.
   D3 of the same design establishes that shared static pages have **no
   per-action baking point** for author config — which is exactly what an
   author hook is. The form template's hook is njk-baked per action; the
   check surface structurally cannot host one. Tasks omit it; the `progress`
   button is `CallAPI` only (no `Validate`, per D1).
6. **`mode` is an `_ref` var used only in runtime operator positions.** The
   pages pass literal strings (`edit` / `view` / `review`); the modal passes a
   runtime `_if` chain derived from the fetched action. Both work because
   `_ref` vars substitute at build time and the substituted value is then
   evaluated wherever it sits — so the surface must only consume
   `_var: mode` inside runtime operators (`visible:` conditions via `_eq`),
   never in `_build.*` operators or structural positions (block `type:` etc.).

## Scope

**Source:** `designs/workflows-module/parts/40-simple-action-surfaces/design.md`
**Context files considered:** none — the design folder contains only
`design.md` (concept-doc reconciliation was already applied 2026-06-10; the
referenced sibling designs 46/34/38/39/42 and the shipped code were read as
context).
**Review files skipped:** `review/review-1.md`–`review-4.md`,
`review/consistency-1.md`, `review/consistency-2.md` (already incorporated
into the design).
