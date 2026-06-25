# Task 5: Turn on enrichment in the demo and repoint `lead-view`

## Context

The events module timeline can now self-enrich (task 4). This task flips
enrichment on for the whole demo app via the `actions_collection` var, and points
the one direct consumer (`lead-view`) at the events module's timeline instead of
the workflows module's soon-to-be-deleted `workflows-events-timeline` component.

The demo's `company-setup` and `onboarding` workflows already target
`companies-collection` / `leads-collection`, so once enrichment is on, action cards
appear on the company and lead timelines with no per-entity config — exercising the
whole path through one var (worked example in the design).

Current demo wiring:

- `apps/demo/modules/events/vars.yaml` — the events module entry vars (has
  `display_key`, `contact_page_url`, etc.; no `actions_collection` yet).
- `apps/demo/pages/leads/lead-view.yaml:103–116` — drops the workflows module's
  `workflows-events-timeline` component (vars: `reference_field: lead_ids`,
  `reference_value: {_url_query: _id}`, `contact_page_url`).
- `apps/demo/pages/leads/lead-view.yaml:121–139` — drops the workflows
  `check-action-modal` whose `on_complete` refetches the action steps **and** the
  timeline via a `Request` action on `get_events_timeline` (the workflows request id).

## Task

### 1. Turn on enrichment (`apps/demo/modules/events/vars.yaml`)

Add to the events module entry vars:

```yaml
actions_collection: actions
contacts_collection: user-contacts
```

Place them alongside the existing `display_key` / `contact_page_url` vars. This is
the app-wide opt-in — every entity timeline now renders action cards for actions
referenced by its events.

### 2. Repoint `lead-view` to the events timeline (`apps/demo/pages/leads/lead-view.yaml`)

Replace the `workflows-events-timeline` drop (~lines 109–116) with the events
module's `events-timeline` component:

```yaml
- _ref:
    module: events
    component: events-timeline
    vars:
      reference_field: lead_ids
      reference_value:
        _url_query: _id
      contact_page_url: '/contacts/view?_id={id}'
```

(Carry over any other vars the old drop passed that the events component supports.)

### 3. Fix the modal `on_complete` refetch

The `check-action-modal` `on_complete` (~lines 135–138) refetches the timeline via
`Request` on `get_events_timeline` — the **workflows** request id, which is being
deleted (task 6). The events timeline component's request id is `get-events`.

Update the refetch `Request` action to target the events timeline's request. Since
the events timeline component owns the request internally, the page-level refetch
must reach it the same way the old one did. Match the events component's request id:

```yaml
# refresh the activity timeline (events-timeline's surface)
- - id: refetch_events_timeline
    type: Request
    params: get-events
```

Verify the request id matches whatever task 4 settled on for the events component
(`get-events` is the recommended id). Keep the action-steps refetch
(`entity-workflows-refetch`) unchanged.

The `check-action-modal` itself stays dropped by the page from the workflows module
— the events timeline's `onActionClick` (task 4) opens it by its fixed
`check_action_modal` blockId.

## Acceptance Criteria

- `apps/demo/modules/events/vars.yaml` sets `actions_collection: actions` and
  `contacts_collection: user-contacts` on the events entry.
- `lead-view.yaml` references `module: events, component: events-timeline` (not
  `workflows-events-timeline`).
- The modal `on_complete` refetches the events timeline via the events component's
  request id (`get-events`), not `get_events_timeline`.
- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds — config compiles with
  enrichment on and the lead timeline pointed at the events component.
- No demo file references `workflows-events-timeline` or the `get_events_timeline`
  request id any more (`grep` clean) — clearing the way for task 6's deletion.

## Files

- `apps/demo/modules/events/vars.yaml` — modify — add `actions_collection` + `contacts_collection`.
- `apps/demo/pages/leads/lead-view.yaml` — modify — repoint the timeline drop; fix the modal `on_complete` refetch request id.

## Notes

- Other entities (companies) get action cards automatically once enrichment is on,
  because their timelines use the same events component — no per-entity change.
- Do this before task 6: the workflows `workflows-events-timeline` component and
  `get_events_timeline` request are deleted there, so the demo must stop referencing
  them first or the build breaks.
