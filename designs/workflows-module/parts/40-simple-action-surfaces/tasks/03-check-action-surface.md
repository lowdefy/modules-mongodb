# Task 3: New shared `check-action-surface` component

## Context

The body of a check action — workflow-closed banner, header, universal fields,
status history, comment, and the signal button bar — becomes **one** component
that the three shared pages (tasks 4–6) and the in-context modal (task 7) all
`_ref`. One body, two containers (design D1).

The `GetWorkflowAction` engine method (Part 46, shipped — see
`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`)
returns the action doc plus server-resolved
`allowed` (`{ view, edit, review, error }`),
`buttons` (`{ submit, progress, not_required, approve, request_changes, resolve_error }`
booleans — FSM source-stage ∧ per-verb role gate ∧ `allow_not_required`,
AND-ed server-side), `workflow_closed`, and `required_after_close`. The
surface computes **no** visibility client-side — each button reads its single
resolved boolean (design D2). There is no `button_signal_sources` `_ref` and
no `action_role_check`.

**State contract (design D1).** The surface reads exclusively from
`_state.current_action`. The container (page `onMount` / modal open handler)
spreads the `GetWorkflowAction` response into `current_action` and seeds the
working inputs:

- response fields at the top: `current_action._id`, `.key`, `.type`,
  `.status` (array, `status.0.stage` = current stage), `.message`, `.allowed`,
  `.buttons`, `.workflow_closed`, `.required_after_close`, …
- working inputs on sub-keys: `current_action.fields.{assignees, due_date,
  description}` (seeded from the response) and `current_action.comment`
  (seeded `null`).

**Existing reference material** (the bodies being absorbed):

- `modules/workflows/pages/workflow-action-edit.yaml` — banner (`:81–93`),
  universal-fields `_ref` (`:94–105`), comment (`:142–146`), submit button +
  payload (`:147–192`).
- `modules/workflows/pages/workflow-action-view.yaml` — header + status Tag
  with enum styling (`:60–115`), status-history List (`:128–195`).
- `modules/workflows/pages/workflow-action-review.yaml` — Request Changes /
  Approve buttons (`:130–187`), `request_changes_modal` (`:188–234`).
- `modules/workflows/templates/edit.yaml.njk:182–332` — the form-template
  button bar this surface's bar mirrors (titles, ordering, signal payloads).

## Task

Create `modules/workflows/components/check-action-surface.yaml`.

### Vars

- `mode` — `edit` | `view` | `review`. May arrive as a **literal string**
  (pages) or as a **runtime operator** (the modal derives mode from the
  fetched action). Therefore use `_var: mode` **only inside runtime operator
  positions** — e.g. `visible: { _eq: [{ _var: mode }, edit] }` — never in
  `_build.*` operators or structural config.
- `on_complete` — optional array of actions appended after each signal
  button's `CallAPI` (default `[]`). Compose with
  `_build.array.concat: [[ <validate/callapi actions> ], { _var: { key: on_complete, default: [] } }]`
  (the same pattern the form template uses at `edit.yaml.njk:218–226`).
  Pages pass nothing; the modal passes its refetch + close sequence (task 7).

### Blocks (top-level `Card`, `layout.gap: 16`, mirroring the pages' `action_card`)

1. **Workflow-closed banner** — `Alert` (warning, showIcon), visible when
   `current_action.workflow_closed` and `current_action.required_after_close`
   is not `true`. Rendered in **all modes** (copy the message/description from
   `workflow-action-edit.yaml:81–93`). *Minor normalisation:* the shipped view
   page has no banner; rendering it read-only is informative and keeps one
   body — note it in the component header comment.
2. **Header** — `Box` with `Title` (`_state: current_action.message`) +
   status `Tag` styled from the `action_statuses` enum
   (`_ref: ../shared/enums/action_statuses.yaml`, same `_js` lookups as
   `workflow-action-view.yaml:72–115`, reading
   `_state: current_action.status.0.stage`). Visible in `view` and `review`
   modes only (D1 table — edit has no header today).
3. **Universal fields** — `_ref` the Part 24 component:

   ```yaml
   - _ref:
       path: components/universal-fields/universal-fields.yaml
       vars:
         kind: check
         state_path: current_action.fields
         mode:
           _if:
             test:
               _eq:
                 - _state: current_action.allowed.edit
                 - true
             then: edit
             else: display
         action_data:
           assignees:
             _state: current_action.fields.assignees
           due_date:
             _state: current_action.fields.due_date
           description:
             _state: current_action.fields.description
   ```

   Editability is **edit-verb-gated, not mode-gated** (design D1): an
   `edit`-verb user gets editable fields on every surface mode (so Part 24's
   Update operation is reachable from the always-available view page); a pure
   viewer gets read-only display. The component is currently the Part 24 stub
   — it ignores these vars until Part 24 ships; pass them anyway (the
   contract is recorded on both designs).
4. **Status history** — `view` mode only. A `List` with
   `id: current_action.status` (Lists bind state at their block id; the
   spread response already holds the status array there — **no request, no
   extra SetState**). Rows mirror `workflow-action-view.yaml:135–195` (status
   `Tag` via the enum, `_dayjs.format` timestamp, conditional
   `error_message` paragraph), with item paths `current_action.status.$.…`.
5. **Comment** — `TiptapInput`, `id: current_action.comment`. Visible in
   `edit` and `review` modes always; in `view` mode **only when stage is
   `error`** (the `resolve_error` recovery note — D1 table).
6. **Signal button bar** — a right-aligned in-flow `Box` of `Button`s at the
   bottom of the card (the surface renders inside a modal too, so no
   layout-module `floating-actions` — note this deviation from the shipped
   pages in the component header comment). Every button:
   - `visible`: `_and` of the mode gate
     (`_eq: [{ _var: mode }, <mode>]`) and the server-resolved boolean
     `_state: current_action.buttons.{signal}` — nothing else (D2).
   - `disabled`: `_and: [{ _state: current_action.workflow_closed }, { _ne: [{ _state: current_action.required_after_close }, true] }]`
     (the `required_after_close` gate, uniform across all signal buttons).
   - `CallAPI` endpoint (runtime — see tasks.md note 4):

     ```yaml
     endpointId:
       _string.concat:
         - _module.id: true
         - /update-action-
         - _state: current_action.type
     ```

   - Base payload, identical for every signal (D1):

     ```yaml
     payload:
       action_id:
         _state: current_action._id
       signal: <signal>
       current_key:
         _state: current_action.key
       comment:
         _state: current_action.comment
     ```

     **Only `submit` and `progress` add**
     `fields: { _state: current_action.fields }` — the other four signals must
     NOT carry `fields` (they'd silently revert a concurrent editor's change;
     design D1 "fields rides submit and progress only").

   | Button (id)              | Mode   | Title             | Type            | onClick                                                                                                          |
   | ------------------------ | ------ | ----------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
   | `button_submit`          | edit   | Submit            | primary         | `Validate` (`params: { regex: ^current_action\.fields\. }`) → `CallAPI` `signal: submit` (+ `fields`) → on_complete |
   | `button_progress`        | edit   | Mark Started      | default         | `CallAPI` `signal: progress` (+ `fields`) → on_complete — **no Validate** (draft is intentionally partial)         |
   | `button_not_required`    | edit   | Mark Not Required | default         | `CallAPI` `signal: not_required` → on_complete                                                                     |
   | `button_request_changes` | review | Request Changes   | default, danger ghost | `CallMethod` open `request_changes_modal`                                                                    |
   | `button_approve`         | review | Approve           | primary         | `CallAPI` `signal: approve` → on_complete                                                                          |
   | `button_resolve_error`   | view   | Resolve Error     | primary         | `CallAPI` `signal: resolve_error` → on_complete                                                                    |

   The `Validate` scope `^current_action\.fields\.` matters: the surface also
   renders inside the modal on entity pages, where an unscoped `Validate`
   would validate the entire host page (design D1). No `Validate` on any
   other signal except the modal's comment check below.
7. **`request_changes_modal`** — a `Modal` block inside the surface (review
   mode), migrated from `workflow-action-review.yaml:188–234` with the state
   namespaced: the required comment `TiptapInput` binds
   `current_action.comment` (validate non-null), `onOk` runs
   `Validate` scoped to the comment (`regex: ^current_action\.comment$`) →
   `CallAPI` `signal: request_changes` (base payload, no `fields`) →
   on_complete; `onClose` resets `current_action.comment: null`. Gate its
   rendering on review mode (`visible`/mode condition) so the fixed blockId
   exists only where used.

### What must NOT appear

No status `Selector`, no `interaction:` / `current_status` / `target_status`
payload keys, no `_js` visibility/priority lookups for buttons, no
`button_signal_sources` `_ref`, no `action_role_check`, no `form` /
`form_review` payload keys, no per-action button config.

## Acceptance Criteria

- The component reads **only** `_state.current_action.*` (plus `_var: mode` /
  `on_complete` and the `action_statuses` enum `_ref`); grep confirms no
  `_request:` reads inside the file.
- All six signal buttons exist with `visible` = mode gate ∧
  `current_action.buttons.{signal}`, and payloads match the D1 contract
  (`fields` on `submit`/`progress` only; `comment` on every signal).
- `Validate` appears exactly twice: scoped `^current_action\.fields\.` on
  submit, and the request-changes comment check.
- `_var: mode` appears only inside runtime operators.
- The demo app builds (`apps/demo`) once a consumer references the component
  (full verification lands with task 4; a temporary scratch `_ref` is fine to
  smoke-test the build during development but must not be committed).

## Files

- `modules/workflows/components/check-action-surface.yaml` — create — the shared body described above

## Notes

- Do **not** register the component in `module.lowdefy.yaml` — it is consumed
  via path `_ref` by sibling pages/components (same as `universal-fields`);
  only the modal (task 7) is exported.
- Component file naming: this repo's workflows module uses kebab-case for
  page-like component files (`actions-on-entity.yaml`,
  `entity-workflows-refetch.yaml`) — `check-action-surface.yaml` follows.
- Header comment should record: the `current_action` state contract (what the
  container must populate), the two container types, the banner-in-view and
  in-flow-buttons normalisations, and that `mode` must stay
  runtime-operator-only.
