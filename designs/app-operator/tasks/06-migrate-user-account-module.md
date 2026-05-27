# Task 6: Migrate the `user-account` module to `_app: slug`

## Context

`modules/user-account` declares `app_name` as a manifest var ("App name for event metadata") and reads it at 6 sites across two API endpoints and one component. The demo wires it from `app_config.yaml`.

The sites mix runtime stamp fields (writes that record `created.app_name`) and build-time event-display map key construction.

## Task

1. **Module manifest** — edit `modules/user-account/module.lowdefy.yaml`: delete the `app_name:` entry from `vars:`.

2. **Module YAML** — replace every `_module.var: app_name` with `_app: slug` in:
    - `modules/user-account/api/create-profile.yaml`
    - `modules/user-account/api/update-profile.yaml`
    - `modules/user-account/components/view_profile.yaml`

    Total: 6 occurrences (run `grep -c "_module.var: app_name" modules/user-account/**/*.yaml` to confirm).

3. **Demo vars** — edit `apps/demo/modules/user-account/vars.yaml`: delete the top-level `app_name:` block.

## Acceptance Criteria

- `grep -r "_module.var: app_name" modules/user-account/` returns no results.
- `modules/user-account/module.lowdefy.yaml` no longer declares `app_name` under `vars:`.
- `apps/demo/modules/user-account/vars.yaml` no longer declares a top-level `app_name:` key.
- `pnpm ldf:b` succeeds; the demo's user-account profile view loads; updating a profile writes an event with `created.app_name: "demo"`.

## Files

- `modules/user-account/module.lowdefy.yaml` — modify — drop `app_name` from `vars`.
- `modules/user-account/api/create-profile.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/user-account/api/update-profile.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/user-account/components/view_profile.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `apps/demo/modules/user-account/vars.yaml` — modify — delete top-level `app_name:` block.

## Notes

- Mixed build-time and runtime sites — `_app: slug` must resolve at both phases per the upstream Lowdefy requirement.
