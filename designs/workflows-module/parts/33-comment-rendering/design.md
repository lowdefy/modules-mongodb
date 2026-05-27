# Part 33 — Comment rendering on the events timeline

**Status:** placeholder / stub. No decisions yet. Surfaced while scoping [Part 32](../_completed/32-drop-static-overrides/design.md); pulled out so the question gets dedicated thought.

## The question

A workflow submit captures an optional free-text `comment` from the end user. Today the engine writes that comment to **`event.metadata.comment`**, and the workflows module renders it via a **dedicated comments tile** (`modules/workflows/pages/task-view.yaml:215-285`) that runs its own events query filtered by `metadata.comment: { $exists: true }`. The main events timeline (the `EventsTimeline` block, fed by `modules/events/components/events-timeline.yaml`) does not surface the comment at all.

Meanwhile the events module already supports a secondary-text channel: the timeline aggregation projects `display.{app_name}.description` as `description`, and `EventsTimeline.js:284-287` renders it as smaller HTML text directly under the event title. The workflow engine's default event payload does not populate `display.{app_name}.description`.

The disconnect:

- **Events module says:** events have a title and an optional description rendered inline as secondary text.
- **Workflows engine says:** the end user's comment goes into `metadata.comment`, separate UI tile.

A workflow author who wants the comment to appear inline (under the title, as secondary text on the same timeline row) cannot achieve this today without engine changes, because:

1. The engine default doesn't write `display.{app_name}.description`.
2. The static YAML `event.{interaction}.display.{app}.description` override (Part 32 Layer 2) can be set, but no engine code wires the runtime `comment` value into the Nunjucks scope of templates inside that override — so even a templated description can't reach the `comment` field.
3. The pre-hook `event_overrides` return can in principle compose anything, but the pre-hook does not currently receive the user's `comment` in its scope either.

## What we know

- **Where the comment is captured.** `Input` block with `id: comment` on the workflow review/edit pages (e.g. `modules/workflows/pages/task-review.yaml:139`, `modules/workflows/templates/review.yaml.njk:166`). Mandatory on `request_changes`, optional elsewhere. State at `_state: comment`, sent as `payload.comment` to the action endpoint.
- **Where the comment is stored.** `event.metadata.comment`, written by `buildDefaultLogEventPayload` in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js:66-68`. Only written when non-empty.
- **Where the comment is rendered today.** Separate "Comments" tile on `task-view.yaml`, querying events by `metadata.comment: { $exists: true }`, rendering author + timestamp + raw HTML comment in its own list.
- **The unused channel.** `display.{app_name}.description` projected by `modules/events/components/events-timeline.yaml:43-50` and rendered by `EventsTimeline.js:284-287` — not populated by any workflow-engine code path.
- **Render path is sanitised HTML.** Both title and description go through `sanitize()` and support inline HTML.

## Open questions (not deciding yet)

- Should workflow-emitted events surface the comment inline on the main timeline, or stay separated in their own tile, or both?
- If inline: does the engine write the comment into `display.{app_name}.description` by default, or does a workflow author opt in per-interaction via `event:` or a pre-hook?
- If a templated description references `comment`, what scope makes the value available? (Today `_nunjucks` operators inside `display.*` are evaluated at page-render time by the timeline block, not by the engine — so the runtime `comment` would have to be either resolved at write time or projected through `metadata.comment` and consumed by the timeline.)
- Does the separate "Comments" tile have a reason to exist beyond compensating for the timeline gap? (e.g. filtering, threading, longer-form display, comment-only audit views.) If yes, both surfaces coexist; if no, one supersedes the other.
- Does this affect Part 32's decision on whether the static YAML `event:` channel can be dropped? (Part 32 currently keeps it; revisit once this is resolved.)

## Not in scope here

- Editing or deleting comments after the fact.
- Threading / replies.
- Email/notification rendering of comments.

## Next step

Dig into the open questions; produce a real design.
