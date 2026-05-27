# Task 1: Add `slug` and update `name` on the demo app root

## Context

The demo app currently identifies itself via a separate `apps/demo/app_config.yaml` file holding `app_name: demo`, and every module entry that needs the slug reads from that file (`_ref: { path: app_config.yaml, key: app_name }`) and passes the value through as a module var.

This migration replaces that indirection with Lowdefy's built-in `_app` operator. The operator reads `slug:` (and `name:`, `description:`) declared on the root of `lowdefy.yaml`. Lowdefy validates `slug:` against the regex `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` at build time.

This is the foundational task: until `slug:` is declared on `lowdefy.yaml`, every later task's `_app: slug` reference resolves to `null`.

The `name:` rename ("Module Demo App" → "Modules Demo") is the value the user-admin module's new `app_title: { _app: name }` default will produce — picking a name that reads cleanly as a label prefix ("Modules Demo User Admin") is the reason for the rename.

## Task

Edit `apps/demo/lowdefy.yaml`:

1. Add `slug: demo` immediately after the `lowdefy:` version line.
2. Change `name: Module Demo App` → `name: Modules Demo`.

Do **not** delete `apps/demo/app_config.yaml` yet — later tasks still reference it. Deletion happens in task 11 once every reader has migrated.

## Acceptance Criteria

- `apps/demo/lowdefy.yaml` declares `slug: demo` at the root.
- `apps/demo/lowdefy.yaml` declares `name: Modules Demo` at the root.
- `pnpm ldf:b` (build) succeeds without slug-format errors.
- A trivial probe — e.g. a `_app: slug` reference rendered on the home page or read from a request — resolves to `"demo"`.

## Files

- `apps/demo/lowdefy.yaml` — modify — add `slug: demo`, rename `name:`.

## Notes

- The slug `demo` matches the literal `app_name: demo` stored on existing event/notification documents, so no data migration is needed.
- `app_config.yaml` is intentionally **not** deleted in this task. Several follow-on tasks still read it; task 11 handles the cleanup once all readers are gone.
