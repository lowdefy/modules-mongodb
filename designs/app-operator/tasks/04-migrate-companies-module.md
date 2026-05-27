# Task 4: Migrate the `companies` module to `_app: slug`

## Context

`modules/companies` declares `app_name` as a manifest var ("App identifier used to key event_display titles when no override is supplied") and reads it at 2 sites — both in create/update APIs to construct event-display map keys. The demo wires it from `app_config.yaml`.

Companies has no pages or pages-side reads — the entire migration is the two API endpoints plus the manifest and demo vars.

## Task

1. **Module manifest** — edit `modules/companies/module.lowdefy.yaml`: delete the `app_name:` entry from `vars:`.

2. **Module YAML** — replace every `_module.var: app_name` with `_app: slug` in:
    - `modules/companies/api/create-company.yaml`
    - `modules/companies/api/update-company.yaml`

    Both sites are `_build.object.fromEntries` map keys; they rely on `_app: slug` evaluating at build time.

3. **Demo vars** — edit `apps/demo/modules/companies/vars.yaml`: delete the top-level `app_name:` block.

## Acceptance Criteria

- `grep -r "_module.var: app_name" modules/companies/` returns no results.
- `modules/companies/module.lowdefy.yaml` no longer declares `app_name` under `vars:`.
- `apps/demo/modules/companies/vars.yaml` no longer declares a top-level `app_name:` key.
- `pnpm ldf:b` succeeds; the demo's company create and update flows still log events that render under `display.demo.*` on the resulting documents.

## Files

- `modules/companies/module.lowdefy.yaml` — modify — drop `app_name` from `vars`.
- `modules/companies/api/create-company.yaml` — modify — `_module.var: app_name` → `_app: slug` (1 site).
- `modules/companies/api/update-company.yaml` — modify — `_module.var: app_name` → `_app: slug` (1 site).
- `apps/demo/modules/companies/vars.yaml` — modify — delete top-level `app_name:` block.

## Notes

- The stored field name `created.app_name` does not change. Only the value expression migrates.
