# Implementation Tasks — `_app` operator migration

## Overview

These tasks implement `designs/app-operator/design.md`: replace the per-module `app_name`
manifest var with Lowdefy's built-in `_app`/`_build.app` operator reading a single root
`slug:` declaration, rename the `app_name`/`appName` identifier to `slug` (and `display_key`
for the EventsTimeline property) throughout the workflows subsystem and plugin package, and
update the demo app, the workflows-test app, and the docs to the new shape. It is a single
breaking change shipped as one PR (0.x prerelease); intermediate task states may not build,
so the build only needs to be green after the final verify task.

## Tasks

| #   | File                                     | Summary                                                                            | Depends On    |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------- | ------------- |
| 1   | `01-plugin-rename-and-version-bump.md`   | Rename `app_name`→`slug` / `display_key` across the plugin package; bump to 0.15.0 | —             |
| 2   | `02-migrate-workflows-module.md`         | Workflows connection, resolvers, manifest var + plugin constraint                  | 1             |
| 3   | `03-migrate-events-module.md`            | `display_key` default `{ _app: slug }`; EventsTimeline wiring → `display_key`      | 1             |
| 4   | `04-migrate-notifications-module.md`     | Drop `app_name` var; migrate runtime reads + payload defaults                      | —             |
| 5   | `05-migrate-contacts-module.md`          | Drop `app_name` var; runtime + build-time reads; comment fix                       | —             |
| 6   | `06-migrate-companies-and-activities.md` | Drop `app_name` var; build-time key reads (incl. activities concat variant)        | —             |
| 7   | `07-demo-app-cleanup.md`                 | Demo vars, `app_config.yaml` delete, home title + footer `_app: name`              | 2, 3, 4, 5, 6 |
| 8   | `08-workflows-test-app-cleanup.md`       | `slug: test`, drop entry vars, `app_config.yaml` delete                            | 2, 3, 4, 6    |
| 9   | `09-update-docs.md`                      | README + `docs/shared/*`; regenerate `vars.md` + `llms.txt`                        | 2, 3, 4, 5, 6 |
| 10  | `10-sweep-design-docs.md`                | Standardise `app_name`→`slug` prose in in-flight/concept design docs               | —             |
| 11  | `11-verify-build-and-tests.md`           | `ldf:b` both apps, plugin tests, `docs:check`                                      | all           |

## Ordering Rationale

The plugin package (task 1) is the deepest dependency: its connection schema declares the
properties that the workflows connection YAML (`slug`) and the events connection YAML
(`display_key`) wire into. It renames in isolation and its own test suite verifies it, so it
goes first. The workflows module (2) and events module (3) each depend on task 1 because
their connection-wiring keys must match the renamed plugin properties **lockstep** — they
land in the same PR immediately after task 1.

The three scoping-module tasks (4 notifications, 5 contacts, 6 companies + activities) are
independent of the plugin and of each other — they only touch their own module YAML and
manifests. They are grouped by module because a module is the unit a reviewer build-verifies,
and because the runtime (`_app: slug`) vs build-time (`_build.app: slug`) split differs per
file within a module and must not be split across tasks. Notifications is runtime-only;
contacts is mixed; companies and activities are build-time-only (activities carries the one
`_build.string.concat` edge case, so it is called out explicitly).

Consumer cleanup (7 demo, 8 workflows-test) depends on the module tasks: once a module drops
its `app_name` manifest var, the consumer vars files must stop passing it, and the build is
only green when both sides agree. Docs (9) depends on the manifest edits because
`pnpm docs:gen` regenerates `vars.md` from the manifests. The design-doc prose sweep (10) is
independent and can run any time. The final verify task (11) gates the whole PR.

Tasks 4, 5, 6, and 10 have no dependencies and can run in parallel. Tasks 2 and 3 can run in
parallel once 1 is done.

## Scope

**Source:** `designs/app-operator/design.md`
**Context files considered:** `designs/app-operator/lowdefy-requirements.md`
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`, `review/review-4.md`
