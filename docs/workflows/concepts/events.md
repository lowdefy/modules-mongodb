---
title: Events
module: workflows
type: concept
concepts: [events, log-events, audit-trail, event-overrides, timeline, references]
---

# Workflows — Events

The engine emits a log event on every successful action transition — no author config required. Events are written to the `events` module's `log-events` collection and appear on entity timelines automatically.

## Default behavior

Every signal that transitions the current action generates a log event. The event's `references` field is derived from the workflow context so it appears on the entity's timeline without any per-action authoring.

The entity reference key is derived from `entity_collection`: strip a trailing `-collection` if present, replace `-` with `_`, append `_ids`. So `leads-collection → leads_ids`, `tickets-collection → tickets_ids`. This matches the convention entity-page timeline components query by.

## Overriding event metadata

Authors can override the default event shape per signal using the `event:` block at the action root:

```yaml
type: qualify
kind: form
event:
  submit:
    type: lead-qualified       # overrides the default "action-submit" type
    display:
      my-app:
        title: Lead qualified
    metadata:
      custom_field: value      # merged with default metadata
  approve:
    type: lead-approved
```

The `event:` block is keyed by signal name. At handler entry, the engine resolves `event_overrides[signal]` once and uses it as the build-time override bag. A pre-hook's `event_overrides` return is the runtime override bag — it merges on top of the build-time bag, and the pre-hook wins on collision.

## Event display

For display titles on the timeline, the workflows module follows the same per-app keying as the events module's `event_display` pattern. Display is keyed by `app_name` so each app sees its own label.

For how event display works across all modules, see [Event display](../../shared/event-display.md). The workflows module uses the same idiom — there is no separate workflows-specific display system.

## Event log and timeline

Log events emitted by the engine appear on the entity's event timeline automatically, assuming the entity's view page uses the events module's timeline component and the `entity_ref_key` var is configured. No per-action wiring is needed.

The `event_id` returned by `SubmitWorkflowAction` is the id of the log event written in that call. Post-hooks receive this id in `result.event_id` and can fetch the event doc if they need to attach additional context or fan out to downstream consumers.

## Notifications dispatch

After the log event is written, the engine dispatches to the notifications module's `send-notification` API. The notification dispatch decision lives in the notifications module's `send_routine` var supplied by the consuming app — that routine reads the event doc by id, resolves recipients (typically from `event.references` or the action's `notification_roles`), and dispatches via whatever channels the app wires. The engine calls `send-notification` unconditionally; the app-supplied routine decides what to do.

See the notifications module documentation for how to configure `send_routine`.
