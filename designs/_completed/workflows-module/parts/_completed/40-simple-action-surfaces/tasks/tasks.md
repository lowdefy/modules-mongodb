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

| #   | File                                           | Summary                                                                                                                                           | Depends On     |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | `01-actionsteps-onactionclick.md`              | `ActionSteps`: generic `onActionClick(action)` event, navigate-by-default, linkless suppression                                                   | —              |
| 2   | `02-eventstimeline-converge.md`                | `EventsTimeline`: converge `onActionClick` onto the `ActionSteps` contract (action object + navigate default)                                     | —              |
| 3   | `03-check-action-surface.md`                   | New shared `check-action-surface` component — one body, signal button bar, `current_action` state contract                                        | —              |
| 4   | `04-edit-page-rewrite.md`                      | `workflow-action-edit`: delete the selector, `_ref` the surface (`mode: edit`)                                                                    | 3              |
| 5   | `05-review-page-rewrite.md`                    | `workflow-action-review`: `_ref` the surface (`mode: review`), guard → `[in-review]`                                                              | 3              |
| 6   | `06-view-page-rewrite.md`                      | `workflow-action-view`: `_ref` the surface (`mode: view`), `resolve_error` lands via the surface                                                  | 3              |
| 7   | `07-check-action-modal.md`                     | New standalone `check-action-modal` component + manifest export                                                                                   | 3              |
| 8   | `08-actions-on-entity-wiring.md`               | `actions-on-entity`: bundle the modal + kind-branch; `workflows-events-timeline`: `on_action_click` passthrough                                   | 1, 2, 7        |
| 9   | `09-docs-and-parent-design.md`                 | Module README, parent-design row, implementation-plan status, full build + test verification                                                      | 4, 5, 6, 7, 8  |
| 10  | `10-e2e-supplements.md`                        | Part 22 e2e supplements: signal buttons, error recovery, modal open/submit, `allow_not_required`                                                  | 9              |
| 11  | `11-repoint-surface-to-per-workflow-submit.md` | Re-point the surface's 6 signal buttons to `{workflow_type}-submit`; ship `workflow_type` from `GetWorkflowAction` (resolves Blocker 1's UI half) | Part 48 merged |

## Ordering Rationale

Three independent foundations start the work and can run in parallel:

- **Tasks 1–2 (plugin blocks)** are self-contained JS changes — the
  `onActionClick` contract on each block. (No unit tests ride them — see
  "Decisions applied" #3.)
- **Task 3 (the shared surface)** is the centrepiece every YAML consumer
  `_ref`s. It depends only on the already-shipped `GetWorkflowAction` contract
  (Part 46, completed).

The three page rewrites (**4, 5, 6**) and the modal (**7**) all consume the
surface and are independent of each other — they can run in parallel after 3.
Each page rewrite is its own task because each carries distinct deletions and
guards (edit: selector + payload; review: guard allowlist change +
`request_changes_modal` migration; view: status-history absorption +
`resolve_error`).

**Task 8** composes the pieces: the modal + `ActionSteps` event inside
`actions-on-entity`, and the `on_action_click` passthrough var on the
`workflows-events-timeline` wrapper (shipped by Part 46 task 11) so timeline
hosts can drive the same modal. **Task 9** is the docs/verification wrap-up.
**Task 10** is the e2e pass over the finished feature.

**Task 11** is a post-Part-48 cleanup (added post-implementation) that resolves
the UI half of Blocker 1: it re-points the surface's six signal buttons from the
stale `update-action-{type}` to the post-Part-48 `{workflow_type}-submit`, and
ships `workflow_type` from `GetWorkflowAction` so the surface can build that id.
It **runs after Part 48 merges** into `workflows-module` (Part 48 is in flight in
a sibling worktree and cannot be coordinated with), and reconciles whatever Part
48 leaves — its task 11 re-points the `.njk` templates and demo callers but its
file list never reaches the Part 40 surface or the `GetWorkflowAction` envelope.
Step 0 audits Part 48's actual end state before editing.

## Decisions applied (settled with Sam, 2026-06-11 — design amended accordingly)

1. **Endpoint id — runtime concat.** The design's original
   `_module.endpointId` + `_build.string.concat` form cannot evaluate on
   shared pages (the action type is runtime-only there). The surface keeps the
   shipped pattern — `_string.concat` of `{ _module.id: true }` +
   `/update-action-` + `_state: current_action.type`. Design D1 now records
   this.
2. **No `onProgress` author hook on the check surface.** D1's hook sentence
   contradicted D3's structural argument (shared static pages have no
   per-action baking point); the `progress` button is `CallAPI` only. Design
   D1 now records this.
3. **Block component tests dropped.** The repo has no block-test
   infrastructure (node-env jest, no JSX/jsdom) and bootstrapping React
   testing inside this part was rejected. Behavioural coverage rides task 10's
   e2e; per-block Playwright coverage is a separate repo-root **stub design**
   at `designs/block-e2e-suite/design.md` (based on the Lowdefy repo's
   `@lowdefy/block-dev-e2e` pattern), created alongside these tasks and not in
   this part's scope.
4. **`mode` lives in state (`current_action.mode`), not an `_ref` var.** Pages
   set a literal in `onMount`; the modal sets the derived value in its open
   handler; the surface gates on `_state: current_action.mode`. This removes
   the "only use `_var: mode` in runtime positions" convention an operator-
   valued var would have required — state is uniformly runtime and matches the
   existing `current_action` contract. Design D1/D5 now record this.

## Cross-cutting state notes (read before implementing any task)

These reflect the repo as of branch `workflows-module` @ `1b5ab2b` (Part 46
fully landed including tasks 11–12; Part 49 landed):

1. **Part 46 is complete.** `GetWorkflowAction` returns `allowed`, `buttons`,
   `workflow_closed`, `required_after_close`; the shared YAML stages and the
   `button_signal_sources` enum are deleted; the module ships the
   `workflows-events-timeline` wrapper component (task 8 extends it).
2. **Part 49 landed** (`request_changes` gates on any of `view`/`edit`/
   `review` via the single exported `SIGNAL_VERBS` map). No client impact —
   button visibility is the server-resolved `buttons.request_changes`
   boolean — but don't re-introduce a `review`-only claim in comments/docs.
3. **Part 24 (universal-fields) is not implemented** — the renderer is the
   invisible stub at
   `modules/workflows/components/universal-fields/universal-fields.yaml`. The
   surface passes the Part 24 contract vars (`mode`, `kind`, `state_path`,
   `action_data`) per the design; the stub ignores them until Part 24 lands.
   Field-level behaviour (editable inputs, scoped `Validate` matching inputs)
   only becomes observable then.
4. **Part 33 (comment rendering) is not implemented** — `workflow-action-view`
   still carries its Comments card. The design assumed Part 33's
   events-timeline swap happened first; it hasn't, so task 6 keeps the
   Comments card page-level below the surface, untouched. Part 33 owns the
   swap.

## Scope

**Source:** `designs/workflows-module/parts/40-simple-action-surfaces/design.md`
(as amended 2026-06-11 per "Decisions applied" above).
**Context files considered:** none — the design folder contains only
`design.md` (concept-doc reconciliation was already applied 2026-06-10; the
referenced sibling designs 46/34/38/39/42/49 and the shipped code were read as
context).
**Review files skipped:** `review/review-1.md`–`review-4.md`,
`review/consistency-1.md`, `review/consistency-2.md` (already incorporated
into the design).
