---
"@lowdefy/modules-mongodb-events": minor
---

Events: render action cards in the timeline by looking up each event's `action_ids`.

- `get-events` gains a `$lookup` stage (event `action_ids` → action `_id`) that reshapes each action into the shape the `EventsTimeline` block expects: `{ id, status, message, link }`. Status is the first element of the action's status array; `message` and `link` are read from the app-keyed display object (`{display_key}.message` / `{display_key}.link`), mirroring the per-app display scoping used for event titles. Actions whose current stage is `not-required` are dropped.
- The block now receives `actionStatusConfig` (built-in `action_status` enum merged with the new `action_status` var), so action status badges and card colors render.
- Link buttons: actions that store an app-scoped `link` (with a `pageId`) render a button; agenda-topic tasks have no link field so they render without one. An `onActionClick` handler is registered on the block — a `Link` action with `params: { _event: true }` — so clicking the button navigates to the action's `pageId`/`urlQuery`.
- New `action_status` var (default `{}`) merged over the built-in `modules/shared/enums/action_status.yaml` stages (`action-required`, `in-progress`, `done`).
- New `lookup_collections.actions` var (default `actions`) — the real collection name the timeline joins. Consumers mapping the actions collection to another name must set this to match the activities module's `actions-collection`.
