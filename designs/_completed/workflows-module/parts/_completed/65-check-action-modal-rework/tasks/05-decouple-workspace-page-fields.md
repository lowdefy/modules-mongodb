# Task 5: Decouple universal fields from submit on the workspace check page

## Context

`modules/workflows/templates/action.yaml.njk` is the per-workflow `{workflow_type}-action` workspace page (the canonical check-action surface; the modal is the in-context shortcut). It already converged onto the chips + edit-modal + authored-description + shared `title-block` composition. Two coupling points remain, matching the design's D1 and D5:

1. Its `progress` and `submit` signal buttons still send `fields: { _state: current_action.fields }` on the transition, and `submit` runs a pre-submit `Validate { regex: ^current_action\.fields\. }`. Per D1 a user submit must not write universal fields — drop both. (The engine source gate from Task 1 already strips them, but the surface should not send pointless payload either; this is the same drop Task 3 applies to the modal surface.)
2. Its **field-edit** reseed (the `universal-fields-modal.yaml` `Update` `on_complete`, `reseed_action_fields`) clears `current_action.comment` / `current_action.change_request_comment` — wiping an in-progress reviewer comment when someone opens ✎ to fix a due date mid-review. Per D5 a field edit is not a submission, so the comment must survive it.

The **post-signal** reseeds (`reseed_action_progress`, `reseed_action_submit`, `reseed_action_not_required`, `reseed_action_approve`, `reseed_action_resolve_error`, and the request-changes modal's `reseed_action_request_changes`) **keep** their comment resets — the transition consumed the comment there.

## Task

### 5a. Drop `fields` from the `progress` and `submit` payloads

- In the `button_progress` `onClick` → `progress` CallAPI (around lines 459–477): remove the `fields: { _state: current_action.fields }` payload key.
- In the `button_submit` `onClick` (around lines 638–661): remove the `id: validate` `Validate` step (`regex: ^current_action\.fields\.`) entirely, and remove the `fields:` payload key from the `submit` CallAPI so `submit` is the first step before the refetch+reseed.

Leave `not_required`, `approve`, `resolve_error`, and the request-changes payloads unchanged (they never sent `fields`).

### 5b. Drop the comment resets from the field-edit reseed only

In the `universal-fields-modal.yaml` `_ref` at the bottom of the page (the `on_complete`'s `reseed_action_fields` SetState, around lines 939–986): remove these two lines:

```yaml
current_action.comment: null
current_action.change_request_comment: null
```

Leave everything else in that reseed (`current_action` spread, `current_action.fields`, `current_action.stage`, `current_action.mode` derivation, `entity_id`) intact.

**Do not** remove the comment resets from any **post-signal** reseed (`reseed_action_progress` / `_submit` / `_not_required` / `_approve` / `_resolve_error` / `_request_changes`). Those keep `current_action.comment: null` and `current_action.change_request_comment: null`.

## Acceptance Criteria

- `progress` and `submit` payloads no longer include `fields`; the `^current_action\.fields\.` `Validate` before `submit` is removed.
- The field-edit reseed (`reseed_action_fields`) no longer writes `current_action.comment: null` / `current_action.change_request_comment: null`; its other writes are unchanged.
- All post-signal reseeds still write both comment resets.
- No other change to the page (header/chips/description already converged).
- `pnpm ldf:b` (from `apps/demo`) compiles.

## Files

- `modules/workflows/templates/action.yaml.njk` — modify — drop `fields` from `progress`/`submit` payloads + the fields Validate (5a); drop comment resets from the field-edit reseed only (5b).

## Notes

- Independent of Tasks 3/4 (different file). Order-independent with the engine tasks: with the Task 1 source gate in place, a check user submit sends nothing the engine writes, and dropping the payload here removes the now-pointless data — either order is correct.
- D5 keeps "one correct way" across both check surfaces: field-edit reseeds preserve comments (here and in the modal surface from Task 3); signal reseeds clear them.
