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

The entity reference key is the workflow config's required `entity_ref_key` (e.g. `lead_ids`) — the event-references key for the workflow's entity. It is denormalized onto the workflow doc at start, and the engine writes `{ [entity_ref_key]: [entity_id] }` into the event's references. This is the key entity-page timeline components query by, so the event surfaces on the entity's timeline without per-action authoring.

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

Under `display.{app}`, **`title` is the only author-overridable field**. The `description` slot is owned by the action comment — the comment's rich text is written there at submit time and rendered as the event body on the timeline. Authoring a `display.{app}.description` (on an action `event:` block or a workflow lifecycle `event:` block) is rejected at build; a `description` arriving from a pre-hook's `event_overrides` is stripped at merge, so the comment is always the sole writer of the slot. A comment-less event simply has no body.

## Event display

For display titles on the timeline, the workflows module follows the same per-app keying as the events module's `event_display` pattern. Display is keyed by `app_name` so each app sees its own label.

For how event display works across all modules, see [Event display](../../shared/event-display.md). The workflows module uses the same idiom — there is no separate workflows-specific display system.

## Event log and timeline

Log events emitted by the engine appear on the entity's event timeline automatically, assuming the entity's view page uses the events module's timeline component and the `entity_ref_key` var is configured. No per-action wiring is needed.

The `event_id` returned by `SubmitWorkflowAction` is the id of the log event written in that call. Post-hooks receive this id in `result.event_id` and can fetch the event doc if they need to attach additional context or fan out to downstream consumers.

## Notifications dispatch

After the log event is written, the engine dispatches to the notifications module's `send-notification` API. The notification dispatch decision lives in the notifications module's `send_routine` var supplied by the consuming app — that routine reads the event doc by id, resolves recipients (typically from `event.references` or the action's `notification_roles`), and dispatches via whatever channels the app wires. The engine calls `send-notification` unconditionally; the app-supplied routine decides what to do.

See the notifications module documentation for how to configure `send_routine`.
