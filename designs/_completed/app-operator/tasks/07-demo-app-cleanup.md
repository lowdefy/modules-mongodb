# Task 7: Clean up the demo app

## Context

With the scoping modules no longer declaring `app_name` (tasks 2–6), the demo app must stop
passing it. The demo already declares `slug: demo` and `name: Module Demo App` on
`apps/demo/lowdefy.yaml`. The `apps/demo/app_config.yaml` file exists solely to single-source
`app_name` across the per-module vars files via `_ref`; once its last reader is migrated it is
deleted (design §Delete `app_config.yaml`). This task also migrates the two display-name
chrome sites to `_app: name`.

## Task

**Per-module demo vars files** — remove the `app_name:` entry (each is a `_ref` into
`app_config.yaml`) from:

- `apps/demo/modules/activities/vars.yaml`
- `apps/demo/modules/companies/vars.yaml`
- `apps/demo/modules/contacts/vars.yaml`
- `apps/demo/modules/notifications/vars.yaml`
- `apps/demo/modules/workflows/vars.yaml`

**`apps/demo/modules/events/vars.yaml`** (reads `app_config.yaml` twice):

- Drop the top-level `display_key:` block entirely (it `_ref`s `app_config.yaml` key `app_name`
  and now equals the slug via the new `events.display_key` default `{ _app: slug }`).
- Rewrite `change_stamp.app_name` from the `_ref` into `app_config.yaml` to `{ _app: slug }`
  (a runtime template — `_app: slug` resolves per request). Keep the stamp field named
  `app_name` (stored field).
- Leave `change_stamp.version` (a `_ref` into `package.json`) untouched.

**`apps/demo/app_config.yaml`** — delete once nothing `_ref`s it (verify with
`git grep -n 'app_config' apps/demo/`).

**Display-name chrome → `_app: name`:**

- `apps/demo/pages/home.yaml:6` — `title: Module Demo App` → `title: { _app: name }`.
- `apps/demo/modules/layout/vars.yaml` — the footer HTML hardcodes the app name (`Modules
Demo`). Render it from `_app: name` (via Nunjucks, per the repo's Nunjucks-over-Html+`_js`
  rule).

## Acceptance Criteria

- No `app_name:` or `_ref` to `app_config.yaml` remains in any `apps/demo/modules/*/vars.yaml`.
- `apps/demo/modules/events/vars.yaml` has no `display_key`, and `change_stamp.app_name` is
  `{ _app: slug }`.
- `apps/demo/app_config.yaml` is deleted and `git grep app_config apps/demo/` is empty.
- Home page title and layout footer render the app display name via `_app: name`.

## Files

- `apps/demo/modules/activities/vars.yaml` — modify — remove `app_name`
- `apps/demo/modules/companies/vars.yaml` — modify — remove `app_name`
- `apps/demo/modules/contacts/vars.yaml` — modify — remove `app_name`
- `apps/demo/modules/notifications/vars.yaml` — modify — remove `app_name`
- `apps/demo/modules/workflows/vars.yaml` — modify — remove `app_name`
- `apps/demo/modules/events/vars.yaml` — modify — drop `display_key`; `change_stamp.app_name` → `{ _app: slug }`
- `apps/demo/app_config.yaml` — delete — no readers remain
- `apps/demo/pages/home.yaml` — modify — `title` → `{ _app: name }`
- `apps/demo/modules/layout/vars.yaml` — modify — footer app name via `_app: name` (Nunjucks)

## Notes

- Depends on tasks 2–6: the modules must have dropped their `app_name` vars, or the demo build
  fails on an undeclared var. All in the same PR.
- Do not touch `apps/demo/modules/user-admin/vars.yaml` — its `app_title` var is out of scope
  for this migration (design §Adjacent vars that are NOT the same value).
