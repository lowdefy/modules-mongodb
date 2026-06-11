# Task 4: Rewrite `workflow-action-edit` onto the surface (`mode: edit`)

## Context

`modules/workflows/pages/workflow-action-edit.yaml` is the last surface still
running the v0 interaction model: a status `Selector` with a `_js` priority
filter (`:120–141`), a "No transitions available" `Alert` (`:109–119`), and a
single Save button firing `interaction: submit_edit` with a
`current_status: { _state: status }` payload (`:147–192`). The engine moved to
signals + FSM (Part 38): the `update-action-{type}` endpoint accepts `signal`
and rejects `interaction`/`current_status`.

Task 3 created `components/check-action-surface.yaml`, which carries the
entire body (banner, universal fields, comment, signal buttons
`submit`/`progress`/`not_required`) and reads `_state.current_action.*`. This
task makes the page a thin container: guard → fetch → populate state → `_ref`
the surface.

What the page **keeps** (design D6): the `action_id` presence guard, the
`get_workflow_action` request (`requests/get_workflow_action.yaml`, routed to
the `GetWorkflowAction` engine method), and the stale-URL guard with allowlist
`[action-required, in-progress, changes-required]` (unchanged for edit).

## Task

Rewrite `modules/workflows/pages/workflow-action-edit.yaml`:

1. **`onMount`** becomes:
   - `redirect_no_action` — unchanged (`:21–28`).
   - `get_action` `Request` — unchanged (`:30–32`).
   - `redirect_stale_status` — unchanged, including the
     `_input: skip_status_redirect` escape (`:34–50`); it reads
     `_request: get_workflow_action.status.0.stage`, which is valid before any
     SetState.
   - Replace `prime_form_state` (`:56–68`) with the `current_action`
     population convention (shared verbatim with tasks 5 and 6):

     ```yaml
     - id: set_current_action
       type: SetState
       params:
         current_action:
           _request: get_workflow_action
     - id: seed_working_state
       type: SetState
       params:
         current_action.fields:
           assignees:
             _request: get_workflow_action.assignees
           due_date:
             _request: get_workflow_action.due_date
           description:
             _request: get_workflow_action.description
         current_action.comment: null
     ```

     No `status:` state key — the selector is gone.
2. **Body** — replace everything (`action_card` `:73–146` and the
   `floating-actions` `_ref` `:147–192`) with a single `_ref`:

   ```yaml
   blocks:
     - _ref:
         path: components/check-action-surface.yaml
         vars:
           mode: edit
   ```

3. **Deletions to verify gone** (grep the file): the status `Selector` and
   its `_js` priority filter, the `status_no_transitions` `Alert`,
   `interaction:`, `current_status`, `target_status`, the `^status$`
   `Validate` regex, the page-level `floating-actions` wrapper, and the
   inline workflow-closed banner / universal-fields / comment blocks (all now
   inside the surface).
4. **Header comment** — update the file's top comment (still says "Carries
   the status selector with priority filter…", `:1–8`): it now describes the
   thin container + surface `_ref` and the signal model, and drops the
   universal-fields path-stub note if Part 24 is referenced via the surface
   now.

## Acceptance Criteria

- The page contains no `Selector`, no `interaction:`, no `current_status`,
  and no button definitions — `grep -E "interaction|current_status|Selector"` is empty.
- `onMount` is exactly: guard → request → stale guard → `set_current_action`
  → `seed_working_state`.
- The rendered page (edit mode, `edit`-verb user, stage `action-required`)
  shows Submit / Mark Started — and Mark Not Required only when the server
  resolves `buttons.not_required: true` — all driven by the surface.
- `pnpm --filter @lowdefy/modules-demo …` demo build succeeds (the build
  resolves the new `_ref` chain; run the demo app's lowdefy build).

## Files

- `modules/workflows/pages/workflow-action-edit.yaml` — modify — thin container per above

## Notes

- The stale-URL allowlist intentionally still contains `changes-required` —
  a check action sent back by `request_changes` re-enters the edit page.
- The submit signal carries no target: the engine resolves `in-review` vs
  `done` from the action's `review` verb (design item 1) — nothing on the
  page encodes that.
