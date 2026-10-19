# Task 3: Rework `check-action-surface.yaml` onto the converged composition

## Context

`modules/workflows/components/check-action-surface.yaml` is the body of the in-context check-action modal (`components/check-action-modal.yaml` wraps it). It is the **last** action surface still on the original Part 24/40 arrangement: a hand-rolled Title + Tag header, inline editable `universal-fields.yaml` (assignees/due edited in the signal flow and written **on submit**), a status-history `List`, and no authored `description`.

Every other surface — the form pages and the workspace check page (`templates/action.yaml.njk`) — has converged onto: assignees/due as **display-only chips** (avatars + due pill + ✎) edited through a **separate modal**, the authored `description` (Part 64) as a read-only Markdown lead-in, and the shared `title-block` header. This task brings the modal body onto that same composition. **No new component files are created** — it composes existing fragments (design D2). Use `templates/action.yaml.njk` as the reference wiring for every fragment.

The reusable fragments (all already exist):

- `../shared/layout/title-block.yaml` (shared header; `modules/shared/layout/title-block.yaml`)
- `components/universal-fields/universal-fields-chips.yaml` (avatars + due pill + ✎)
- `components/universal-fields/universal-fields-modal.yaml` (nested edit modal; its `Update` calls `{workflow_type}-update-fields` and the modal self-closes on success)
- `components/action-description.yaml` (read-only Markdown lead-in; self-hides when content is null)
- `../shared/enums/action_statuses.yaml` (status enum; already referenced in this file today)

**State contract is unchanged.** The modal open handler (in `check-action-modal.yaml`) still spreads the `GetWorkflowAction` response into `current_action`, seeds `current_action.fields.{assignees,due_date}`, `current_action.comment`, `current_action.change_request_comment`, and the `current_action.stage` scalar. Do **not** touch `check-action-modal.yaml` here (Task 4 handles its comments). The chips read the **resolved** envelope values `current_action.assignee_docs` / `current_action.due_date`; the edit-modal inputs bind the **working copy** `current_action.fields.{assignees,due_date}` (already seeded by the open handler).

The component-local request `get_workflow_action` is defined on the modal container, so a `Request` action with `params: get_workflow_action` from within this surface resolves (request IDs are not file-scoped).

## Task

Rework the surface top-to-bottom. Target block order (per the design's "Modal composition after this part"):

1. `workflow_closed_banner` — **unchanged** (Alert; gated `workflow_closed` AND not `required_after_close`).
2. **NEW** `title-block` header (replaces `action_header`).
3. **NEW** `action-description.yaml` lead-in.
4. `current_action.comment` (TiptapInput) — **unchanged**.
5. `signal_button_bar` — buttons unchanged **except** drop `fields` from `progress`/`submit` payloads and drop the pre-submit `fields` Validate.
6. `request_changes_modal` — **unchanged**.
7. **NEW** `universal-fields-modal.yaml` (nested edit modal, opened by the chips ✎).

- **DELETED:** `action_header`, the inline `universal-fields/universal-fields.yaml` composition, and `status_history_card` (the whole `List` block).

### 3a. Top-level block: `Card` → `Box`

Change the surface's top-level block from `type: Card` to `type: Box` (keep `layout.gap: 16`). Rationale: the surface is modal-only; a Card mounted inside the Modal renders a bordered/padded box inside the modal's already-padded body (box-in-box). As a Box, content sits directly in the modal body. Update the file's header/surface comments that frame the layout as "the card" / "at the bottom of the card" to refer to the modal body / Box.

### 3b. Replace `action_header` with the shared `title-block`

Delete the `action_header` block (Title + status Tag, currently lines ~69–132) and replace with an `_ref` to `../shared/layout/title-block.yaml`, configured exactly as `action.yaml.njk` configures the layout `page` (status pill left, `message` as title, chips in `page_actions`) **minus the eyebrow** (`type`) and with **no subtitle** (no `description`/`doc` var). Read the `current_action.stage` **scalar** for status (D4), not `status.0.stage`:

```yaml
- _ref:
    path: ../shared/layout/title-block.yaml
    vars:
      title:
        _state: current_action.message
      status:
        _state: current_action.stage
      status_enum:
        _ref: ../shared/enums/action_statuses.yaml
      show_back_button: false
      page_actions:
        - _ref:
            path: components/universal-fields/universal-fields-chips.yaml
            vars:
              modal_id: universal_fields_edit_modal
              action_data:
                assignee_docs:
                  _state: current_action.assignee_docs
                due_date:
                  _state: current_action.due_date
```

Do **not** pass a `type` var (eyebrow omitted — the modal's host page already names the workflow, D3). Do **not** pass `description` or `doc` (no subtitle, D3).

### 3c. Add the `action-description.yaml` lead-in

Below the header, add (sourced from `current_action.description`):

```yaml
- _ref:
    path: components/action-description.yaml
    vars:
      content:
        _state: current_action.description
```

It self-hides when the authored description is null.

### 3d. Delete the inline universal-fields composition and the status-history card

- Delete the inline `_ref: components/universal-fields/universal-fields.yaml` block (currently lines ~133–170).
- Delete the entire `status_history_card` block (the `Card` + nested `List`, currently lines ~171–266).

### 3e. Mount the nested edit modal

Add the `universal-fields-modal.yaml` `_ref` (the ✎ chip opens it via `modal_id: universal_fields_edit_modal`). Its `on_complete` is the **field-edit reseed (D5): refetch `get_workflow_action` + reseed `current_action`, WITHOUT the `current_action.comment: null` / `current_action.change_request_comment: null` resets** (a field edit must not wipe an in-progress comment). The reseed otherwise mirrors the open handler's spread+seed. Author it inline:

```yaml
- _ref:
    path: components/universal-fields/universal-fields-modal.yaml
    vars:
      modal_id: universal_fields_edit_modal
      state_path: current_action.fields
      workflow_type:
        _state: current_action.workflow_type
      action_id:
        _state: current_action._id
      allowed_edit:
        _state: current_action.allowed.edit
      on_complete:
        - id: refetch_action_fields
          type: Request
          params: get_workflow_action
        - id: reseed_action_fields
          type: SetState
          params:
            current_action:
              _request: get_workflow_action
            current_action.fields:
              assignees:
                _request: get_workflow_action.assignees
              due_date:
                _request: get_workflow_action.due_date
            current_action.stage:
              _request: get_workflow_action.status.0.stage
            current_action.mode:
              # Copy the mode-derivation _if chain VERBATIM from action.yaml.njk's
              # field-edit reseed (error→view; in-review+review→review;
              # [action-required,in-progress,changes-required]+edit→edit; else view).
              ...
            entity_id:
              _request: get_workflow_action.entity.id
```

Copy the `current_action.mode` derivation `_if` chain verbatim from `action.yaml.njk`'s `reseed_action_fields` (lines ~953–984). **Critically, do NOT include** `current_action.comment: null` or `current_action.change_request_comment: null` in this reseed (D5). The `GetWorkflowAction` response carries no `comment` / `change_request_comment`, so omitting them leaves the working text untouched. The edit modal self-closes on success (appended by `universal-fields-modal.yaml`) — do not add a self-close here.

### 3f. Drop `fields` from the signal payloads and the pre-submit Validate

In `signal_button_bar`:

- `button_progress` `onClick` → `progress` CallAPI: remove the `fields: { _state: current_action.fields }` payload key.
- `button_submit` `onClick`: remove the `id: validate` `Validate` step (`regex: ^current_action\.fields\.`) entirely, and remove the `fields:` payload key from the `submit` CallAPI. The `submit` becomes the first (and only) action before the `on_complete` concat.

Leave `button_not_required`, `button_approve`, `button_resolve_error`, `button_edit`, and the `request_changes_modal` payloads as-is (they never carried `fields`). Keep each button's `on_complete` `_var` concat (it closes the outer modal after a signal — supplied by `check-action-modal.yaml`).

### 3g. Update the header comment block

In the file header / surface-convention comments: drop the status-history List pruning rationale (the List is gone). Retain the note that the `current_action.stage` **scalar** is kept as the stable stage source read by the header status pill and the error-stage comment gate (D4). Reframe "the card" references to the modal body / Box (3a).

## Acceptance Criteria

- Top-level block is `type: Box` with `layout.gap: 16`; no Card wraps the surface.
- Header is the shared `title-block` with status pill (from `current_action.stage`), `message` title, chips in `page_actions`, **no eyebrow**, **no subtitle**.
- The authored `description` renders via `action-description.yaml` and self-hides when null.
- The inline `universal-fields.yaml` block and the entire `status_history_card` are deleted.
- The `universal-fields-modal.yaml` is mounted with `modal_id: universal_fields_edit_modal`; its `on_complete` refetches + reseeds `current_action` **without** the comment resets; mode-derivation chain matches `action.yaml.njk`.
- `progress` and `submit` payloads no longer send `fields`; the `^current_action\.fields\.` Validate is gone.
- Comments reflect the Box (not card) and drop the pruning rationale while keeping the `current_action.stage` scalar note.
- `pnpm ldf:b` (from `apps/demo`) compiles with no errors.

## Files

- `modules/workflows/components/check-action-surface.yaml` — modify — full rework per 3a–3g.

## Notes

- The chips read `current_action.assignee_docs` / `current_action.due_date` (resolved envelope values), **not** `current_action.fields.*`. The edit-modal inputs bind `current_action.fields.{assignees,due_date}` (the working copy the open handler seeds). This split mirrors the workspace page.
- D3 accepted trade-offs: the page-scaled `title-block` carries its chunky status pill, large title, an empty subtitle `<div>` (small dead gap), and the `page-actions` Box's hardcoded `margin:16` into the 750px modal. These are accepted — do **not** add modal-specific vars to `title-block.yaml`. Documented fallback (only if it reads as oversized once rendered): revert D3 to a compact hand-rolled header (mockup Option A). The header is eyeballed post-implementation; no build-time validation is added.
- `universal-fields.yaml`'s `display` group is still used elsewhere (other `mode: display` consumers) — do not delete that file; only remove this surface's inline use of it.
