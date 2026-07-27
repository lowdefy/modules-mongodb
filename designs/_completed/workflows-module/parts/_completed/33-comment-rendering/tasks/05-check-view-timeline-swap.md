# Task 5: Check view page — delete the bespoke comments card, add the standard events timeline

## Context

> **Re-baselined against shipped Parts 40/46.** The page is no longer the self-contained body it was at first draft. `pages/workflow-action-view.yaml` is now a **Part 40 thin container**: its `blocks:` are `_ref: components/check-action-surface.yaml` (the entire action body — status badge, working inputs, signal buttons) followed by the page-level `comments_card`. The card is explicitly tagged in the page header comment as "kept verbatim pending Part 33, which owns swapping it for the shared events-timeline `_ref`." The action read was renamed `get_action` → `get_workflow_action` and now returns a **single object** (no `.0`).

The page-level `comments_card` is a `Card` running its own `get_comment_events` aggregation (`$match: { action_ids: { $in: [...] }, metadata.comment: { $exists: true } }`, `workflow-action-view.yaml:73-158`) and a `comment_events_list` List rendering `metadata.comment` via an `Html` block.

With the engine now writing the comment into `display.{app_name}.description` (tasks 1–4) and never writing `metadata.comment`, this card queries a field new events no longer carry. Design D6: delete it and compose the standard `events-timeline` component instead — the timeline renders the comment inline under the engine title via its `description` channel, plus the full activity stream (submits, status changes).

**Use the events module's generic `events-timeline`, not the workflows `workflows-events-timeline`** (design D6). Part 46 split the timeline: the events module's `events-timeline` is **events-only** (a client-side aggregation, still projects `display.{display_key}.description → description`, `events-timeline.yaml:43-50`), while `workflows-events-timeline` (engine `GetEventsTimeline`) carries cross-stream action cards for _entity_ pages. On a single action's own page, filtered to that one action's id, action-card enrichment would only ever produce a suppressed self-card — it buys nothing. The events-only generic timeline is the lighter, correct tool: no engine method call, no `check_action_modal` to keep clear of this page's existing `get_workflow_action` request.

The component is `modules/events/components/events-timeline.yaml` (exported by the events module; the workflows module already declares the `events` dependency in `module.lowdefy.yaml`). Its vars: `reference_field` + `reference_value` (the `$match`), `display_key` (defaults to the events module entry's `display_key` var), and optional chrome (`reverse`, `compact`, …). Existing usage pattern (contacts module, `tile_events.yaml`): a layout card wrapping `_ref: { module: events, component: events-timeline, vars: { reference_field: contact_ids, reference_value: ... } }`.

## Task

In the check view page (`modules/workflows/pages/workflow-action-view.yaml`):

1. **Delete the whole `comments_card` block** (`:73-158`) — the Card, the nested `comment_events` Box with its `get_comment_events` request and `onMount` handlers (`fetch_comment_events`, `set_comment_events_list`), the `comment_events_empty` paragraph, and the `comment_events_list` List. Leave the `check-action-surface` `_ref` above it untouched.
2. **Add an activity card in its place** (as the second page-level block, after the `check-action-surface` `_ref`), composing the standard timeline filtered to the action:

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
               _request: get_workflow_action._id
   ```

   `reference_value: { _request: get_workflow_action._id }` mirrors exactly how the deleted card's payload resolved the action id on this page (`get_action._id` → `get_workflow_action._id` after the Part 46 rename; the request is registered in the page's `requests:` already). Keep snake_case block ids.

3. **Update the page header comment** (`:17-19`) — it currently says the comments card is "kept verbatim pending Part 33, which owns swapping it for the shared events-timeline `_ref`." Replace with a one-line note that the activity card now composes the events-only `events-timeline` filtered to the action.
4. In `modules/workflows/module.lowdefy.yaml`, extend the `events` dependency `description` to mention the `events-timeline` component now composed by the action pages (manifest is the source of truth).

## Acceptance Criteria

- `grep -rn "comments_card\|get_comment_events\|comment_events_list\|metadata.comment" modules/workflows/` returns nothing.
- The page composes `_ref: { module: events, component: events-timeline }` with `reference_field: action_ids` and `reference_value: { _request: get_workflow_action._id }`.
- The `check-action-surface` `_ref` is unchanged and still the first page-level block.
- The workflows manifest's `events` dependency description mentions the timeline component.
- `pnpm ldf:b` (demo app build) succeeds.

## Files

- `modules/workflows/pages/workflow-action-view.yaml` — modify — delete `comments_card`, add `activity_card` + timeline `_ref`, refresh header comment.
- `modules/workflows/module.lowdefy.yaml` — modify — `events` dependency description.

## Notes

- **Config prerequisite, not work:** the timeline reads events by the **events** entry's `display_key`, while the engine writes `display` under the **workflows** entry's `app_name`. The consuming app must wire these equal or the action-page timeline renders empty — a standing invariant (it's why workflow events already surface on entity-page timelines), called out in design D6. Nothing to change in this repo's module code; demo wiring rides Part 45 (demo rebuild).
- Events with no `display.{display_key}` bucket are filtered out by the component's `$ne: null` match — old `metadata.comment`-only events simply don't appear (design D2: no backfill in v1).
- **Do not** use `workflows-events-timeline` here (design D6) — its action-card enrichment is wasted on a single-action page and its bundled `check_action_modal` / fixed `get_events_timeline` request id are needless surface on a page that already runs `get_workflow_action`.
- Part 42's D6 self-card suppression is moot here (events-only timeline renders no action cards); it stays relevant only on the entity-page `workflows-events-timeline`.
