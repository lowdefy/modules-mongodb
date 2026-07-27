# Task 11: New workflows timeline surface; migrate the demo; drop the events-module splice

## Context

`GetEventsTimeline` (task 6) is the cross-stream method that enriches events with
action cards. Today that enrichment is spliced **inline** into the events
module's generic timeline: `modules/events/components/events-timeline.yaml`
`_ref`s `../shared/workflow/timeline_action_lookup.yaml` into its `get-events`
aggregation. Per D6, the generic events timeline returns to **events-only**, and
the action-enriched timeline becomes a **workflows-provided** surface that apps
opt into.

The demo consumes the events-module timeline on the lead page:
`apps/demo/pages/leads/lead-view.yaml:103–117` references
`{ module: events, component: events-timeline }` with
`reference_field: lead_ids`, `reference_value: { _url_query: _id }`. After the
splice is removed, that surface loses action cards — so the demo must switch to
the new workflows timeline surface to keep them.

## Task

**1. New workflows timeline surface.** Add a workflows-module component (suggested
`modules/workflows/components/workflows-events-timeline.yaml`) that renders the
same `EventsTimeline` block as the events component but sources its data from
`GetEventsTimeline` (via the timeline request defined in task 7). Model it on
`modules/events/components/events-timeline.yaml` — same block props
(`eventTypeConfig`, `actionStatusConfig`, `reverse`, `contactPageUrl`, etc.),
same `reference_field` / `reference_value` vars — but the `onMount` request calls
the `GetEventsTimeline`-backed request instead of the inline-lookup `get-events`.
Export it in `module.lowdefy.yaml` (`exports.components` + `components`).

**2. Remove the inline splice from the events module.** In
`modules/events/components/events-timeline.yaml`, delete the
`_ref: ../shared/workflow/timeline_action_lookup.yaml` splice (lines ~32–39) and
the downstream `actions` `$filter`/`$addFields` that depend on the looked-up
actions, so `get-events` returns events-only (its original generic behavior). Keep
the event display-field `$addFields` (title/description/info) that the
`EventsTimeline` block needs.

**3. Migrate the demo.** Point `apps/demo/pages/leads/lead-view.yaml`'s Activity
card at the new workflows timeline component
(`{ module: workflows, component: workflows-events-timeline }`) with the same
`reference_field` / `reference_value` vars, so lead activity still shows
action cards.

## Acceptance Criteria

- A workflows timeline surface renders events + action cards via
  `GetEventsTimeline`.
- `modules/events/components/events-timeline.yaml` no longer references
  `timeline_action_lookup.yaml`; the generic events timeline is events-only.
- The demo lead-view uses the workflows timeline surface and still shows action
  cards (workflow cards verb-filtered + linked; the timeline can host the
  check-modal — `_id`/`kind` present per task 6).
- `pnpm ldf:b` builds; the demo lead page renders the activity timeline.

## Files

- `modules/workflows/components/workflows-events-timeline.yaml` — create — `EventsTimeline` block fed by `GetEventsTimeline`.
- `modules/workflows/module.lowdefy.yaml` — modify — export the new component.
- `modules/events/components/events-timeline.yaml` — modify — remove the `timeline_action_lookup` splice; return to events-only.
- `apps/demo/pages/leads/lead-view.yaml` — modify — use the workflows timeline component.

## Notes

- Do **not** delete `timeline_action_lookup.yaml` here — the
  `module.lowdefy.yaml` `timeline-action-lookup` export still references it; that
  export + the file are removed in task 12.
- The events module stays in this part's repo scope only for the splice removal;
  no events-module dependency on workflows is introduced (the dependency runs
  the legal direction: an app references the workflows-provided component).
- If task 7 placed the timeline request inline in this component, ensure the
  payload (`reference_field`/`reference_value`) and the `GetEventsTimeline`
  contract line up.
