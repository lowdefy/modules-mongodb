# Task 9: Reshape the four form templates to use the three-tier shell

## Context

The form action pages are `modules/workflows/templates/{view,edit,review,error}.yaml.njk`,
each a `module: layout, component: page`. Today each renders a single centred
column (`content_width: 750`): a two-column content row (form body + a read-only
universal-fields **sidebar**), a floating-actions button bar, optional confirm
modals, and an **Activity** card (`events` module `events-timeline`,
`reference_field: action_ids`, `reference_value: _state.action._id`) at the
bottom.

Part 56 wraps these in the shared shell (Task 6) so entity context sits alongside
the form. Available pieces: the shell `action-workspace.yaml` (Task 6), the
breadcrumb fragment `action-breadcrumbs.yaml` (Task 7), and the `description`
subtitle var on `title-block` (Task 1). The new build-time vars these templates
consume are supplied by `makeActionPages` in Task 10: `workflow_title`,
`reference_field` (from `workflow.entity.ref_key`), and `entity_view_slot` (baked
`entity_view.slot`; may be empty) — alongside the existing `entity_collection`
(now sourced from `workflow.entity.collection` — Part 57),
`workflow_type`, `action_config`, `page_config`, `page_ids`.

## Task

For **all four** form templates:

1. **Widen the page to full content-width.** Remove the `content_width: 750`
   default (drop the `page_config.maxWidth` default of 750, or set it to full
   width); the title bar + columns span the page.

2. **Header — layout-page vars (D8).** Add:
   - `breadcrumbs`: `_ref` `action-breadcrumbs.yaml` with `entity_link:
     _state.action.entity_link`, `workflow_id: _state.action.workflow_id`,
     `workflow_title: <baked>`, `action_label: <baked action title>` (the value
     already in `page_config.title`).
   - `type`: the baked `workflow_title` (eyebrow).
   - `description`: `_state.action.message`.
   - Keep the existing `title` (`page_config.title`) / `status`
     (`_state.action.status.0.stage`) / `status_enum` / `show_back_button`
     wiring.

3. **Set the normalized `_state.entity_id` in onMount** (from the loaded
   response, beside the existing `set_action` `SetState` — e.g. `entity_id:
   _state.action.entity_id` or `_request: get_workflow_action.entity_id`). This
   is the single scalar the shell's columns read.

4. **Body = the shell.** Replace the bare two-column content row + Activity card
   with `action-workspace.yaml`:
   - `middle` = the existing form body (the form `Card` + comment +
     `page_config.formHeader`/`formFooter`, and — for `edit` — the
     outer-card-suppression branch). Keep the floating-actions button bar and the
     confirm/Request-Changes modals as they are (page-level chrome, outside the
     columns).
   - `universal_fields` = the Part 24 `universal-fields` component composed with
     the page's kind-specific vars (`kind: form`, `state_path: fields`,
     `action.*` data, the existing `mode`/`show`/`on_complete` each template
     already passes) — **moved out of the old sidebar column into the shell's RHS
     slot**.
   - `details_slot` = `entity_view_slot` (renders as the RHS **Details** tab;
     omitted when empty).
   - `entity_collection` (baked), `reference_field` (baked, from
     `workflow.entity.ref_key`).
   - **Remove the bottom Activity card** — History now lives in the shell's RHS
     History tab (sourced from the baked `reference_field`/`entity_id`, entity-scoped).

Per-template specifics are preserved: `view` (read-only + Edit/request-changes
floating bar, no stale-URL guard), `edit` (writable + stale-URL guard +
outer-card suppression on `form[0].form`), `review` (read-only main + writable
`form_review` + Approve/Request Changes), `error` (recovery, `form_error`,
`resolve_error`). Only the **layout wrapping** and the **universal-fields/History
placement** change — the form bodies, submit handlers, modals, and guards keep
their existing behaviour.

## Acceptance Criteria

- Each form page renders three columns: middle = the form body + buttons; RHS =
  universal-fields card + Details/History tabs; left = the entity's workflows.
- Universal fields render in the **RHS** (not an inline sidebar); read/written via
  Part 24's `state_path: fields`.
- `entity_view_slot` (when present) renders as the RHS Details tab; when empty,
  History is the sole RHS tab.
- The header shows breadcrumb + eyebrow (workflow title) + action title + status
  pill + `message` subtitle, full content-width above the columns.
- `_state.entity_id` is set in onMount; columns mount after the action loads.
- Submit / progress / request-changes / not-required handlers and the stale-URL
  guards behave exactly as before.
- `pnpm ldf:b` compiles cleanly (vars not yet passed by makeActionPages default
  to null/empty until Task 10).

## Files

- `modules/workflows/templates/view.yaml.njk` — modify — wrap in shell; header vars; entity_id; RHS universal-fields + Details/History; drop Activity card; full width.
- `modules/workflows/templates/edit.yaml.njk` — modify — same; preserve stale-URL guard + outer-card suppression.
- `modules/workflows/templates/review.yaml.njk` — modify — same; preserve review buttons + form_review.
- `modules/workflows/templates/error.yaml.njk` — modify — same; preserve recovery flow + form_error.

## Notes

- The form body stays the form body — do **not** move signal logic in; check-style
  recomposition is the check page's job (Task 8). Form pages keep their
  floating-actions submit bar.
- `details_slot` is form-only as a Details tab (D7); the check page puts the slot
  in the middle.
- These templates can be authored before Task 10; the new `_var` reads should use
  sensible defaults (null/empty) so the build is green in the interim.
