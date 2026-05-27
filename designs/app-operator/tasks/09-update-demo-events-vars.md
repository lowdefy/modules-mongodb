# Task 9: Update demo events vars — `change_stamp` + drop `display_key`

## Context

`apps/demo/modules/events/vars.yaml` does two things tied to this migration:

1. Declares `display_key:` by reading `app_config.yaml`. Once task 2 sets the events manifest default to `{ _app: slug }`, and given the demo's `display_key` is the same string as the slug, the explicit demo declaration becomes redundant and should be dropped (so the demo demonstrates the new default).

2. Overrides `change_stamp` to add `app_name:` to the stamp — also reading `app_config.yaml`. The design's new idiom is `app_name: { _app: slug }`. The stamp is a runtime template, so `_app: slug` evaluates per request when the stamp is applied.

This task replaces both indirections with `_app` operators. It depends on task 2 (events manifest default change) so that dropping `display_key:` is safe.

## Task

Edit `apps/demo/modules/events/vars.yaml`:

1. Delete the top-level `display_key:` block (the `_ref` into `app_config.yaml`). It's now supplied by the manifest default.

2. In the `change_stamp:` block, replace the `app_name:` value:
    - Before: `app_name: { _ref: { path: app_config.yaml, key: app_name } }`.
    - After: `app_name: { _app: slug }`.

Leave the other fields under `change_stamp:` (`timestamp`, `user.name`, `user.id`, `version.app`, `version.lowdefy`) unchanged.

## Acceptance Criteria

- `apps/demo/modules/events/vars.yaml` no longer declares a top-level `display_key:` key.
- The `change_stamp.app_name` value is `{ _app: slug }` and reads no other file.
- `pnpm ldf:b` succeeds.
- The events module's timeline component renders titles correctly in the demo (proves the manifest default `display_key: { _app: slug }` resolved to `"demo"` and the timeline projection still finds `display.demo.title`).
- Triggering any event-writing action stamps `created.app_name: "demo"` on the new event document.

## Files

- `apps/demo/modules/events/vars.yaml` — modify — drop `display_key:`; `change_stamp.app_name` → `{ _app: slug }`.

## Notes

- The stamp template is evaluated at request time when a routine references it, so a runtime `_app: slug` is sufficient — no build-time evaluation needed for this specific site.
- Do **not** delete `apps/demo/app_config.yaml` here. Other readers may still be migrating in parallel; task 11 handles deletion once every reader is gone.
