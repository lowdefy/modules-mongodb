# Task 6: `GetEventsTimeline` — the cross-stream events timeline method

## Context

`modules/shared/workflow/timeline_action_lookup.yaml` (Part 42's events-timeline
enrichment) is the fourth consumer of the read-side YAML stages. It runs today
**inside the events module's** `get-events` aggregation
(`modules/events/components/events-timeline.yaml`): after `$match`ing events to a
target reference, it `$lookup`s actions, composes `visible_verbs` +
`resolve_action_link`, applies card-worthiness + access drops, and attaches each
action to its **latest** referencing event (dedup via `$setWindowFields` /
`$group` / sort).

The goal is **zero stragglers** — verb/link policy in plugin JS only. The naive
port (events → workflows) would create a **workflows ⇄ events cycle** (workflows
already → events). The fix is to **invert ownership**: workflows exposes
`GetEventsTimeline` (events query + action enrichment), reading events itself.
Workflows → events is already legal, so no cycle (D6).

`GetEventsTimeline` is **cross-stream**: the `actions` collection is shared with
the future tasks module (`kind: task`, `workflow_id: null`), and an event can
reference either stream. So the method must **not** bake in a workflow-only
filter. Per action card it branches on `workflow_id`:

- **set** → full workflow enrichment (verb-gate access filter + collapsed engine
  `link`, the ported `visible_verbs`/`resolve_action_link` logic), and the card
  is **dropped** if the user holds no verbs on it.
- **null** → **pass through** on the shared display fields (`status`,
  `<app_slug>.message`) — no workflow logic. (No such docs exist yet;
  pass-through is a no-op safety valve. Task-specific access filtering + links
  are deferred to the tasks module — build none of it.)

## Task

Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js`:

1. `const context = await createEngineContext(lowdefyContext);` — read the
   reference params from `context.params` (mirror the events-timeline component's
   payload: a `reference_field` + `reference_value`, plus whatever the current
   `get-events` pipeline takes — inspect `events-timeline.yaml`). The events
   collection name is `context.connection.eventsCollection` (the top-level
   connection property declared in task 1, default `"log-events"`).
2. **Read events** referenced to the target (the `$match` the events component
   does today) from the events collection.
3. **`$lookup` actions** and run the **ported, stream-agnostic** dedup/attachment
   rules from `timeline_action_lookup.yaml` **verbatim in behavior**:
   card-worthiness filter (drop currently-blocked actions and actions that never
   reached an active stage), latest-event-per-action attachment, and the final
   sort (`sort_order`, `updated.timestamp`). These rules apply to **all** cards
   regardless of stream.
4. **Per action card, branch on `workflow_id`:**
   - set → resolve `allowed` (task 2 `computeAllowed`) and **drop** the card if no
     verb is held; resolve `link = collapseLink(...)`.
   - null → pass through `status` and `<app_slug>.message` only; no access/link
     logic.
5. **Project each card** as `{ _id, kind, status, link, message, ...sort }` —
   `_id`/`kind` included because the timeline is a check-modal host (Part 40),
   exactly as `GetEntityWorkflows` does. Surface **no** `allowed` bag (it is used
   only to filter).
6. Return the events enriched with their attached action cards, in the same
   overall shape the `get-events` request produces today (so the
   `EventsTimeline` block renders unchanged) — i.e. events with `actions[]`
   attached, sorted, with the title/description/info display fields the component
   adds. (Inspect `events-timeline.yaml` for the exact post-lookup `$addFields`
   the block consumes, and reproduce them.)
7. `.schema = {}`, `.meta = { checkRead: false, checkWrite: false }`. Register in
   `WorkflowAPI.js`.

Add `GetEventsTimeline.test.js` (in-memory Mongo): seed events + workflow
actions; assert latest-event-per-action dedup, the access drop, resolved `link`,
`_id`/`kind` on cards, and that a `workflow_id: null` action passes through on
`status`/`message` with no access logic.

## Acceptance Criteria

- The method reads events itself (no call into the events module) and enriches
  with action cards — no `workflows ⇄ events` dependency introduced.
- Stream-agnostic dedup/sort/card-worthiness matches the current
  `timeline_action_lookup.yaml` behavior.
- Workflow cards are verb-filtered and carry a collapsed `link`; non-workflow
  cards pass through on `status`/`message`.
- Cards carry `_id` and `kind`.
- New tests pass; full plugin test suite green.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.test.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js` — modify — register `GetEventsTimeline`.

## Notes

- This is the **opposite** rule from `GetWorkflowAction` (which returns `null`
  for `workflow_id: null`): the detail read shows one workflow action's page; the
  timeline is a cross-stream list and includes both. Different surface, different
  rule — keep both.
- Do **not** delete `timeline_action_lookup.yaml` / the events-module splice
  here — that happens in tasks 11/12 once the new surface (task 11) consumes this
  method.
- Removing the unconditional inline lookup from the generic events timeline is a
  deliberate breaking change (D6 / review-5 #3). It splits the four shipped
  `events-timeline` consumers two ways: for `contacts`/`companies` `tile_events`
  and `activities/pages/view` it is a **no-op on current data** (no workflow
  events reference those entities' actions today); the **demo lead-view is a real
  consumer** — the onboarding workflow targets `leads-collection`/`lead_ids`, so
  started workflows do put action cards on its timeline — and it **migrates to the
  new workflows-provided timeline surface in task 11**, not here. The actual
  splice removal + demo migration live in task 11; this task only adds the method.
