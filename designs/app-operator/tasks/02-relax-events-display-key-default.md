# Task 2: Relax `events.display_key` to default `{ _app: slug }`

## Context

The events module renders per-event-document titles by reading `display.{display_key}.title` off each event document. `display_key` is declared as a required manifest var today, so every consuming app must wire it explicitly — usually to the same value as the app slug.

The override case is real: an ops-style app rendering events written by a different app needs `display_key: that-other-app`. We keep the var but flip the default from "required" to `{ _app: slug }`, which covers the common case without forcing per-consumer wiring.

`display_key` is read at four sites inside `modules/events/components/events-timeline.yaml` to project the event-display title — none of those usage sites change in this task.

## Task

Edit `modules/events/module.lowdefy.yaml`:

1. Locate the `vars.display_key` declaration.
2. Change `required: true` to `default: { _app: slug }`.
3. Update the `description:` to reflect the new behaviour — describe `display_key` as the lookup key used against `display.{key}.title` on event documents, defaulting to the app slug, overrideable only when the consuming app needs to render events written by a different app.

Do not change the consumption sites in `modules/events/components/events-timeline.yaml` — they continue to read `_module.var: display_key`, which now resolves through the default when no value is supplied.

## Acceptance Criteria

- `vars.display_key` in the events manifest declares `default: { _app: slug }` and no longer carries `required: true`.
- The events timeline still renders correctly in the demo with no explicit `display_key:` set on the demo events vars (verified in task 9 after the demo vars are updated).
- An app that explicitly sets `display_key: other-app` still has that value flow through to the timeline.

## Files

- `modules/events/module.lowdefy.yaml` — modify — `display_key` becomes optional with `default: { _app: slug }`; description updated.

## Notes

- Manifest var defaults pass through as operator objects (unevaluated). They resolve at the consumption site, which is fine because the events timeline reads `_module.var: display_key` at runtime.
- The demo's existing `display_key:` declaration in `apps/demo/modules/events/vars.yaml` continues to work after this change — that file is updated in task 9.
