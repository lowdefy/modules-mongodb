# Task 8: Clean up the workflows-test app

## Context

`apps/workflows-test/` is the second app that mounts in-scope modules (`events`,
`notifications`, `workflows`, `companies`, `contacts`) and feeds them `app_name` via its own
`app_config.yaml` (`app_name: test`). It runs in CI e2e (the `workflows-test-e2e` job), so it
must migrate in the same PR or its build breaks — `_app: slug` is required-when-referenced, and
the hardened `makeActionPages` guard (task 2) fails loudly on an absent slug. The app declares
only `name:` today.

## Task

- `apps/workflows-test/lowdefy.yaml` — add `slug: test` (it currently declares only `name:`).
- `apps/workflows-test/modules.yaml` — drop the three inline `app_name:` entry vars (the
  companies / contacts / notifications entries that `_ref` `app_config.yaml` key `app_name`,
  lines ~11, ~43, ~51). Also remove or update the stale comment at line ~37 that narrates
  "app_name (contacts/companies)".
- `apps/workflows-test/modules/notifications/vars.yaml` — drop `app_name:`.
- `apps/workflows-test/modules/workflows/vars.yaml` — drop `app_name:`.
- `apps/workflows-test/modules/events/vars.yaml` — drop `display_key:` (now defaults to
  `{ _app: slug }`). If this file also sets `change_stamp.app_name` from `app_config.yaml`,
  rewrite that value to `{ _app: slug }` as in the demo (task 7).
- `apps/workflows-test/app_config.yaml` — delete once nothing `_ref`s it (verify with
  `git grep -n 'app_config' apps/workflows-test/`).

## Acceptance Criteria

- `apps/workflows-test/lowdefy.yaml` declares `slug: test`.
- No `app_name:` entry vars remain in `apps/workflows-test/modules.yaml`, and no `app_name:` /
  `display_key:` remain in the workflows-test module vars files (except a `change_stamp.app_name`
  stamp field whose value is now `{ _app: slug }`, if present).
- `apps/workflows-test/app_config.yaml` is deleted and `git grep app_config apps/workflows-test/`
  is empty.

## Files

- `apps/workflows-test/lowdefy.yaml` — modify — add `slug: test`
- `apps/workflows-test/modules.yaml` — modify — drop 3 `app_name` entry vars; fix comment
- `apps/workflows-test/modules/notifications/vars.yaml` — modify — drop `app_name`
- `apps/workflows-test/modules/workflows/vars.yaml` — modify — drop `app_name`
- `apps/workflows-test/modules/events/vars.yaml` — modify — drop `display_key`; stamp value → `{ _app: slug }` if present
- `apps/workflows-test/app_config.yaml` — delete — no readers remain

## Notes

- Depends on tasks 2–6 (modules must have dropped their `app_name` vars). Same PR.
- `apps/workflows-test/e2e/workflows/access-verbs.spec.js` references `app_name` — inspect it:
  if it references the stored `created.app_name` field or the `access`/data model (stored keys,
  unchanged), leave it. Only touch it if it reads a removed module var.
- This app must pass `ldf:b` alongside the demo (verified in task 11).
