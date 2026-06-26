# Task 11: Template + check-surface integration (Parts 16/40 follow-on)

> **Rev 2:** the read path is `get_workflow_action` (single object — no `.0.`); the check integration point is Part 40's `check-action-surface.yaml` (one body for the modal + the `workflow-action-*` pages), not separate check pages; the component takes new vars (`workflow_type`, `show`, `action_id`, `allowed_edit`, `on_complete`).

## Context

This is the design's mandated follow-on for the template/layout work whose owning parts live in `_completed/` (16 — page templates; 40 — check-action surfaces): record deviations, do not reopen/redesign those folders.

Current state:

- **Form templates** (`modules/workflows/templates/{edit,view,review,error}.yaml.njk`) embed the universal-fields `_ref` **inline in the form body**, passing only `mode` / `kind` / `action_data` (bound to `_state.fields.*` for edit, `_state.action.*` for display — both already correct; the action doc is primed from `get_workflow_action`, a single object, in `onMount`). The design moves form-kind fields to a **right-hand sidebar card**, gated on `universal_fields` non-empty.
- **Check surface** (`modules/workflows/components/check-action-surface.yaml`, Part 40) already `_ref`s the component with `kind: check`, `state_path: current_action.fields`, derived `mode`, and `action_data` from `current_action.fields.*`. It backs the modal and the `workflow-action-{edit,view,review}` pages. It needs the remaining new vars.

Prior tasks supply everything: the real component with `show` / `workflow_type` / `action_id` / `allowed_edit` / `on_complete` vars (task 10), `action_config.universal_fields` normalized to an array on the template vars (task 7), `assignee_docs` on the `get_workflow_action` envelope (task 9). `makeActionPages.js` passes `workflow_type` and `action_config` as template vars.

## Task

1. **Form templates** — restructure the content area into a two-column row (24-col grid per `.claude/guides/page-layouts.md`: form column ~`span: 16`, sidebar ~`span: 8`; match existing two-column repo pages):
   - Remove the inline universal-fields `_ref`s (both branches in `edit/review/error` — the "first form entry owns chrome" and the Card-wrapped branch — and the single ref in `view`).
   - Add a sidebar column rendering the component, **emitted at build time iff `action_config.universal_fields` is non-empty** (`_build.if` on array length — always an array after task 7). When empty, no sidebar column; the form column spans 24.
   - Vars per surface:
     - `edit.yaml.njk`: `mode: edit`, `kind: form`, `state_path: fields`, `workflow_type: {{ workflow_type }}` (njk literal), `show: { _var: action_config.universal_fields }`, `action_id: { _state: action._id }`, `allowed_edit: { _state: action.allowed.edit }`, `action_data` bound to `_state.fields.*`, `on_complete:` a Request refetch of `get_workflow_action` (keeps the displayed doc + status-map fresh after Update).
     - `view/review/error.yaml.njk`: `mode: display`, `kind: form`, `state_path: fields`, `show: { _var: action_config.universal_fields }`, `action_data` with `assignees/due_date/description` from `_state: action.*` (already primed in `onMount` from `get_workflow_action`) **plus** `assignee_docs: { _state: action.assignee_docs }`. No `action_id` / `allowed_edit` / `workflow_type` needed in display mode.
   - Do **not** touch the submit/progress button payloads or the submit `Validate` regex — Part 39 already landed that hygiene (submit is `^form\.`, no `fields` payload).
2. **Check surface** (`modules/workflows/components/check-action-surface.yaml`) — extend the existing universal-fields `_ref` (around `:131-150`) to pass the remaining vars:
   - `show: { _var: action_config.universal_fields }` — **but** the surface is `_ref`'d generically by the modal/pages; confirm `action_config` is in scope there. If it is not threaded into the surface, pass `show` from the surface's container (the page/modal that knows the action config) or default to all three (the design pins "no behavioural change" for check as a floor). Resolve which at build — do not leave the surface referencing an undefined var.
   - `workflow_type: { _state: current_action.workflow_type }` (the envelope ships it), `action_id: { _state: current_action._id }`, `allowed_edit: { _state: current_action.allowed.edit }`, `on_complete: { _var: on_complete }` (thread the surface's existing `on_complete` so Update refreshes like the signal buttons do).
   - The surface's `submit`/`progress` payloads already carry `fields: { _state: current_action.fields }` — unchanged (check writes fields on transition; matches the kind guard).
3. **Deviation notes** — add a one-paragraph note at the top of `_completed/16-page-templates/design.md` and `_completed/40-simple-action-surfaces/design.md` recording the Part 24 layout/var deviation and pointing here (notes are allowed; reopening/redesigning is not).

## Acceptance Criteria

- `apps/demo` builds clean (`pnpm ldf:b`) with zero universal-fields refs left inline in the form bodies.
- Form edit page (demo): sidebar card right of the form; changing the assignee + Update writes the doc and the entity-page status-map cell shows the new assignee, without touching form data or stage; a `done` action's sidebar still edits.
- Form action with `universal_fields: false` (add/adjust one demo fixture action): no sidebar, form body spans full width.
- View/review/error pages: read-only sidebar card with avatars, formatted date, rich-text description, placeholders when empty.
- Check surface (modal + pages): fields render as primary content; `submit` persists them as before; the standalone Update button writes them without a transition (e.g. on a `done` action flipped to edit mode via `button_edit`).

## Files

- `modules/workflows/templates/edit.yaml.njk` — modify — two-column layout, sidebar ref with full edit vars, remove inline band.
- `modules/workflows/templates/view.yaml.njk` — modify — display sidebar.
- `modules/workflows/templates/review.yaml.njk` — modify — display sidebar.
- `modules/workflows/templates/error.yaml.njk` — modify — display sidebar (both branches).
- `modules/workflows/components/check-action-surface.yaml` — modify — pass `show` / `workflow_type` / `action_id` / `allowed_edit` / `on_complete` to the universal-fields ref.
- `designs/workflows-module/parts/_completed/16-page-templates/design.md` — modify — deviation note.
- `designs/workflows-module/parts/_completed/40-simple-action-surfaces/design.md` — modify — deviation note.

## Notes

- The read path is the single-object `get_workflow_action` envelope (`GetWorkflowAction` handler) — bind `_state.action.*` (form) / `_state.current_action.*` (check). **Never** `get_workflow_action.0.*` or `get_action.*` (the old aggregation array is gone — the Rev-1 `.0.` instruction is dropped).
- Reviewers who need to change metadata use the edit page's sidebar — do NOT add an edit-mode sidebar to the review template (design's placement table is explicit). On the check surface, `button_edit` already provides the read-only→edit flip.
- The error template has two universal-fields refs (two layout branches) — both move to the sidebar pattern.
- End-to-end coverage is deferred to Part 22's e2e suite; this task's verification is build + manual demo-app checks.
