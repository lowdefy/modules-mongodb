# Task 5: Simple view page — delete the bespoke comments card, add the shared events timeline

## Context

The simple-action view page — currently `modules/workflows/pages/simple-view.yaml`; Part 38 task 18 (pending) renames it to `workflow-action-view.yaml`, so **apply this task to whichever filename exists** — renders a bespoke `comments_card`: a Card running its own `get_comment_events` aggregation (`$match: { action_ids: { $in: [...] }, metadata.comment: { $exists: true } }`) and a `comment_events_list` List rendering `metadata.comment` via an `Html` block (lines ~200–285).

With the engine now writing the comment into `display.{app_name}.description` (tasks 1–4) and never writing `metadata.comment`, this card queries a field new events no longer carry. Design D6: delete it and compose the shared `events-timeline` component instead — the standard timeline renders the comment inline under the auto-title via its `description` channel, plus the full activity stream (submits, status changes).

The shared component is `modules/events/components/events-timeline.yaml` (exported by the events module; the workflows module already declares the `events` dependency in `module.lowdefy.yaml`). Its vars: `reference_field` + `reference_value` (the `$match`), `display_key` (defaults to the events module entry's `display_key` var), and optional chrome (`reverse`, `compact`, …). Existing usage pattern (contacts module, `tile_events.yaml`): a layout card wrapping `_ref: { module: events, component: events-timeline, vars: { reference_field: contact_ids, reference_value: ... } }`.

## Task

In the simple view page (`modules/workflows/pages/simple-view.yaml`, or `workflow-action-view.yaml` post-rename):

1. **Delete the whole `comments_card` block** — the Card, the nested `comment_events` Box with its `get_comment_events` request and `onMount` handlers (`fetch_comment_events`, `set_comment_events_list`), the `comment_events_empty` paragraph, and the `comment_events_list` List.
2. **Add an activity card in its place** (after `status_history_card`), composing the shared timeline filtered to the action:

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
               _request: get_action._id
   ```

   `reference_value: { _request: get_action._id }` mirrors exactly how the deleted card's payload resolved the action id on this page. Keep snake_case block ids.
3. **Leave `status_history_card` untouched** — it reads the action doc's `status[]`, a different source; folding it into the timeline is explicitly deferred.
4. In `modules/workflows/module.lowdefy.yaml`, extend the `events` dependency `description` to mention the `events-timeline` component now composed by the action pages (manifest is the source of truth; currently it lists only `change_stamp` and the `new-event` Api).

## Acceptance Criteria

- `grep -rn "comments_card\|get_comment_events\|comment_events_list\|metadata.comment" modules/workflows/` returns nothing.
- The page composes `_ref: { module: events, component: events-timeline }` with `reference_field: action_ids`.
- The `status_history_card` block is unchanged.
- The workflows manifest's `events` dependency description mentions the timeline component.

## Files

- `modules/workflows/pages/simple-view.yaml` (or `workflow-action-view.yaml` if Part 38 task 18 has landed) — modify — delete `comments_card`, add `activity_card` + timeline `_ref`.
- `modules/workflows/module.lowdefy.yaml` — modify — `events` dependency description.

## Notes

- **Config prerequisite, not work:** the timeline reads events by the **events** entry's `display_key`, while the engine writes `display` under the **workflows** entry's `app_name`. The consuming app must wire these equal or the action-page timeline renders empty — a standing invariant (it's why workflow events already surface on entity-page timelines), called out in design D6. Nothing to change in this repo's module code; demo wiring rides Part 45 (demo rebuild).
- Events with no `display.{display_key}` bucket are filtered out by the component's `$ne: null` match — old `metadata.comment`-only events simply don't appear (design D2: no backfill in v1).
- Part 40 (simple-action-surfaces) is ordered after this part and carries the timeline `_ref` (not the comments card) into its shared surface — keep the addition self-contained at the page level here.
- Part 42's D6 later suppresses the self-referential action card on this page's timeline — out of scope here.
