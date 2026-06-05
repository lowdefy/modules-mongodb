# Task 6: Add the action-filtered events timeline to all four form-kind templates

## Context

The four generated form-page templates — `modules/workflows/templates/{edit,view,review,error}.yaml.njk` — have **no comment surface at all** (verified: zero comment-rendering matches), yet form actions capture the one *mandatory* comment: `request_changes` on the review surface (`review.yaml.njk`, TiptapInput `id: comment`, required). With the engine writing comments into `display.{app_name}.description` (tasks 1–4), a form review comment would render on the entity-page timeline but nowhere on the action's own pages. Design D6: add the same action-filtered `events-timeline` `_ref` that task 5 installs on the simple view page to **every** generated form page.

Template structure (relevant bits):

- All four set `_state.action` from the loaded action in onMount step 2 (`set_action` → `action: { _request: get_action.0 }`), so `_state: action._id` is the action id on every form page.
- `view.yaml.njk` — page `blocks:` is a plain YAML list with one entry (`form_card`).
- `edit.yaml.njk` / `review.yaml.njk` / `error.yaml.njk` — page `blocks:` is a `_build.array.concat:` of list segments (the outer-card-suppression `_build.if` chrome, buttons, then modal blocks).

The shared component and its vars are described in task 5 (`modules/events/components/events-timeline.yaml`; `reference_field` / `reference_value`).

## Task

Add to each of the four templates, at the **top page-blocks level** (a sibling card after the existing content/modals — not inside the form card, so it renders regardless of the outer-chrome branch):

```yaml
- id: activity_card
  type: Card
  properties:
    title: Activity
  blocks:
    - _ref:
        module: events
        component: events-timeline
        vars:
          reference_field: action_ids
          reference_value:
            _state: action._id
```

Concretely:

- **`view.yaml.njk`** — append `activity_card` to the plain `blocks:` list after `form_card`.
- **`edit.yaml.njk`, `review.yaml.njk`, `error.yaml.njk`** — append a new one-element list segment (`- - id: activity_card …`) as the final entry of the page-level `_build.array.concat:`, after the modal blocks. (Modals don't render visibly in place, so the card visually follows the form content and buttons.)

The block is identical across all four — plain YAML with no Nunjucks vars needed (`_state: action._id` is runtime, not build-time).

## Acceptance Criteria

- All four templates contain the `activity_card` + `events-timeline` `_ref` with `reference_field: action_ids` and `reference_value: { _state: action._id }`.
- The addition sits at the page-blocks level in every template — in `edit`/`review`/`error` it must be outside the outer-card-suppression `_build.if` (renders on both branches).
- `grep -c "events-timeline" modules/workflows/templates/*.njk` → 1 per file.
- No other template content changes (Part 39 amends the same files for button work; keep this diff purely additive so the two stay order-independent).

## Files

- `modules/workflows/templates/view.yaml.njk` — modify — append `activity_card`.
- `modules/workflows/templates/edit.yaml.njk` — modify — append `activity_card` segment to the blocks `_build.array.concat`.
- `modules/workflows/templates/review.yaml.njk` — modify — same.
- `modules/workflows/templates/error.yaml.njk` — modify — same.

## Notes

- Same config prerequisite as task 5: `events.display_key` must equal `workflows.app_name` in the consuming app or the timeline renders empty (standing invariant; demo wiring rides Part 45).
- Integration check (when a demo app is available — Part 45): submit `request_changes` with a review comment → all four generated pages for that action render the timeline with the comment HTML inline under the auto-title; E2E coverage lands in Part 22.
- Part 42's D6 later suppresses the self-referential action card on these timelines — out of scope here.
