# Task 8: Create the per-workflow check page template

## Context

Part 56 (D3) replaces the three retired shared check pages with a **single
per-workflow** check page, `{workflow_type}-check`. It is a layout page that
loads the action by `?action_id`, derives its mode, and recomposes the check
surface across the three-tier shell (Task 6). `makeActionPages` will emit it
(Task 10) as a `_ref` to this template.

Building blocks now available:

- The three-tier shell `action-workspace.yaml` (Task 6) with slots `middle`,
  `universal_fields`, `details_slot`, and baked `entity_collection` /
  `reference_field`; columns gated on `_state.entity_id`.
- The split check-surface leaves (Task 5): signal-button bar (+ Request Changes
  modal), comment input, status-history list, and the shared mode-derivation.
- The breadcrumb fragment `action-breadcrumbs.yaml` (Task 7).
- The Part 24 `universal-fields` component (composed by the caller).
- The canonical mode-derivation + response-derived `SetState` pattern proven by
  `check-action-modal.yaml:50–64,98–146`.

## Task

Create `modules/workflows/templates/check.yaml.njk` — a `module: layout,
component: page` page. Build-time vars passed by `makeActionPages` (Task 10):
`workflow_type`, `entity_collection` (from `workflow.entity.collection`),
`reference_field` (from `workflow.entity.ref_key`), `workflow_title`, and
`entity_view_slot` (the baked `entity_view.slot` block array; may be empty).

**Request + onMount (mode derivation — D3).**

- Define the page's `get_workflow_action` request (URL-bound to `?action_id`),
  as the retired shared pages did.
- In `onMount`: presence-guard `action_id`; fetch the action; then in **one
  response-derived `SetState`** spread the response into `current_action`, seed
  the working inputs (`current_action.fields.*`, `.comment`, `.change_request_comment`),
  set the stable `current_action.stage` scalar, **and** derive
  `current_action.mode` — all from the **response** (`_request:
  get_workflow_action.*`), not `_state` — exactly as `check-action-modal.yaml`
  does. Splitting the writes would prune `current_action.status`; do not split.
- In that same `SetState` (or the onMount sequence), set the normalized
  `_state.entity_id` from the response (`_request: get_workflow_action.entity_id`).

**Header (layout-page vars, sourced from `_state.current_action.*`).**

- `breadcrumbs`: `_ref` `action-breadcrumbs.yaml` with `entity_link:
  _state.current_action.entity_link`, `workflow_id:
  _state.current_action.workflow_id`, `workflow_title: <baked>`, `action_label:
  <baked action title>`.
- `type`: the baked `workflow_title` (eyebrow).
- `title` / `status` (`_state.current_action.status.0.stage`) / `status_enum`
  (`action_statuses`) as the shared pages wired them.
- `description`: `_state.current_action.message` (the new subtitle var, Task 1).
- Full content-width (no `content_width: 750`); `show_back_button: true`.

**Body = the shell (Task 6).**

- `middle` = `entity_view_slot` (the review subject) + the comment input + the
  signal-button bar (the split leaves from Task 5).
- `universal_fields` = the Part 24 `universal-fields` component with
  `kind: check`, `state_path: current_action.fields`, `current_action.*` data,
  `workflow_type: _state.current_action.workflow_type`.
- `details_slot` = **empty** (the slot is in the middle on check — D7).
- `entity_collection` (baked), `reference_field` (baked).

## Acceptance Criteria

- Opening `{workflow_type}-check?action_id=…` loads the action and derives the
  correct mode per stage/allowed — parity with `check-action-modal` (stage
  `error` → view; `in-review` + `allowed.review` → review; editable stages +
  `allowed.edit` → edit; else view).
- Renders three columns: middle = slot + comment + signal buttons; RHS =
  universal-fields card + History (no Details tab); left = the entity's
  workflows.
- `_state.entity_id` is set from the response, so the shell's columns mount after
  the action loads.
- Signal buttons fire the same `{workflow_type}-submit` payloads as the modal
  surface; Request Changes modal behaves as before.
- `pnpm ldf:b` compiles once Task 10 emits the page (or a temporary fixture
  wiring it).

## Files

- `modules/workflows/templates/check.yaml.njk` — create — the per-workflow check page.

## Notes

- This template is the URL-bound `get_workflow_action` page that **replaces** the
  retired shared pages as the "never drop the modal here" surface — Task 11
  re-points the stale comments to it.
- The in-context `check-action-modal` is untouched; this page deliberately drops
  **no** modal, so a left-panel check-row click degrades to navigation (D4).
- Mode must derive from the response in the same `SetState` as the spread — this
  is load-bearing (see `check-action-modal.yaml` header). Reuse the shared
  mode-derivation fragment from Task 5 if extracted.
