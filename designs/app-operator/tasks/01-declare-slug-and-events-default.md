# Task 1: Declare `slug` on the demo app and relax the `events.display_key` default

## Context

Two tiny foundational changes that everything else builds on.

The demo currently identifies itself via `apps/demo/app_config.yaml` (`app_name: demo`), read indirectly by module vars files via `_ref: { path: app_config.yaml, key: app_name }`. This migration replaces that with Lowdefy's `_app` operator, which reads `slug:` / `name:` / `description:` from the root of `lowdefy.yaml`. Lowdefy validates `slug:` against `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` and — crucially — **fails the build if `_app: slug` is referenced while `slug:` is undeclared**. So the slug must be declared before any later task introduces an `_app: slug` reference.

The `events.display_key` var is `required: true` today and is set by every consumer to the same string as the slug. Making it optional with `default: { _app: slug }` lets the common case stop setting it. `display_key` is consumed only at runtime (`_object.fromEntries` / `_string.concat` in `events-timeline.yaml`), so the runtime `_app` form is correct for its default. (Contrast `app_title` in Task 3, which has build-time consumers and needs `_build.app`.)

## Task

1. **Demo app root** — edit `apps/demo/lowdefy.yaml`:
   - Add `slug: demo` immediately after the `lowdefy:` version line.
   - Change `name: Module Demo App` → `name: Modules Demo` (reads cleanly as the `app_title` label prefix "Modules Demo User Admin").

2. **Events manifest** — edit `modules/events/module.lowdefy.yaml`, `vars.display_key`:
   - Remove `required: true`.
   - Add `default: { _app: slug }`.
   - Update the description to note it defaults to the app slug and is overridden only when rendering another app's events.

Do **not** delete `apps/demo/app_config.yaml` or touch demo vars files yet — later tasks still reference them (cleanup is Task 5).

## Acceptance Criteria

- `apps/demo/lowdefy.yaml` declares `slug: demo` and `name: Modules Demo` at the root.
- `modules/events/module.lowdefy.yaml` `display_key` is optional with `default: { _app: slug }` and no longer `required: true`.
- `pnpm ldf:b` succeeds without slug-format errors.

## Files

- `apps/demo/lowdefy.yaml` — modify — add `slug: demo`, rename `name:`.
- `modules/events/module.lowdefy.yaml` — modify — `display_key` → optional, `default: { _app: slug }`.

## Notes

- The slug `demo` matches the literal `app_name: demo` already stored on event/notification documents, so no data migration is needed.
- A manifest var default that is a runtime operator object (`{ _app: slug }`) is substituted into the consumer site and evaluated there — the same mechanism `change_stamp` uses with `_user: id` / `_date: now`. Safe here because every `display_key` consumer is runtime.
