# Task 5: Demo cleanup — events vars, chrome, delete `app_config.yaml`

## Context

With every module reader migrated (Tasks 2–4), finish the demo app: rewrite the demo's events vars, point page chrome at `_app: name`, and delete the now-unreferenced `apps/demo/app_config.yaml`. This depends on Tasks 1–4 (the slug must exist; every demo vars file must already have dropped its `app_config.yaml` `_ref`).

## Task

### 1. Demo events vars — `apps/demo/modules/events/vars.yaml`

This file reads the slug via `_ref: { path: app_config.yaml, key: app_name }` in **two** places:

- **`display_key`** (top level) — delete the whole block. Task 1 set the events manifest default to `{ _app: slug }`, which now supplies it.
- **`change_stamp.app_name`** — change the value from `{ _ref: { path: app_config.yaml, key: app_name } }` to `{ _app: slug }`. The stamp is a runtime template, so `_app: slug` is correct.

Leave the rest of `change_stamp` (`timestamp`, `user.*`, `version.app`, `version.lowdefy` — the latter two are `_ref`s into `package.json`) **unchanged**. They're out of scope.

### 2. Demo chrome — read `_app: name`

- `apps/demo/pages/home.yaml` — change the hardcoded `title: Module Demo App` to `{ _app: name }`.
- `apps/demo/modules/layout/vars.yaml` — the footer hardcodes "Modules Demo" in an `Html` block. Render it from `_app: name`: prefer a more idiomatic block (Markdown/Title) reading `_app: name` directly per the "Prefer Lowdefy blocks over Html" rule; fall back to a `_nunjucks`-rendered HTML footer only if inline HTML is required. Neither site is inside a `_build.*` operator, so `_app: name` (not `_build.app`) is correct.

### 3. Delete `app_config.yaml`

- Run `grep -rln "app_config.yaml" apps/ modules/ docs/ README.md CLAUDE.md`. Expect zero results. (The auth adapter's `appName` read was migrated to `{ _build.app: slug }` in Task 01; the six module `vars.yaml` `_ref`s were dropped in Tasks 2–4; the two `events/vars.yaml` reads are handled in step 1 above. Nothing should remain.)
- If any reference remains, migrate it first — do not delete while a consumer reads it.
- Delete `apps/demo/app_config.yaml`.

## Acceptance Criteria

- `apps/demo/modules/events/vars.yaml` declares no top-level `display_key:`; `change_stamp.app_name` is `{ _app: slug }` and reads no file.
- `apps/demo/pages/home.yaml` title and `apps/demo/modules/layout/vars.yaml` footer source the app name from `_app: name` (no literal "Module Demo App" / "Modules Demo").
- `apps/demo/app_config.yaml` no longer exists; `grep -r "app_config.yaml" apps/ modules/ docs/ README.md CLAUDE.md` is empty.
- `pnpm ldf:b` succeeds with no `_ref` resolution errors.

## Files

- `apps/demo/modules/events/vars.yaml` — modify — drop `display_key:`; `change_stamp.app_name` → `{ _app: slug }`.
- `apps/demo/pages/home.yaml` — modify — title → `{ _app: name }`.
- `apps/demo/modules/layout/vars.yaml` — modify — footer → `_app: name`.
- `apps/demo/app_config.yaml` — delete.

## Notes

- `_app: description` has no natural site to migrate today — don't manufacture one. Task 6 documents it as available.
- Deleting `app_config.yaml` is the gate between the migrations and merge: run only after Tasks 2–4 are staged in the same PR.
