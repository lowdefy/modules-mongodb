# Task 3: Migrate the `contacts` module to `_app: slug`

## Context

`modules/contacts` declares `app_name` as a manifest var ("App identifier for is_user guard and per-app access flags") and reads it at 5 sites across create/update APIs and the edit/view pages. The demo wires it from `app_config.yaml`.

This task drops the manifest var, swaps every `_module.var: app_name` occurrence to `_app: slug`, and removes the corresponding demo vars entry. After this task, the contacts module relies entirely on the root `slug:` declared in `apps/demo/lowdefy.yaml` (task 1).

## Task

1. **Module manifest** — edit `modules/contacts/module.lowdefy.yaml`: delete the `app_name:` entry from `vars:`.

2. **Module YAML** — in each of the files below, replace every `_module.var: app_name` with `_app: slug`:
    - `modules/contacts/api/update-contact.yaml`
    - `modules/contacts/api/create-contact.yaml`
    - `modules/contacts/pages/view.yaml`
    - `modules/contacts/pages/edit.yaml`

    Per the design, expect 5 occurrences across these files (run `grep -c "_module.var: app_name" modules/contacts/**/*.yaml` to confirm). Two of these sites construct event-display map keys via `_build.object.fromEntries`; they need `_app: slug` to evaluate at build time (covered by the upstream Lowdefy requirement).

3. **Demo vars** — edit `apps/demo/modules/contacts/vars.yaml`: delete the top-level `app_name:` block (the `_ref` into `app_config.yaml`).

## Acceptance Criteria

- `grep -r "_module.var: app_name" modules/contacts/` returns no results.
- `modules/contacts/module.lowdefy.yaml` no longer declares `app_name` under `vars:`.
- `apps/demo/modules/contacts/vars.yaml` no longer declares a top-level `app_name:` key.
- `pnpm ldf:b` succeeds; the demo's contacts pages render without errors.
- Creating and updating a contact writes `created.app_name: "demo"` on the resulting events and the contact document — same value the old wiring produced.

## Files

- `modules/contacts/module.lowdefy.yaml` — modify — drop `app_name` from `vars`.
- `modules/contacts/api/update-contact.yaml` — modify — `_module.var: app_name` → `_app: slug` (2 sites).
- `modules/contacts/api/create-contact.yaml` — modify — `_module.var: app_name` → `_app: slug` (1 site).
- `modules/contacts/pages/view.yaml` — modify — `_module.var: app_name` → `_app: slug` (1 site).
- `modules/contacts/pages/edit.yaml` — modify — `_module.var: app_name` → `_app: slug` (1 site).
- `apps/demo/modules/contacts/vars.yaml` — modify — delete top-level `app_name:` block.

## Notes

- One of the sites in `create-contact.yaml` and `update-contact.yaml` is a `_build.object.fromEntries` key. Those rely on `_app` resolving at build time per the upstream Lowdefy requirement in `lowdefy-requirements.md` §Requirement 1.
- Do not touch the inline `app_name` field on `created.{}` stamps — that is a stored MongoDB field name and stays as the literal string `app_name`. Only the *value* expression changes.
