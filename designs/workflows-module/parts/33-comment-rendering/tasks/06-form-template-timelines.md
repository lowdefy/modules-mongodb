# Task 6: Add the action-filtered events timeline to all four form-kind templates

## Context

The four generated form-page templates — `modules/workflows/templates/{edit,view,review,error}.yaml.njk` — have **no comment-rendering surface at all**, yet form actions capture the one *mandatory* comment: `request_changes` on the review template (`review.yaml.njk:380`, TiptapInput `id: change_request_comment`, `required: true`, in the Request Changes modal). With the engine writing comments into `display.{app_name}.description` (tasks 1–4), a form review comment would render on the entity-page timeline but nowhere on the action's own pages. Design D6: add the same action-filtered `events-timeline` `_ref` that task 5 installs on the check view page to **every** generated form page.

Template structure (relevant bits, post-Part-46):

- All four set `_state.action` from the loaded action in onMount step 2 (`set_action` → `action: { _request: get_workflow_action }` — a **single object**, no `.0`; Part 46 renamed `get_action` and changed it from an array to a curated object), so `_state: action._id` is the action id on every form page.
- `view.yaml.njk` — page `blocks:` is a `_build.array.concat:` whose first segment carries `action_content_row` (form column + sidebar column).
- `edit.yaml.njk` / `review.yaml.njk` / `error.yaml.njk` — page `blocks:` is a `_build.array.concat:` of list segments (the content row, buttons, then modal blocks).

The component and its vars are described in task 5 (`modules/events/components/events-timeline.yaml` — the events module's **events-only** generic timeline, not `workflows-events-timeline`; `reference_field` / `reference_value`).

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

Concretely — all four templates use a page-level `_build.array.concat:` for `blocks:`, so the move is the same in each: append a new one-element list segment (`- - id: activity_card …`) as the **final** entry of the page-level `_build.array.concat:`, after the content row, buttons, and any modal blocks. (Modals don't render visibly in place, so the card visually follows the form content and buttons.)

The block is identical across all four — plain YAML with no Nunjucks vars needed (`_state: action._id` is runtime, not build-time).

## Acceptance Criteria

- All four templates contain the `activity_card` + `events-timeline` `_ref` with `reference_field: action_ids` and `reference_value: { _state: action._id }`.
- The addition sits at the **page-blocks** level (final segment of the page-level `_build.array.concat:`) in every template, so it renders regardless of any inner content branching.
- `grep -c "events-timeline" modules/workflows/templates/*.njk` → 1 per file.
- No other template content changes — keep this diff purely additive (Part 39's button work on these files has shipped; don't disturb it).
- `pnpm ldf:b` (demo app build) succeeds.

## Files

- `modules/workflows/templates/view.yaml.njk` — modify — append `activity_card`.
- `modules/workflows/templates/edit.yaml.njk` — modify — append `activity_card` segment to the blocks `_build.array.concat`.
- `modules/workflows/templates/review.yaml.njk` — modify — same.
- `modules/workflows/templates/error.yaml.njk` — modify — same.

## Notes

- Same config prerequisite as task 5: `events.display_key` must equal `workflows.app_name` in the consuming app or the timeline renders empty (standing invariant; demo wiring rides Part 45).
- Integration check (when a demo app is available — Part 45): submit `request_changes` with a `change_request_comment` → all four generated pages for that action render the timeline with the comment HTML inline under the engine title; E2E coverage lands in Part 22.
- Use the events module's events-only `events-timeline` (task 5 rationale), not `workflows-events-timeline` — no action cards are wanted on a single-action page, so Part 42's self-card suppression is moot here.
