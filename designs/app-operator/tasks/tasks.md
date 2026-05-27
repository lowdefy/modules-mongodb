# Implementation Tasks — `_app` operator migration

## Overview

These tasks migrate `modules-mongodb` from a per-module `app_name` manifest var to Lowdefy's built-in `_app` operator. The implementation derives from [`designs/app-operator/design.md`](../design.md).

## Prerequisite

Both upstream Lowdefy changes from [`lowdefy-requirements.md`](../lowdefy-requirements.md) must be available in the pinned Lowdefy version before any of these tasks ship:

1. `_app` (or `_build.app`) is evaluable at build time, resolving to the values declared at the root of `lowdefy.yaml`.
2. The build fails fast when a referenced `_app: slug` would resolve to `null`.

Tasks below assume both have landed. If only (1) is available, the migration can proceed but a build-time slug guard must be re-added separately.

## Tasks

| #   | File                                                                                  | Summary                                                                       | Depends On |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| 1   | [`01-add-slug-to-demo-app-root.md`](01-add-slug-to-demo-app-root.md)                  | Add `slug: demo` and rename `name:` on `apps/demo/lowdefy.yaml`.              | —          |
| 2   | [`02-relax-events-display-key-default.md`](02-relax-events-display-key-default.md)    | Make `events.display_key` optional with default `{ _app: slug }`.             | 1          |
| 3   | [`03-migrate-contacts-module.md`](03-migrate-contacts-module.md)                      | Drop `app_name` var, swap to `_app: slug` in contacts module + demo vars.     | 1          |
| 4   | [`04-migrate-companies-module.md`](04-migrate-companies-module.md)                    | Drop `app_name` var, swap to `_app: slug` in companies module + demo vars.    | 1          |
| 5   | [`05-migrate-notifications-module.md`](05-migrate-notifications-module.md)            | Drop `app_name` var, swap to `_app: slug` in notifications + demo vars.       | 1          |
| 6   | [`06-migrate-user-account-module.md`](06-migrate-user-account-module.md)              | Drop `app_name` var, swap to `_app: slug` in user-account + demo vars.        | 1          |
| 7   | [`07-migrate-user-admin-module.md`](07-migrate-user-admin-module.md)                  | Drop `app_name`, swap to `_app: slug`, default `app_title` to `_app: name`.   | 1          |
| 8   | [`08-migrate-workflows-module.md`](08-migrate-workflows-module.md)                    | Drop `app_name`, swap to `_app: slug` incl. resolver vars + workflow-api.     | 1          |
| 9   | [`09-update-demo-events-vars.md`](09-update-demo-events-vars.md)                      | Demo `events` vars: `change_stamp.app_name: _app: slug`, drop `display_key`.  | 2          |
| 10  | [`10-migrate-demo-chrome-to-app-name.md`](10-migrate-demo-chrome-to-app-name.md)      | Home page title + layout footer read `_app: name` via Nunjucks.               | 1          |
| 11  | [`11-delete-app-config-yaml.md`](11-delete-app-config-yaml.md)                        | Delete `apps/demo/app_config.yaml` once nothing references it.                | 3, 4, 5, 6, 7, 8, 9 |
| 12  | [`12-update-repo-docs.md`](12-update-repo-docs.md)                                    | Rewrite README, `docs/idioms.md`, `CLAUDE.md` references and anchors.         | 3, 4, 5, 6, 7, 8 |
| 13  | [`13-sweep-workflows-design-docs.md`](13-sweep-workflows-design-docs.md)              | Standardise design prose to "slug" across in-flight workflows designs.        | —          |
| 14  | [`14-verify-build-and-tests.md`](14-verify-build-and-tests.md)                        | Build the demo, run lint/tests, and exercise event/notification flows.        | 11, 12     |

## Ordering Rationale

- **Task 1 is foundational.** `_app: slug` only resolves once the demo's `lowdefy.yaml` declares `slug:`. Every other task that touches module YAML, demo vars, or page chrome depends on it. Putting it first means the rest of the work runs against a build that already knows the slug.
- **Task 2 unblocks task 9.** The events manifest needs the new `display_key` default before the demo events vars file can drop its explicit setting.
- **Tasks 3–8 are independent per-module migrations.** Each migrates one module's manifest, YAML, and demo vars file. They can be implemented in parallel after task 1. They are listed in dependency-light order (smallest first, workflows last because it carries the resolver var change).
- **Task 9 finalises the demo events wiring** after tasks 2 and 3–8 land. It removes the literal `app_name:` in the change-stamp template (replaced with `{ _app: slug }`) and drops the redundant `display_key:` line.
- **Task 10 is independent display-only work** on the demo chrome — it only needs task 1's `slug`/`name` declarations.
- **Task 11 cleans up `app_config.yaml`.** It must run after every reader has migrated; tasks 3–9 each remove a reference, so 11 depends on all of them.
- **Task 12 documents the new pattern.** Idiom + README updates land after the modules they describe have actually changed.
- **Task 13 is a documentation sweep** of in-flight workflows designs. It is mechanically independent of the code migration but is part of the same PR per the design's "one canonical term" decision.
- **Task 14 verifies the full migration** end-to-end before merge.

Tasks 3–8 and 10 can run concurrently after task 1.

## Scope

**Source:** `designs/app-operator/design.md`
**Context files considered:** `designs/app-operator/lowdefy-requirements.md`
**Review files skipped:** `designs/app-operator/review/review-1.md`
