# Task 13: `apps/passwordless-demo` cleanup

## Context

`apps/passwordless-demo/` is a third consumer app, added after
`designs/app-operator/design.md` was first written (tasks 7 and 8 cover only `apps/demo` and
`apps/workflows-test`). It mounts `events` and `notifications` — both in-scope scoping
modules — and feeds them from its own `app_config.yaml`.

It already declares `slug: passwordless-demo` on `lowdefy.yaml`, so no slug needs adding.

**Value change to be aware of:** `app_config.yaml` declares `app_name: passwordless`, while
the root `slug:` is `passwordless-demo`. Migrating therefore moves the scoping value from
`passwordless` to `passwordless-demo`. This is intentional and settled in the design — take
the app's declared slug as canonical; do **not** retitle `slug:` to `passwordless` to preserve
the old string.

## Task

- `apps/passwordless-demo/modules/notifications/vars.yaml` — delete the `app_name:` entry
  (the notifications module no longer declares the var).
- `apps/passwordless-demo/modules/events/vars.yaml` — delete the `display_key:` entry (it now
  defaults to `{ _build.app: slug }`). If dropping it leaves the file empty, check how the
  entry references it in `modules.yaml` and remove the now-pointless vars file/reference
  rather than leaving an empty file.
- Check `apps/passwordless-demo/modules.yaml` and every other file in the app for inline
  `app_name:` entry vars or `_ref` reads into `app_config.yaml`
  (`git grep -n 'app_config\|app_name' apps/passwordless-demo/`) and migrate/remove them.
- Delete `apps/passwordless-demo/app_config.yaml` once nothing reads it — a dangling `_ref`
  breaks the build.
- If any page chrome hardcodes the app's display name, switch it to `{ _app: name }`
  (mirrors task 7's demo home-title / footer change). Only do this where a literal app name
  is actually hardcoded; do not invent sites.

## Acceptance Criteria

- `git grep -n 'app_name\|app_config' apps/passwordless-demo/` returns nothing (excluding
  `node_modules/`).
- `apps/passwordless-demo/app_config.yaml` is deleted.
- `apps/passwordless-demo/lowdefy.yaml` still declares `slug: passwordless-demo` (unchanged).
- `pnpm --filter @lowdefy/modules-passwordless-demo ldf:b` passes (verified in task 11).

## Files

- `apps/passwordless-demo/modules/notifications/vars.yaml` — modify — drop `app_name`
- `apps/passwordless-demo/modules/events/vars.yaml` — modify — drop `display_key`
- `apps/passwordless-demo/modules.yaml` — modify (if it carries inline `app_name` vars)
- `apps/passwordless-demo/app_config.yaml` — delete

## Notes

- Depends on tasks 3 (events) and 4 (notifications) landing the manifest changes.
- This app is not in CI (`.github/workflows/ci.yaml` runs only `docs:check`), but it is a
  build-verification target for task 11 alongside the demo and workflows-test apps.
